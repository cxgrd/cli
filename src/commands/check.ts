import { resolve } from 'path';
import { CgDirectory } from '../cg-directory';
import chalk from 'chalk';

export interface CheckResult {
  passed: boolean;
  issues: CheckIssue[];
  summary: string;
}

interface CheckIssue {
  severity: 'error' | 'warning' | 'info';
  message: string;
  file?: string;
  line?: number;
}

export async function checkCommand(projectPath?: string): Promise<void> {
  const rootPath = resolve(projectPath || process.cwd());

  console.log(chalk.blue('✓ Running architectural checks...'));

  try {
    const cgDir = new CgDirectory(rootPath);
    const graph = await cgDir.readGraph();
    const arch = await cgDir.readArch();
    const history = await cgDir.readHistory();

    if (!graph) {
      console.error(chalk.red('✗ No dependency graph found. Run "cxgrd scan" first.'));
      process.exit(1);
    }

    const result = performChecks(graph, arch, history);

    if (result.passed) {
      console.log(chalk.green('✓ All checks passed!'));
      console.log(chalk.gray(`   ${result.summary}`));
    } else {
      console.log(chalk.red('✗ Some issues found:'));
      for (const issue of result.issues) {
        const color = issue.severity === 'error' ? chalk.red : issue.severity === 'warning' ? chalk.yellow : chalk.blue;
        console.log(color(`   [${issue.severity.toUpperCase()}] ${issue.message}`));
        if (issue.file) {
          console.log(chalk.gray(`          at ${issue.file}${issue.line ? `:${issue.line}` : ''}`));
        }
      }
    }

    // Save check result to history
    const historyEntry = {
      timestamp: Date.now(),
      type: 'check',
      passed: result.passed,
      issueCount: result.issues.length,
    };

    history.push(historyEntry);
    await cgDir.writeHistory(history);

    if (!result.passed) {
      process.exit(1);
    }
  } catch (err: any) {
    console.error(chalk.red(`✗ Error: ${err.message}`));
    process.exit(1);
  }
}

function performChecks(graph: any, arch: any, history: any[]): CheckResult {
  const issues: CheckIssue[] = [];

  // Check 1: Circular dependencies
  const circularDeps = findCircularDependencies(graph);
  for (const cycle of circularDeps) {
    issues.push({
      severity: 'error',
      message: `Circular dependency detected: ${cycle.join(' → ')}`,
    });
  }

  // Check 2: Orphaned files
  const orphanedFiles = findOrphanedFiles(graph);
  for (const file of orphanedFiles.slice(0, 5)) {
    issues.push({
      severity: 'warning',
      message: `Orphaned file: ${file}`,
      file,
    });
  }

  // Check 3: Architecture violations
  const violations = findArchitectureViolations(graph, arch);
  for (const violation of violations.slice(0, 5)) {
    issues.push({
      severity: 'warning',
      message: violation.message,
      file: violation.file,
    });
  }

  // Check 4: Unused imports
  const unusedImports = findUnusedImports(graph);
  for (const unused of unusedImports.slice(0, 3)) {
    issues.push({
      severity: 'info',
      message: `Potentially unused import: ${unused}`,
    });
  }

  return {
    passed: issues.filter(i => i.severity === 'error').length === 0,
    issues,
    summary: `Found ${issues.filter(i => i.severity === 'error').length} errors, ${issues.filter(i => i.severity === 'warning').length} warnings`,
  };
}

function findCircularDependencies(graph: any): string[][] {
  const cycles: string[][] = [];
  const visited = new Set<string>();
  const recursionStack = new Set<string>();

  function dfs(node: string, path: string[]): boolean {
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
    return false;
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

  return allFiles.filter(f => !referenced.has(f) && !referencers.has(f));
}

function findArchitectureViolations(graph: any, arch: any): Array<{ message: string; file: string }> {
  const violations: Array<{ message: string; file: string }> = [];

  // Simple heuristic: util files shouldn't import from service files
  const utilFiles = arch?.layers?.util || [];
  const serviceFiles = arch?.layers?.service || [];

  for (const utilFile of utilFiles) {
    const node = graph.files?.[utilFile];
    if (node?.dependencies) {
      for (const dep of node.dependencies) {
        if (serviceFiles.some((sf: string) => dep.to.includes(sf))) {
          violations.push({
            message: `Util layer file imports from service layer`,
            file: utilFile,
          });
        }
      }
    }
  }

  return violations;
}

function findUnusedImports(graph: any): string[] {
  // This is a simplified check - in reality you'd need AST analysis
  const unused: string[] = [];

  for (const [filePath, node] of Object.entries(graph.files || {})) {
    const fileNode = node as any;
    const content = graph.files?.[filePath]?.content;

    // This is a placeholder - real implementation would need proper analysis
    if (fileNode.dependencies?.length > 20) {
      unused.push(`${filePath} (many imports: ${fileNode.dependencies.length})`);
    }
  }

  return unused;
}
