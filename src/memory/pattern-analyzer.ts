import type { CgPatternsFile, GraphDiffSummary, ImportHubPattern } from './types';

interface GraphFileNode {
  dependencies?: Array<{ to: string; type?: string }>;
}

export function diffGraphs(
  previous: { files?: Record<string, GraphFileNode> } | null,
  current: { files?: Record<string, GraphFileNode> },
): GraphDiffSummary {
  const prevFiles = new Set(Object.keys(previous?.files || {}));
  const currentFiles = current.files ?? {};
  const currFiles = new Set(Object.keys(currentFiles));

  const filesAdded = [...currFiles].filter((f) => !prevFiles.has(f));
  const filesRemoved = [...prevFiles].filter((f) => !currFiles.has(f));

  let dependencyChanges = 0;
  if (previous?.files) {
    for (const path of currFiles) {
      if (!prevFiles.has(path)) continue;
      const oldDeps = (previous.files[path]?.dependencies || []).map((d) => d.to).sort().join(',');
      const newDeps = (currentFiles[path]?.dependencies || []).map((d) => d.to).sort().join(',');
      if (oldDeps !== newDeps) dependencyChanges++;
    }
  }

  return {
    scannedAt: Date.now(),
    filesAdded,
    filesRemoved,
    dependencyChanges,
  };
}

export function analyzePatterns(
  graph: { files?: Record<string, GraphFileNode> },
  previousPatterns: CgPatternsFile | null,
  graphDiff: GraphDiffSummary | null,
): CgPatternsFile {
  const targetToImporters = new Map<string, Set<string>>();

  for (const [filePath, node] of Object.entries(graph.files || {})) {
    for (const dep of node.dependencies || []) {
      if (!dep.to || dep.to.startsWith('.')) {
        const set = targetToImporters.get(dep.to) || new Set();
        set.add(filePath);
        targetToImporters.set(dep.to, set);
      }
    }
  }

  const importHubs: ImportHubPattern[] = [];
  for (const [target, importers] of targetToImporters) {
    if (importers.size < 3) continue;
    importHubs.push({
      target,
      importers: [...importers].slice(0, 20),
      count: importers.size,
      description: `${importers.size} files import ${target}`,
    });
  }

  importHubs.sort((a, b) => b.count - a.count);

  return {
    version: 1,
    lastUpdated: Date.now(),
    importHubs: importHubs.slice(0, 30),
    layerCounts: previousPatterns?.layerCounts || {},
    lastGraphDiff: graphDiff || undefined,
  };
}
