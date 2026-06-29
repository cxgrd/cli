import { resolve } from 'path';
import { CgDirectory } from '../cg-directory';
import chalk from 'chalk';
import { runCheck } from '../check/check-runner';
import { resolveScopeFiles } from '../check/scope';
import type { CheckScope } from '../check/types';
import { resolveActiveSession } from '../auth/auth-session';
import { recordAuditEventIfTeam } from '../team/audit';
import {
  checkFreeAuditLimit,
  incrementAuditCount,
  printAuditUsageStatus,
  AuditUsageExceededError,
} from '../auth/audit-usage';
import { postCiCheckResult } from '../team/cloud-client';
import { trackEvent } from '../telemetry';
import { execSync } from 'child_process';
import { BlastRadiusAnalyzer } from '../utils/blast-radius-analyzer';

export interface CheckCommandOptions {
  scope?: CheckScope;
  skipStructural?: boolean;
  skipCompiler?: boolean;
  strict?: boolean;
  // --ci: post result to server so GitHub commit status gets updated,
  //       and exit 1 strictly on any issue (no interactive prompts)
  ci?: boolean;
}

export async function checkCommand(
  projectPath?: string,
  options: CheckCommandOptions = {},
): Promise<void> {
  const rootPath = resolve(projectPath || process.cwd());
  const scope = options.scope ?? 'all';
  const isCi = options.ci ?? false;

  console.log(chalk.blue('✓ Running cxgrd check...'));
  if (scope !== 'all') console.log(chalk.gray(`   Scope: ${scope} files only`));
  if (options.strict) console.log(chalk.gray('   Mode: strict (skipped compilers fail the check)'));
  if (isCi) console.log(chalk.gray('   Mode: CI (results posted to server for PR status)'));

  try {
    const session = await resolveActiveSession();

    // --ci requires team plan so we can post the result back
    if (isCi) {
      if (!session) {
        console.error(chalk.red('\n✗ --ci requires authentication. Run: cxgrd auth login'));
        process.exit(1);
      }
      if (session.plan !== 'team') {
        console.error(chalk.red('\n✗ --ci requires a Team plan. Upgrade at https://cxgrd.com/pricing'));
        process.exit(1);
      }
      if (!session.orgId) {
        console.error(chalk.red('\n✗ --ci: no team found on your account. Ask your team owner to invite you.'));
        process.exit(1);
      }
    }

    if (!session || session.plan === 'free') {
      try {
        await checkFreeAuditLimit();
      } catch (err) {
        if (err instanceof AuditUsageExceededError) {
          console.error(chalk.red(`\n✗ ${err.message}`));
          process.exit(1);
        }
        throw err;
      }
    }

    const cgDir = new CgDirectory(rootPath);
    const graph = await cgDir.readGraph();
    const arch  = await cgDir.readArch();
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
      skipCompiler:   options.skipCompiler   ?? false,
      strict:         options.strict         ?? false,
    });

    printCompilerSummary(result.compilerSummary);

    if (!options.strict && result.skippedLanguages.length > 0) {
      console.log(chalk.yellow(`   ⚠ Skipped compiler(s) for: ${result.skippedLanguages.join(', ')} — not counted as failures.`));
      console.log(chalk.yellow('     Use --strict or run `cxgrd doctor` to fix your toolchain.'));
    }

    if (result.passed) {
      console.log(chalk.green('✓ All checks passed!'));
      console.log(chalk.gray(`   ${result.summary}`));
    } else {
      console.log(chalk.red('✗ Issues found:'));
      for (const issue of result.issues) {
        const color =
          issue.severity === 'error'   ? chalk.red :
          issue.severity === 'warning' ? chalk.yellow : chalk.blue;
        const tag = issue.source === 'compiler' ? 'compiler' : 'structural';
        console.log(color(`   [${issue.severity.toUpperCase()}][${tag}] ${issue.message}`));
        if (issue.file) {
          const loc  = issue.line ? `:${issue.line}` : '';
          const code = issue.code ? ` (${issue.code})` : '';
          console.log(chalk.gray(`          at ${issue.file}${loc}${code}`));
        }
      }
      console.log(chalk.gray(`   ${result.summary}`));
    }

    if (!session || session.plan === 'free') {
      await incrementAuditCount();
      await printAuditUsageStatus();
    }

    const historyEntry = {
      timestamp: Date.now(),
      type: 'check',
      scope,
      strict:     options.strict ?? false,
      passed:     result.passed,
      issueCount: result.issues.length,
      errorCount: result.issues.filter(i => i.severity === 'error').length,
      compiler:   result.compilerSummary,
    };

    history.push(historyEntry);
    await cgDir.writeHistory(history);
    await cgDir.writeCheckResult({
      timestamp: historyEntry.timestamp,
      passed:    result.passed,
      scope,
      issues:    result.issues,
      compiler:  result.compilerSummary,
      summary:   result.summary,
    });

    await recordAuditEventIfTeam(session, rootPath, {
      eventType: 'check',
      passed:    result.passed,
      summary:   result.summary,
      metadata:  { issueCount: result.issues.length, scope, strict: options.strict ?? false, ci: isCi },
    });

    // ── CI mode: post result to server so GitHub commit status is updated ─────
    // CI mode: post result to server so GitHub commit status is updated
    if (isCi && session?.orgId) {
      const gitRef = await resolveGitSha(rootPath);
      const repoId = rootPath.split(/[/\\\\]/).pop() ?? 'unknown';

      const changedFiles = execSync('git diff --name-only origin/main...HEAD')
        .toString().trim().split('\n').filter(Boolean);

      // graph is already in scope from above — no need to re-read
      const analyzer = new BlastRadiusAnalyzer(graph);
      // no description in CI — file-path classification handles it
      const blastResult = analyzer.analyze(changedFiles);

      postCiCheckResult(session, {
        repoId,
        gitRef,
        changedFiles,
        blastRadius:   blastResult.totalRisk,
        impactedFiles: blastResult.affectedFiles,
        riskLevel:     blastResult.riskLevel,
        passed:        result.passed,
        issueCount:    result.issues.length,
        errorCount:    result.issues.filter(i => i.severity === 'error').length,
        summary:       result.summary,
      }).catch(err => {
        console.warn(chalk.yellow(`   ⚠ Could not post CI result to server: ${err.message}`));
      });
    }

    trackEvent('cli_check', { scope, strict: !!options.strict, ci: isCi, passed: result.passed });

    // In CI mode, exit 1 on any failure — no exceptions
    if (!result.passed) {
      if (isCi) {
        console.error(chalk.red('\n✗ CI check failed — blocking merge.'));
      }
      process.exit(1);
    }
  } catch (err: unknown) {
    const message = err instanceof Error ? err.message : String(err);
    console.error(chalk.red(`✗ Error: ${message}`));
    process.exit(1);
  }
}

async function resolveGitSha(rootPath: string): Promise<string> {
  try {
    const { execSync } = await import('child_process');
    return execSync('git rev-parse HEAD', { cwd: rootPath, stdio: 'pipe' }).toString().trim();
  } catch {
    return `local-${Date.now()}`;
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
      console.log(chalk.gray(`     · ${s.language} (${s.tool} @ ${s.projectRoot}): skipped — ${s.skipReason}`));
      continue;
    }
    const status = s.passed ? chalk.green('ok') : chalk.red('failed');
    console.log(
      chalk.gray(`     · ${s.language} (${s.tool} @ ${s.projectRoot}): `) +
      status +
      chalk.gray(` — ${s.errorCount} errors, ${s.warningCount} warnings`),
    );
  }
}
