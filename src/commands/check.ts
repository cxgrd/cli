import { resolve } from 'path';
import { CgDirectory } from '../cg-directory';
import chalk from 'chalk';
import { runCheck } from '../check/check-runner';
import { resolveScopeFiles } from '../check/scope';
import type { CheckScope } from '../check/types';

export interface CheckCommandOptions {
  scope?: CheckScope;
  skipStructural?: boolean;
  skipCompiler?: boolean;
  strict?: boolean;
}

export async function checkCommand(
  projectPath?: string,
  options: CheckCommandOptions = {},
): Promise<void> {
  const rootPath = resolve(projectPath || process.cwd());
  const scope = options.scope ?? 'all';

  console.log(chalk.blue('✓ Running cxgrd check...'));
  if (scope !== 'all') {
    console.log(chalk.gray(`   Scope: ${scope} files only`));
  }
  if (options.strict) {
    console.log(chalk.gray('   Mode: strict (skipped compilers fail the check)'));
  }

  try {
    const cgDir = new CgDirectory(rootPath);
    const graph = await cgDir.readGraph();
    const arch = await cgDir.readArch();
    const history = await cgDir.readHistory();

    if (!graph) {
      console.error(chalk.red('✗ No dependency graph found. Run "cxgrd scan" first.'));
      process.exit(1);
    }

    const scopeFiles = scope === 'all' ? null : resolveScopeFiles(rootPath, scope);

    if (scopeFiles && scopeFiles.size === 0) {
      console.log(chalk.yellow('   No files in scope — skipping checks.'));
      return;
    }

    console.log(chalk.gray('   Structural analysis...'));
    if (!options.skipCompiler) {
      console.log(chalk.gray('   Compiler verification (TypeScript, Python, Rust)...'));
    }

    const result = await runCheck(graph, arch, {
      projectPath: rootPath,
      scope,
      skipStructural: options.skipStructural ?? false,
      skipCompiler: options.skipCompiler ?? false,
      strict: options.strict ?? false,
    });

    printCompilerSummary(result.compilerSummary);

    if (!options.strict && result.skippedLanguages.length > 0) {
      console.log(
        chalk.yellow(
          `   ⚠ Skipped compiler(s) for: ${result.skippedLanguages.join(', ')} — not counted as failures.`,
        ),
      );
      console.log(
        chalk.yellow('     Use --strict or run `cxgrd doctor` to fix your toolchain.'),
      );
    }

    if (result.passed) {
      console.log(chalk.green('✓ All checks passed!'));
      console.log(chalk.gray(`   ${result.summary}`));
    } else {
      console.log(chalk.red('✗ Issues found:'));
      for (const issue of result.issues) {
        const color =
          issue.severity === 'error'
            ? chalk.red
            : issue.severity === 'warning'
              ? chalk.yellow
              : chalk.blue;
        const tag = issue.source === 'compiler' ? 'compiler' : 'structural';
        console.log(
          color(`   [${issue.severity.toUpperCase()}][${tag}] ${issue.message}`),
        );
        if (issue.file) {
          const loc = issue.line ? `:${issue.line}` : '';
          const code = issue.code ? ` (${issue.code})` : '';
          console.log(chalk.gray(`          at ${issue.file}${loc}${code}`));
        }
      }
      console.log(chalk.gray(`   ${result.summary}`));
    }

    const historyEntry = {
      timestamp: Date.now(),
      type: 'check',
      scope,
      strict: options.strict ?? false,
      passed: result.passed,
      issueCount: result.issues.length,
      errorCount: result.issues.filter((i) => i.severity === 'error').length,
      compiler: result.compilerSummary,
    };

    history.push(historyEntry);
    await cgDir.writeHistory(history);
    await cgDir.writeCheckResult({
      timestamp: historyEntry.timestamp,
      passed: result.passed,
      scope,
      issues: result.issues,
      compiler: result.compilerSummary,
      summary: result.summary,
    });

    if (!result.passed) {
      process.exit(1);
    }
  } catch (err: unknown) {
    const message = err instanceof Error ? err.message : String(err);
    console.error(chalk.red(`✗ Error: ${message}`));
    process.exit(1);
  }
}

function printCompilerSummary(
  summaries: Array<{
    language: string;
    tool: string;
    projectRoot: string;
    passed: boolean;
    errorCount: number;
    warningCount: number;
    skipped: boolean;
    skipReason?: string;
  }>,
): void {
  if (summaries.length === 0) return;

  console.log(chalk.gray('   Compiler runs:'));
  for (const s of summaries) {
    if (s.skipped) {
      console.log(
        chalk.gray(`     · ${s.language} (${s.tool} @ ${s.projectRoot}): skipped — ${s.skipReason}`),
      );
      continue;
    }
    const status = s.passed ? chalk.green('ok') : chalk.red('failed');
    console.log(
      chalk.gray(
        `     · ${s.language} (${s.tool} @ ${s.projectRoot}): `,
      ) +
        status +
        chalk.gray(` — ${s.errorCount} errors, ${s.warningCount} warnings`),
    );
  }
}
