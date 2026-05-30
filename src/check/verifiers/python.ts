import { relative } from 'path';
import type { CheckIssue, CompilerRunSummary } from '../types';
import type { PythonProject } from '../project-tooling';
import { commandExists, runCommand } from '../run-command';
import { parsePyrightJson } from '../parsers/pyright';

export async function verifyPythonProject(
  project: PythonProject,
  projectRoot: string,
): Promise<{ issues: CheckIssue[]; summary: CompilerRunSummary }> {
  const relRoot = relative(projectRoot, project.rootDir) || '.';

  const hasPyright = await commandExists('pyright');
  if (!hasPyright) {
    return {
      issues: [],
      summary: {
        language: 'python',
        tool: 'pyright',
        projectRoot: relRoot,
        passed: true,
        errorCount: 0,
        warningCount: 0,
        skipped: true,
        skipReason: 'pyright not found on PATH (install with: pip install pyright)',
      },
    };
  }

  const args = ['--outputjson'];
  if (project.configPath) {
    args.push(project.configPath);
  }

  const result = await runCommand('pyright', args, project.rootDir);
  const issues = parsePyrightJson(result.stdout || result.stderr);

  const errorCount = issues.filter((i) => i.severity === 'error').length;
  const warningCount = issues.filter((i) => i.severity === 'warning').length;

  return {
    issues,
    summary: {
      language: 'python',
      tool: 'pyright',
      projectRoot: relRoot,
      passed: errorCount === 0,
      errorCount,
      warningCount,
      skipped: false,
    },
  };
}
