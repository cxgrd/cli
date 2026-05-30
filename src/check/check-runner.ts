import type { CheckIssue, CheckOptions, CheckResult } from './types';
import { runStructuralChecks } from './structural-checks';
import { runCompilerChecks } from './compiler-service';
import { filterIssuesByScope, resolveScopeFiles } from './scope';
import { collectStrictModeIssues, getSkippedLanguagesInScope } from './strict-mode';
import { getCompilerLanguagesInScope } from '../toolchain/project-languages';

export async function runCheck(
  graph: any,
  arch: any,
  options: CheckOptions,
): Promise<CheckResult> {
  const scopeFiles = resolveScopeFiles(options.projectPath, options.scope);
  const issues: CheckIssue[] = [];

  if (!options.skipStructural) {
    const structural = runStructuralChecks(graph, arch);
    issues.push(...filterIssuesByScope(structural, scopeFiles, options.projectPath));
  }

  let compilerSummary: CheckResult['compilerSummary'] = [];

  let skippedLanguages: ReturnType<typeof getSkippedLanguagesInScope> = [];

  if (!options.skipCompiler) {
    const { issues: compilerIssues, summaries } = await runCompilerChecks(
      options.projectPath,
      scopeFiles,
    );
    issues.push(...compilerIssues);
    compilerSummary = summaries;

    const languagesInScope = await getCompilerLanguagesInScope(
      options.projectPath,
      scopeFiles,
    );
    skippedLanguages = getSkippedLanguagesInScope(compilerSummary, languagesInScope);

    if (options.strict) {
      issues.push(...collectStrictModeIssues(compilerSummary, languagesInScope));
    }
  }

  const errors = issues.filter((i) => i.severity === 'error');
  const warnings = issues.filter((i) => i.severity === 'warning');
  const structuralErrors = errors.filter((i) => i.source === 'structural').length;
  const compilerErrors = errors.filter((i) => i.source === 'compiler').length;

  const scopeLabel =
    options.scope === 'all'
      ? 'full project'
      : options.scope === 'staged'
        ? 'staged files'
        : 'changed files';

  const strictNote = options.strict ? 'strict' : 'permissive';

  return {
    passed: errors.length === 0,
    issues,
    compilerSummary,
    skippedLanguages,
    summary: [
      `Scope: ${scopeLabel}`,
      `Mode: ${strictNote}`,
      `${errors.length} errors (${structuralErrors} structural, ${compilerErrors} compiler)`,
      `${warnings.length} warnings`,
    ].join(' · '),
  };
}
