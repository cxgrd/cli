/**
 * Enhanced Blast Radius Analyzer
 * 
 * Determines what breaks when you change a file:
 * - Direct impact (files that import/depend on the changed file)
 * - Transitive impact (files that depend on the dependent files)
 * - Severity scoring (high/medium/low based on multiple factors)
 * - Change classification (what type of change is it)
 */

export interface ChangeType {
  type: 'function' | 'class' | 'type' | 'export' | 'import' | 'schema' | 'config' | 'unknown';
  description: string;
  confidence: number; // 0-1
}

export interface ImpactedFile {
  path: string;
  reason: string;
  severity: 'critical' | 'high' | 'medium' | 'low';
  distance: number; // 1 = direct, 2+ = transitive
  impactType: 'direct' | 'transitive' | 'potential';
  changeRequired: boolean;
  suggestedFix?: string;
}

export interface BlastRadiusResult {
  directlyAffected: number;
  transitivelyAffected: number;
  potentiallyAffected: number;
  totalRisk: number; // 0-100
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
  imports?: string[];
  exports?: string[];
}

interface DependencyGraph {
  files: Record<string, FileNode>;
  stats: any;
}

export class BlastRadiusAnalyzer {
  private graph: DependencyGraph;
  private reverseGraph: Map<string, Set<string>> = new Map(); // file -> files that depend on it

  constructor(graph: DependencyGraph) {
    this.graph = graph;
    this.buildReverseGraph();
  }

  /**
   * Build reverse dependency graph for quick lookups
   */
  private buildReverseGraph(): void {
    for (const [filePath, node] of Object.entries(this.graph.files || {})) {
      for (const dep of node.dependencies || []) {
        if (!this.reverseGraph.has(dep.to)) {
          this.reverseGraph.set(dep.to, new Set());
        }
        this.reverseGraph.get(dep.to)!.add(filePath);
      }
    }
  }

  /**
   * Analyze impact of changing specific files
   */
  analyze(changedFiles: string[]): BlastRadiusResult {
    const affected = new Map<string, ImpactedFile>();
    const visited = new Set<string>();

    // Find all impacted files recursively
    for (const file of changedFiles) {
      this.findImpactedFiles(file, 1, affected, visited);
    }

    // Classify changes and calculate severity
    const changeTypes = this.classifyChanges(changedFiles);
    const impactedArray = Array.from(affected.values());
    const severityMap = this.calculateSeverities(impactedArray, changeTypes);

    // Update severities
    impactedArray.forEach(file => {
      file.severity = severityMap.get(file.path) || 'low';
    });

    // Calculate overall risk
    const result = this.aggregateResults(impactedArray, changeTypes);

    return result;
  }

  /**
   * Recursively find all files impacted by a change
   */
  private findImpactedFiles(
    file: string,
    depth: number,
    affected: Map<string, ImpactedFile>,
    visited: Set<string>,
    maxDepth: number = 5
  ): void {
    if (visited.has(file) || depth > maxDepth) return;
    visited.add(file);

    // Find files that depend on the current file
    const dependents = this.reverseGraph.get(file) || new Set();

    for (const dependent of dependents) {
      if (!affected.has(dependent)) {
        affected.set(dependent, {
          path: dependent,
          reason: this.generateReason(file, dependent),
          severity: 'medium', // Will be recalculated
          distance: depth,
          impactType: depth === 1 ? 'direct' : 'transitive',
          changeRequired: true,
        });
      }

      // Recursively find transitive dependencies
      if (depth < 3) {
        this.findImpactedFiles(dependent, depth + 1, affected, visited, maxDepth);
      }
    }
  }

  /**
   * Generate human-readable reason for impact
   */
  private generateReason(from: string, to: string): string {
    const fromName = from.split('/').pop() || from;
    const toName = to.split('/').pop() || to;
    return `Depends on ${fromName}`;
  }

  /**
   * Classify the type of change being made
   */
  private classifyChanges(changedFiles: string[]): ChangeType[] {
    const changes: ChangeType[] = [];
    const keywords = {
      function: ['function', 'method', 'handler', 'callback'],
      class: ['class', 'interface', 'type', 'abstract'],
      export: ['export', 'default export'],
      schema: ['schema', 'model', 'entity', 'database'],
      config: ['config', 'settings', '.env', 'constants'],
    };

    for (const file of changedFiles) {
      const fileContent = file.toLowerCase();
      let matchedType: 'function' | 'class' | 'type' | 'export' | 'import' | 'schema' | 'config' = 'unknown' as any;
      let confidence = 0.3;

      // Heuristic classification based on file path and content hints
      if (fileContent.includes('schema') || fileContent.includes('model')) {
        matchedType = 'schema';
        confidence = 0.8;
      } else if (fileContent.includes('config') || fileContent.includes('const')) {
        matchedType = 'config';
        confidence = 0.8;
      } else if (fileContent.includes('service') || fileContent.includes('handler')) {
        matchedType = 'function';
        confidence = 0.6;
      } else if (fileContent.includes('component') || fileContent.includes('util')) {
        matchedType = 'class';
        confidence = 0.5;
      } else {
        matchedType = 'unknown' as any;
        confidence = 0.3;
      }

      changes.push({
        type: matchedType,
        description: `${matchedType} change detected`,
        confidence,
      });
    }

    return changes;
  }

  /**
   * Calculate severity for each impacted file based on multiple factors
   */
  private calculateSeverities(
    files: ImpactedFile[],
    changeTypes: ChangeType[]
  ): Map<string, 'critical' | 'high' | 'medium' | 'low'> {
    const severities = new Map<string, 'critical' | 'high' | 'medium' | 'low'>();

    for (const file of files) {
      let score = 0; // 0-100

      // Factor 1: Distance (closer = higher severity)
      score += (4 - file.distance) * 20; // 0-80 points

      // Factor 2: Impact type
      if (file.impactType === 'direct') score += 15;
      else if (file.impactType === 'transitive') score += 5;

      // Factor 3: File importance heuristics
      if (this.isImportantFile(file.path)) score += 10;

      // Factor 4: Change confidence from classification
      const avgChangeConfidence = changeTypes.length > 0
        ? changeTypes.reduce((sum, c) => sum + c.confidence, 0) / changeTypes.length
        : 0.5;
      score += avgChangeConfidence * 20;

      // Determine severity level
      if (score >= 80) severities.set(file.path, 'critical');
      else if (score >= 60) severities.set(file.path, 'high');
      else if (score >= 40) severities.set(file.path, 'medium');
      else severities.set(file.path, 'low');
    }

    return severities;
  }

  /**
   * Heuristics to identify important files
   */
  private isImportantFile(path: string): boolean {
    const important = [
      'index',
      'main',
      'app',
      'core',
      'api',
      'server',
      'middleware',
      'auth',
      'schema',
    ];

    const lowerPath = path.toLowerCase();
    return important.some(keyword => lowerPath.includes(keyword));
  }

  /**
   * Aggregate results and generate recommendations
   */
  private aggregateResults(files: ImpactedFile[], changeTypes: ChangeType[]): BlastRadiusResult {
    const critical = files.filter(f => f.severity === 'critical').length;
    const high = files.filter(f => f.severity === 'high').length;
    const medium = files.filter(f => f.severity === 'medium').length;
    const low = files.filter(f => f.severity === 'low').length;

    // Calculate overall risk (0-100)
    let totalRisk = critical * 25 + high * 15 + medium * 8 + low * 2;
    totalRisk = Math.min(100, totalRisk / Math.max(1, files.length) + files.length * 2);

    // Determine risk level
    let riskLevel: 'critical' | 'high' | 'medium' | 'low' = 'low';
    if (totalRisk >= 75) riskLevel = 'critical';
    else if (totalRisk >= 50) riskLevel = 'high';
    else if (totalRisk >= 25) riskLevel = 'medium';

    // Generate recommendations
    const recommendations = this.generateRecommendations(
      files,
      changeTypes,
      riskLevel
    );

    const direct = files.filter(f => f.distance === 1).length;
    const transitive = files.filter(f => f.distance > 1).length;

    return {
      directlyAffected: direct,
      transitivelyAffected: transitive,
      potentiallyAffected: 0,
      totalRisk: Math.round(totalRisk),
      riskLevel,
      affectedFiles: files.sort((a, b) => {
        const severityOrder = { critical: 0, high: 1, medium: 2, low: 3 };
        return (severityOrder[a.severity] || 4) - (severityOrder[b.severity] || 4);
      }),
      changeTypes,
      recommendations,
    };
  }

  /**
   * Generate actionable recommendations based on analysis
   */
  private generateRecommendations(
    files: ImpactedFile[],
    changeTypes: ChangeType[],
    riskLevel: string
  ): string[] {
    const recommendations: string[] = [];

    // Critical files
    const criticalFiles = files.filter(f => f.severity === 'critical');
    if (criticalFiles.length > 0) {
      recommendations.push(
        `⚠️  ${criticalFiles.length} critical files impacted. Review these carefully:`
      );
    }

    // Change type specific recommendations
    for (const change of changeTypes) {
      if (change.type === 'schema') {
        recommendations.push('📊 Schema change detected: Update database migrations and models');
      } else if (change.type === 'export') {
        recommendations.push('📤 Export change detected: Update all imports in affected files');
      } else if (change.type === 'config') {
        recommendations.push('⚙️  Configuration change: Verify environment variables across deployment');
      }
    }

    // Risk-level recommendations
    if (riskLevel === 'critical' || riskLevel === 'high') {
      recommendations.push('🚨 Consider writing additional tests for affected modules');
      recommendations.push('🔍 Run full test suite before deploying');
    } else if (riskLevel === 'medium') {
      recommendations.push('✓ Run tests for directly affected modules');
    }

    // Hotfix recommendations
    if (files.length > 15) {
      recommendations.push(`💡 Large blast radius (${files.length} files). Consider breaking change into smaller PRs`);
    }

    if (recommendations.length === 0) {
      recommendations.push('✓ Low risk change. Proceed with caution.');
    }

    return recommendations;
  }

  /**
   * Detailed analysis for a specific file
   */
  analyzeFile(filePath: string): any {
    const node = this.graph.files[filePath];
    if (!node) return null;

    const dependsOn = node.dependencies || [];
    const dependedOnBy = Array.from(this.reverseGraph.get(filePath) || []);

    return {
      path: filePath,
      language: node.language,
      dependsOn,
      dependedOnBy,
      symbols: node.symbols || [],
      riskScore: dependedOnBy.length * 2 + dependsOn.length,
    };
  }
}
