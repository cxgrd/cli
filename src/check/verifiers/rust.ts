import { relative } from 'path';
import type { CheckIssue, CompilerRunSummary } from '../types';
import type { RustWorkspace } from '../project-tooling';
import { commandExists, runCommand } from '../run-command';
import { parseCargoJsonLines } from '../parsers/cargo';

export async function verifyRustWorkspace(
  workspace: RustWorkspace,
  projectRoot: string,
): Promise<{ issues: CheckIssue[]; summary: CompilerRunSummary }> {
  const relRoot = relative(projectRoot, workspace.rootDir) || '.';

  const hasCargo = await commandExists('cargo');
  if (!hasCargo) {
    return {
      issues: [],
      summary: {
        language: 'rust',
        tool: 'cargo',
        projectRoot: relRoot,
        passed: true,
        errorCount: 0,
        warningCount: 0,
        skipped: true,
        skipReason: 'cargo not found on PATH',
      },
    };
  }

  const result = await runCommand(
    'cargo',
    ['check', '--message-format=json'],
    workspace.rootDir,
    300_000,
  );

  const issues = parseCargoJsonLines(`${result.stdout}\n${result.stderr}`);
  const errorCount = issues.filter((i) => i.severity === 'error').length;
  const warningCount = issues.filter((i) => i.severity === 'warning').length;

  return {
    issues,
    summary: {
      language: 'rust',
      tool: 'cargo check',
      projectRoot: relRoot,
      passed: errorCount === 0,
      errorCount,
      warningCount,
      skipped: false,
    },
  };
}
