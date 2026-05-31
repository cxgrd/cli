import { BlastRadiusAnalyzer } from '../utils/blast-radius-analyzer';
import { ChangeDetector } from '../utils/change-detector';

export interface PromptSubgraph {
  changeDescription: string;
  seedFiles: string[];
  affectedFiles: Array<{ path: string; severity: string; reason: string; distance: number }>;
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
): PromptSubgraph {
  const filePaths = Object.keys(graph.files || {});
  const detector = new ChangeDetector(projectRoot);
  const gitChanges = detector.getChangedFiles();
  const descriptionMatch = detector.parseDescription(changeDescription, filePaths);

  const seedFiles = [
    ...new Set([...gitChanges.files, ...descriptionMatch.files]),
  ].slice(0, 15);

  const analyzer = new BlastRadiusAnalyzer(graph as ConstructorParameters<typeof BlastRadiusAnalyzer>[0]);
  const blast = analyzer.analyze(seedFiles);

  const affectedSet = new Set<string>();
  const dependencies: Array<{ from: string; to: string; type: string }> = [];

  for (const af of blast.affectedFiles.slice(0, 25)) {
    affectedSet.add(af.path);
  }
  for (const seed of seedFiles) {
    affectedSet.add(seed);
  }

  const relevantSymbols: Record<string, string[]> = {};
  for (const path of affectedSet) {
    if (symbols[path]?.length) {
      relevantSymbols[path] = symbols[path].slice(0, 15);
    }
    const node = graph.files?.[path] as { dependencies?: Array<{ from: string; to: string; type: string }> };
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
    affectedFiles: blast.affectedFiles.slice(0, 25).map((f) => ({
      path: f.path,
      severity: f.severity,
      reason: f.reason,
      distance: f.distance,
    })),
    dependencies: dependencies.slice(0, 40),
    symbols: relevantSymbols,
    architectureLayers: arch?.layers || {},
    riskLevel: blast.riskLevel,
    recommendations: blast.recommendations.slice(0, 6),
  };
}

export function serializeSubgraphForLlm(
  subgraph: PromptSubgraph,
  repoMemoryBlock: string,
): string {
  const parts: string[] = [
    `# Change request\n${subgraph.changeDescription}`,
    `\n## Blast radius (${subgraph.riskLevel} risk)`,
    `Seed files: ${subgraph.seedFiles.length ? subgraph.seedFiles.join(', ') : '(inferred from description)'}`,
  ];

  if (subgraph.affectedFiles.length) {
    parts.push('\n### Affected files');
    for (const f of subgraph.affectedFiles) {
      parts.push(`- [${f.severity}] ${f.path} — ${f.reason} (depth ${f.distance})`);
    }
  }

  if (subgraph.dependencies.length) {
    parts.push('\n### Dependency edges (subgraph)');
    for (const d of subgraph.dependencies.slice(0, 25)) {
      parts.push(`- ${d.from} → ${d.to} (${d.type})`);
    }
  }

  const symbolEntries = Object.entries(subgraph.symbols);
  if (symbolEntries.length) {
    parts.push('\n### Symbols in affected modules');
    for (const [file, syms] of symbolEntries.slice(0, 12)) {
      parts.push(`- ${file}: ${syms.join(', ')}`);
    }
  }

  const layers = Object.entries(subgraph.architectureLayers);
  if (layers.length) {
    parts.push('\n### Architecture layers');
    for (const [layer, files] of layers) {
      parts.push(`- ${layer}: ${(files as string[]).length} files`);
    }
  }

  if (subgraph.recommendations.length) {
    parts.push('\n### Analyzer recommendations');
    for (const r of subgraph.recommendations) {
      parts.push(`- ${r}`);
    }
  }

  if (repoMemoryBlock.trim()) {
    parts.push('\n' + repoMemoryBlock);
  }

  return parts.join('\n');
}
