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

  /**
   * Normalize an import string to possible file paths.
   * Python: "app.oauth"  → ["app/oauth.py", "app/oauth/__init__.py"]
   * JS/TS:  "./utils/auth" → ["utils/auth.ts", "utils/auth.js", ...]
   */
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

  /**
   * Build reverse dependency graph.
   * Stores both raw import strings AND normalized file paths so lookups
   * work regardless of whether the caller uses "app.oauth" or "app/oauth.py".
   */
  private buildReverseGraph(): void {
    for (const [filePath, node] of Object.entries(this.graph.files || {})) {
      for (const dep of node.dependencies || []) {
        // Raw key (e.g. "app.oauth")
        if (!this.reverseGraph.has(dep.to)) {
          this.reverseGraph.set(dep.to, new Set());
        }
        this.reverseGraph.get(dep.to)!.add(filePath);

        // Normalized file-path keys (e.g. "app/oauth.py")
        const normalized = this.normalizeImportToFilePath(dep.to, node.language);
        for (const candidate of normalized) {
          if (!this.reverseGraph.has(candidate)) {
            this.reverseGraph.set(candidate, new Set());
          }
          this.reverseGraph.get(candidate)!.add(filePath);
        }
      }
    }
  }

  analyze(changedFiles: string[]): BlastRadiusResult {
    const affected = new Map<string, ImpactedFile>();
    const visited = new Set<string>();

    for (const file of changedFiles) {
      this.findImpactedFiles(file, 1, affected, visited);
    }

    const changeTypes = this.classifyChanges(changedFiles);
    const impactedArray = Array.from(affected.values());
    const severityMap = this.calculateSeverities(impactedArray, changeTypes);

    impactedArray.forEach(file => {
      file.severity = severityMap.get(file.path) || 'low';
    });

    return this.aggregateResults(impactedArray, changeTypes);
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

  private classifyChanges(changedFiles: string[]): ChangeType[] {
    const changes: ChangeType[] = [];

    for (const file of changedFiles) {
      const f = file.toLowerCase();
      let type: ChangeType['type'] = 'unknown';
      let confidence = 0.3;

      if (f.includes('schema') || f.includes('model')) { type = 'schema'; confidence = 0.8; }
      else if (f.includes('config') || f.includes('const')) { type = 'config'; confidence = 0.8; }
      else if (f.includes('service') || f.includes('handler')) { type = 'function'; confidence = 0.6; }
      else if (f.includes('component') || f.includes('util')) { type = 'class'; confidence = 0.5; }

      changes.push({ type, description: `${type} change detected`, confidence });
    }

    return changes;
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
      else if (c.type === 'export') recs.push('📤 Export change: update all imports in affected files');
      else if (c.type === 'config') recs.push('⚙️  Config change: verify environment variables across deployments');
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
