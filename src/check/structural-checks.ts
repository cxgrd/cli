import type { CheckIssue } from './types';

export function runStructuralChecks(graph: any, arch: any): CheckIssue[] {
  const issues: CheckIssue[] = [];

  const circularDeps = findCircularDependencies(graph);
  for (const cycle of circularDeps) {
    issues.push({
      severity: 'error',
      message: `Circular dependency detected: ${cycle.join(' → ')}`,
      source: 'structural',
    });
  }

  const orphanedFiles = findOrphanedFiles(graph);
  for (const file of orphanedFiles.slice(0, 5)) {
    issues.push({
      severity: 'warning',
      message: `Orphaned file: ${file}`,
      file,
      source: 'structural',
    });
  }

  const violations = findArchitectureViolations(graph, arch);
  for (const violation of violations.slice(0, 5)) {
    issues.push({
      severity: 'warning',
      message: violation.message,
      file: violation.file,
      source: 'structural',
    });
  }

  const unusedImports = findUnusedImports(graph);
  for (const unused of unusedImports.slice(0, 3)) {
    issues.push({
      severity: 'info',
      message: `Potentially unused import: ${unused}`,
      source: 'structural',
    });
  }

  return issues;
}

function findCircularDependencies(graph: any): string[][] {
  const cycles: string[][] = [];
  const visited = new Set<string>();
  const recursionStack = new Set<string>();

  function dfs(node: string, path: string[]): void {
    visited.add(node);
    recursionStack.add(node);
    path.push(node);

    const fileNode = graph.files?.[node];
    if (fileNode?.dependencies) {
      for (const dep of fileNode.dependencies) {
        if (recursionStack.has(dep.to)) {
          const cycleStart = path.indexOf(dep.to);
          cycles.push(path.slice(cycleStart).concat([dep.to]));
        } else if (!visited.has(dep.to)) {
          dfs(dep.to, path);
        }
      }
    }

    path.pop();
    recursionStack.delete(node);
  }

  for (const file of Object.keys(graph.files || {})) {
    if (!visited.has(file)) {
      dfs(file, []);
    }
  }

  return cycles;
}

function findOrphanedFiles(graph: any): string[] {
  const allFiles = Object.keys(graph.files || {});
  const referenced = new Set<string>();
  const referencers = new Set<string>();

  for (const [filePath, node] of Object.entries(graph.files || {})) {
    const fileNode = node as any;
    referencers.add(filePath);

    for (const dep of fileNode.dependencies || []) {
      referenced.add(dep.to);
    }
  }

  return allFiles.filter((f) => !referenced.has(f) && !referencers.has(f));
}

function findArchitectureViolations(
  graph: any,
  arch: any,
): Array<{ message: string; file: string }> {
  const violations: Array<{ message: string; file: string }> = [];
  const utilFiles = arch?.layers?.util || [];
  const serviceFiles = arch?.layers?.service || [];

  for (const utilFile of utilFiles) {
    const node = graph.files?.[utilFile];
    if (node?.dependencies) {
      for (const dep of node.dependencies) {
        if (serviceFiles.some((sf: string) => dep.to.includes(sf))) {
          violations.push({
            message: 'Util layer file imports from service layer',
            file: utilFile,
          });
        }
      }
    }
  }

  return violations;
}

function findUnusedImports(graph: any): string[] {
  const unused: string[] = [];

  for (const [filePath, node] of Object.entries(graph.files || {})) {
    const fileNode = node as any;
    if (fileNode.dependencies?.length > 20) {
      unused.push(`${filePath} (many imports: ${fileNode.dependencies.length})`);
    }
  }

  return unused;
}
