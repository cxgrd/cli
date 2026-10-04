import { BlastRadiusAnalyzer } from '../utils/blast-radius-analyzer';
import { ChangeDetector } from '../utils/change-detector';
import type { ImpactedFile } from '../utils/blast-radius-analyzer';

export interface PromptSubgraph {
  changeDescription: string;
  seedFiles: string[];
  affectedFiles: Array<Pick<ImpactedFile,
    'path' | 'severity' | 'reason' | 'distance' | 'impactType' | 'changeRequired' | 'suggestedFix'
  >>;
  dependencies: Array<{ from: string; to: string; type: string }>;
  symbols: Record<string, string[]>;
  architectureLayers: Record<string, string[]>;
  riskLevel: string;
  recommendations: string[];
}

export function buildPromptSubgraph(
  changeDescription: string,
  graph: { files?: Record<string, unknown> },
  symbols: Record<string, string[]>,
  arch: { layers?: Record<string, string[]> } | null,
  projectRoot: string,
  // Pre-solved files from `cxgrd input` — skips broad re-resolution when provided
  preSolvedFiles?: string[],
): PromptSubgraph {
  const filePaths = Object.keys(graph.files || {});

  let seedFiles: string[];

  if (preSolvedFiles && preSolvedFiles.length > 0) {
    // Use files already resolved by blast radius analysis
    // Filter to only files that exist in the current graph (cwd-scoped)
    seedFiles = preSolvedFiles
      .filter(f => filePaths.includes(f) || filePaths.some(p => p.endsWith(f) || f.endsWith(p)))
      .slice(0, 15);
  } else {
    // Fallback: resolve from description + git staged files
    // Filter strictly to files inside the graph (cwd-scoped) to avoid
    // pulling in files from unrelated projects
    const detector = new ChangeDetector(projectRoot);
    const gitChanges = detector.getChangedFiles();
    const descriptionMatch = detector.parseDescription(changeDescription, filePaths);

    seedFiles = [
      ...new Set([...gitChanges.files, ...descriptionMatch.files]),
    ]
      // Only keep files that are actually in this project's graph
      .filter(f => filePaths.includes(f))
      .slice(0, 15);
  }

  const analyzer = new BlastRadiusAnalyzer(
    graph as ConstructorParameters<typeof BlastRadiusAnalyzer>[0],
  );
  const blast = analyzer.analyze(seedFiles, changeDescription);

  const affectedSet = new Set<string>();
  const dependencies: Array<{ from: string; to: string; type: string }> = [];

  // Only include affected files that are in this project's graph
  for (const af of blast.affectedFiles.slice(0, 25)) {
    if (filePaths.includes(af.path)) {
      affectedSet.add(af.path);
    }
  }
  for (const seed of seedFiles) {
    affectedSet.add(seed);
  }

  const relevantSymbols: Record<string, string[]> = {};
  for (const path of affectedSet) {
    if (symbols[path]?.length) {
      relevantSymbols[path] = symbols[path].slice(0, 15);
    }
    const node = graph.files?.[path] as {
      dependencies?: Array<{ from: string; to: string; type: string }>;
    };
    if (node?.dependencies) {
      for (const dep of node.dependencies.slice(0, 8)) {
        dependencies.push({
          from: dep.from || path,
          to: dep.to,
          type: dep.type || 'import',
        });
      }
    }
  }

  return {
    changeDescription,
    seedFiles,
    affectedFiles: blast.affectedFiles
      .filter(f => filePaths.includes(f.path))
      .slice(0, 25)
      .map(f => ({
        path: f.path,
        severity: f.severity,
        reason: f.reason,
        distance: f.distance,
        impactType: f.impactType,
        changeRequired: f.changeRequired,
        suggestedFix: f.suggestedFix,
      })),
    dependencies: dependencies.slice(0, 40),
    symbols: relevantSymbols,
    architectureLayers: arch?.layers || {},
    riskLevel: blast.riskLevel,
    recommendations: blast.recommendations.slice(0, 6),
  };
}
