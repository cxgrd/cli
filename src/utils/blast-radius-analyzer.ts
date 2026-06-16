export interface ChangeType {
  type: 'function' | 'class' | 'type' | 'export' | 'import' | 'schema' | 'config' | 'unknown';
  description: string;
  confidence: number;
}

export interface ImpactedFile {
  path: string;
  reason: string;
  severity: 'critical' | 'high' | 'medium' | 'low';
  distance: number;
  impactType: 'direct' | 'transitive' | 'potential';
  changeRequired: boolean;
  suggestedFix?: string;
}

export interface BlastRadiusResult {
  directlyAffected: number;
  transitivelyAffected: number;
  potentiallyAffected: number;
  totalRisk: number;
  riskLevel: 'critical' | 'high' | 'medium' | 'low';
  affectedFiles: ImpactedFile[];
  changeTypes: ChangeType[];
  recommendations: string[];
}

interface FileNode {
  path: string;
  language: string;
  dependencies: Array<{ to: string; type: string }>;
  symbols: string[];
}

interface DependencyGraph {
  files: Record<string, FileNode>;
  stats: any;
}

export class BlastRadiusAnalyzer {
  private graph: DependencyGraph;
  private reverseGraph: Map<string, Set<string>> = new Map();

  constructor(graph: DependencyGraph) {
    this.graph = graph;
    this.buildReverseGraph();
  }

  private normalizeImportToFilePath(importPath: string, language: string): string[] {
    const candidates: string[] = [];

    if (language === 'python') {
      const slashPath = importPath.replace(/\./g, '/');
      candidates.push(`${slashPath}.py`);
      candidates.push(`${slashPath}/__init__.py`);
    } else {
      const clean = importPath.replace(/^\.\.?\//, '');
      candidates.push(
        `${clean}.ts`, `${clean}.tsx`, `${clean}.js`, `${clean}.jsx`,
        `${clean}/index.ts`, `${clean}/index.js`,
      );
    }

    return candidates;
  }

  private buildReverseGraph(): void {
    for (const [filePath, node] of Object.entries(this.graph.files || {})) {
      for (const dep of node.dependencies || []) {
        // Raw key
        if (!this.reverseGraph.has(dep.to)) this.reverseGraph.set(dep.to, new Set());
        this.reverseGraph.get(dep.to)!.add(filePath);

        // Normalized file-path keys
        for (const candidate of this.normalizeImportToFilePath(dep.to, node.language)) {
          if (!this.reverseGraph.has(candidate)) this.reverseGraph.set(candidate, new Set());
          this.reverseGraph.get(candidate)!.add(filePath);
        }
      }
    }
  }

  analyze(changedFiles: string[], description?: string): BlastRadiusResult {
    const affected = new Map<string, ImpactedFile>();
    const visited = new Set<string>();

    for (const file of changedFiles) {
      // Try the path as-is first, then try suffix-matching against graph keys
      const resolvedKeys = this.resolveToGraphKeys(file);
      for (const key of resolvedKeys) {
        this.findImpactedFiles(key, 1, affected, visited);
      }
    }

    const changeTypes = this.classifyChanges(changedFiles, description);
    const impactedArray = Array.from(affected.values());
    const severityMap = this.calculateSeverities(impactedArray, changeTypes);

    impactedArray.forEach(file => {
      file.severity = severityMap.get(file.path) || 'low';
    });

    return this.aggregateResults(impactedArray, changeTypes);
  }

  /**
   * Resolve an input file path to actual keys in the reverse graph.
   * Input paths from the CLI may be absolute or relative with different roots
   * than what the graph was built from. We do a suffix match so that:
   *   "cli/src/utils/blast-radius-analyzer.ts"
   * matches a graph key like:
   *   "src/utils/blast-radius-analyzer.ts"
   */
  private resolveToGraphKeys(inputPath: string): string[] {
    // Normalize separators
    const normalized = inputPath.replace(/\\/g, '/');

    // Exact match
    if (this.reverseGraph.has(normalized)) return [normalized];

    // Suffix match against all reverse graph keys
    const matches: string[] = [];
    for (const key of this.reverseGraph.keys()) {
      const normalizedKey = key.replace(/\\/g, '/');
      if (normalized.endsWith(normalizedKey) || normalizedKey.endsWith(normalized)) {
        matches.push(key);
      }
    }
    if (matches.length > 0) return matches;

    // Also try matching just the filename (last segment) as a last resort
    const filename = normalized.split('/').pop() ?? '';
    const filenameMatches: string[] = [];
    for (const key of this.reverseGraph.keys()) {
      if (key.split('/').pop() === filename) {
        filenameMatches.push(key);
      }
    }

    return filenameMatches.length > 0 ? filenameMatches : [normalized];
  }

  private findImpactedFiles(
    file: string,
    depth: number,
    affected: Map<string, ImpactedFile>,
    visited: Set<string>,
    maxDepth: number = 5,
  ): void {
    if (visited.has(file) || depth > maxDepth) return;
    visited.add(file);

    const dependents = this.reverseGraph.get(file) || new Set();

    for (const dependent of dependents) {
      if (!affected.has(dependent)) {
        affected.set(dependent, {
          path: dependent,
          reason: `Depends on ${file.split('/').pop() || file}`,
          severity: 'medium',
          distance: depth,
          impactType: depth === 1 ? 'direct' : 'transitive',
          changeRequired: true,
        });
      }

      if (depth < 3) {
        this.findImpactedFiles(dependent, depth + 1, affected, visited, maxDepth);
      }
    }
  }

  /**
   * Classify changes using both file paths AND the change description.
   * Description gives us intent (refactoring, renaming, adding export, etc.)
   * File paths give us structural hints (schema, config, service, etc.)
   */
  private classifyChanges(changedFiles: string[], description?: string): ChangeType[] {
    const changes: ChangeType[] = [];
    const desc = (description ?? '').toLowerCase();

    // ── Description-level classification (applies once across all files) ──────
    if (desc) {
      if (desc.match(/\b(rename|renaming|renamed)\b/)) {
        changes.push({ type: 'export', description: 'Rename — all import sites will need updating', confidence: 0.85 });
      }
      if (desc.match(/\b(refactor|refactoring|restructur)\b/)) {
        changes.push({ type: 'class', description: 'Refactor — internal structure change', confidence: 0.75 });
      }
      if (desc.match(/\b(add|adding|new)\s+(export|function|method|class)\b/)) {
        changes.push({ type: 'export', description: 'New export added', confidence: 0.8 });
      }
      if (desc.match(/\b(remov|delet|drop)\b/)) {
        changes.push({ type: 'export', description: 'Removal — dependents may break', confidence: 0.9 });
      }
      if (desc.match(/\b(type|interface|generic)\b/)) {
        changes.push({ type: 'type', description: 'Type/interface change', confidence: 0.8 });
      }
      if (desc.match(/\b(import|dependency|depend)\b/)) {
        changes.push({ type: 'import', description: 'Import/dependency change', confidence: 0.75 });
      }
      if (desc.match(/\b(schema|migrat|model|table|column)\b/)) {
        changes.push({ type: 'schema', description: 'Schema/model change', confidence: 0.9 });
      }
      if (desc.match(/\b(config|env|environment|setting)\b/)) {
        changes.push({ type: 'config', description: 'Config/env change', confidence: 0.85 });
      }
    }

    // ── Per-file structural classification ────────────────────────────────────
    for (const file of changedFiles) {
      const f = file.toLowerCase().replace(/\\/g, '/');
      const filename = f.split('/').pop() ?? f;
      let type: ChangeType['type'] = 'unknown';
      let confidence = 0.3;
      let description_text = 'unknown change detected';

      if (filename.includes('schema') || filename.includes('model') || filename.includes('migration')) {
        type = 'schema'; confidence = 0.85;
        description_text = 'Schema/model file changed';
      } else if (filename.includes('config') || filename.includes('.env') || filename.includes('constants')) {
        type = 'config'; confidence = 0.85;
        description_text = 'Config file changed';
      } else if (filename.includes('types') || filename.includes('interfaces') || filename.includes('.d.ts')) {
        type = 'type'; confidence = 0.8;
        description_text = 'Type definition file changed';
      } else if (filename.includes('index')) {
        type = 'export'; confidence = 0.75;
        description_text = 'Index/barrel file changed — affects all consumers';
      } else if (filename.includes('service') || filename.includes('handler') || filename.includes('controller')) {
        type = 'function'; confidence = 0.65;
        description_text = 'Service/handler changed';
      } else if (filename.includes('component') || filename.includes('hook') || filename.includes('widget')) {
        type = 'class'; confidence = 0.6;
        description_text = 'UI component changed';
      } else if (filename.includes('util') || filename.includes('helper') || filename.includes('lib')) {
        type = 'function'; confidence = 0.6;
        description_text = 'Utility/helper changed — check all consumers';
      } else if (filename.includes('analyzer') || filename.includes('parser') || filename.includes('builder')) {
        type = 'class'; confidence = 0.65;
        description_text = 'Core processing class changed';
      } else if (filename.includes('route') || filename.includes('router') || filename.includes('api')) {
        type = 'function'; confidence = 0.7;
        description_text = 'API route changed';
      }

      // Only add if it adds something beyond what description-level already captured
      if (type !== 'unknown' || changes.length === 0) {
        changes.push({ type, description: description_text, confidence });
      }
    }

    // Deduplicate — keep highest confidence per type
    const best = new Map<string, ChangeType>();
    for (const c of changes) {
      const existing = best.get(c.type);
      if (!existing || c.confidence > existing.confidence) best.set(c.type, c);
    }

    return Array.from(best.values()).sort((a, b) => b.confidence - a.confidence);
  }

  private calculateSeverities(
    files: ImpactedFile[],
    changeTypes: ChangeType[],
  ): Map<string, 'critical' | 'high' | 'medium' | 'low'> {
    const severities = new Map<string, 'critical' | 'high' | 'medium' | 'low'>();
    const avgConfidence = changeTypes.length > 0
      ? changeTypes.reduce((s, c) => s + c.confidence, 0) / changeTypes.length
      : 0.5;

    for (const file of files) {
      let score = (4 - Math.min(file.distance, 3)) * 20;
      if (file.impactType === 'direct') score += 15;
      else if (file.impactType === 'transitive') score += 5;
      if (this.isImportantFile(file.path)) score += 10;
      score += avgConfidence * 20;

      if (score >= 80) severities.set(file.path, 'critical');
      else if (score >= 60) severities.set(file.path, 'high');
      else if (score >= 40) severities.set(file.path, 'medium');
      else severities.set(file.path, 'low');
    }

    return severities;
  }

  private isImportantFile(path: string): boolean {
    const important = ['index', 'main', 'app', 'core', 'api', 'server', 'middleware', 'auth', 'schema'];
    return important.some(k => path.toLowerCase().includes(k));
  }

  private aggregateResults(files: ImpactedFile[], changeTypes: ChangeType[]): BlastRadiusResult {
    const critical = files.filter(f => f.severity === 'critical').length;
    const high = files.filter(f => f.severity === 'high').length;
    const medium = files.filter(f => f.severity === 'medium').length;
    const low = files.filter(f => f.severity === 'low').length;

    let totalRisk = critical * 25 + high * 15 + medium * 8 + low * 2;
    totalRisk = Math.min(100, totalRisk / Math.max(1, files.length) + files.length * 2);

    let riskLevel: 'critical' | 'high' | 'medium' | 'low' = 'low';
    if (totalRisk >= 75) riskLevel = 'critical';
    else if (totalRisk >= 50) riskLevel = 'high';
    else if (totalRisk >= 25) riskLevel = 'medium';

    const recommendations = this.generateRecommendations(files, changeTypes, riskLevel);
    const direct = files.filter(f => f.distance === 1).length;
    const transitive = files.filter(f => f.distance > 1).length;

    return {
      directlyAffected: direct,
      transitivelyAffected: transitive,
      potentiallyAffected: 0,
      totalRisk: Math.round(totalRisk),
      riskLevel,
      affectedFiles: files.sort((a, b) => {
        const order = { critical: 0, high: 1, medium: 2, low: 3 };
        return (order[a.severity] ?? 4) - (order[b.severity] ?? 4);
      }),
      changeTypes,
      recommendations,
    };
  }

  private generateRecommendations(
    files: ImpactedFile[],
    changeTypes: ChangeType[],
    riskLevel: string,
  ): string[] {
    const recs: string[] = [];

    const criticalFiles = files.filter(f => f.severity === 'critical');
    if (criticalFiles.length > 0) {
      recs.push(`⚠️  ${criticalFiles.length} critical file(s) impacted — review carefully`);
    }

    for (const c of changeTypes) {
      if (c.type === 'schema') recs.push('📊 Schema change: update database migrations and models');
      else if (c.type === 'export') recs.push('📤 Export/rename change: update all import sites in affected files');
      else if (c.type === 'config') recs.push('⚙️  Config change: verify environment variables across deployments');
      else if (c.type === 'type') recs.push('🔷 Type change: check all usages for type compatibility');
    }

    if (riskLevel === 'critical' || riskLevel === 'high') {
      recs.push('🚨 Write additional tests for affected modules');
      recs.push('🔍 Run full test suite before deploying');
    } else if (riskLevel === 'medium') {
      recs.push('✓ Run tests for directly affected modules');
    }

    if (files.length > 15) {
      recs.push(`💡 Large blast radius (${files.length} files) — consider smaller PRs`);
    }

    if (recs.length === 0) recs.push('✓ Low risk change. Proceed with caution.');

    return recs;
  }

  analyzeFile(filePath: string): any {
    const node = this.graph.files[filePath];
    if (!node) return null;
    return {
      path: filePath,
      language: node.language,
      dependsOn: node.dependencies || [],
      dependedOnBy: Array.from(this.reverseGraph.get(filePath) || []),
      symbols: node.symbols || [],
    };
  }
}
