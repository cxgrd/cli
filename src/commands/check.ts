import { resolve } from 'path';
import { CgDirectory } from '../cg-directory';
import chalk from 'chalk';
import { runCheck } from '../check/check-runner';
import { resolveScopeFiles } from '../check/scope';
import type { CheckScope, CheckResult } from '../check/types';
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
import {resolveRepoFullName, resolveGitSha} from '../utils/git';

export interface CheckCommandOptions {
  scope?: CheckScope;
  skipStructural?: boolean;
  skipCompiler?: boolean;
  strict?: boolean;
  ci?: boolean;
  json?: boolean;
}

function makeLogger(json: boolean) {
  return {
    log: (msg: string) => { if (!json) console.log(msg); },
    error: (msg: string, error_code?: string) => { 
      if (!json) {
        console.error(msg, error_code)
      }; 
    },
    warn: (msg: string) => { if (!json) console.warn(msg); },
  };
}

function exitJson(json: boolean, error: string, code: string): never {
  if (json) {
    console.log(JSON.stringify({ error, code }));
  } else {
    console.error(chalk.red(`\n✗ ${error}`));
  }
  process.exit(1);
}


export async function checkCommand(
  projectPath?: string,
  options: CheckCommandOptions = {},
): Promise<CheckResult> {
  const out = makeLogger(!!options.json);
  const json = !!options.json;

  const rootPath = resolve(projectPath || process.cwd());
  const scope = options.scope ?? 'all';
  const isCi = options.ci ?? false;

  out.log(chalk.blue('✓ Running cxgrd check...'));
  if (scope !== 'all') out.log(chalk.gray(`   Scope: ${scope} files only`));
  if (options.strict) out.log(chalk.gray('   Mode: strict (skipped compilers fail the check)'));
  if (isCi) out.log(chalk.gray('   Mode: CI (results posted to server for PR status)'));

  try {
    const session = await resolveActiveSession();

    // --ci requires team plan so we can post the result back
    if (isCi) {
      if (!session) {
        exitJson(json, '--ci requires authentication. Run: cxgrd auth login', 'NOT_AUTHENTICATED');
      }
      if (session.plan !== 'team') {
        exitJson(json, '--ci requires a Team plan. Upgrade at https://www.cxgrd.com/pricing', 'PLAN_REQUIRED');
      }
      if (!session.orgId) {
        exitJson(json, '--ci: no team found on your account. Ask your team owner to invite you.', 'NO_TEAM');
      }
    }

    if (!session || session.plan === 'free') {
      try {
        await checkFreeAuditLimit();
      } catch (err) {
        if (err instanceof AuditUsageExceededError) {
          exitJson(json, err.message, 'AUDIT_LIMIT_EXCEEDED');
        }
        throw err;
      }
    }

    const cgDir = new CgDirectory(rootPath);
    const graph = await cgDir.readGraph();
    const arch  = await cgDir.readArch();
    const history = await cgDir.readHistory();

    const err_code = 'NO_GRAPH';
    if (!graph) {
      exitJson(json, '✗ No dependency graph found. Run "cxgrd scan" first.', err_code);
    }

    const scopeFiles = scope === 'all' ? null : resolveScopeFiles(rootPath, scope);
    if (scopeFiles && scopeFiles.size === 0) {
      exitJson(json, '   No files in scope — skipping checks.', 'NO_FILES_IN_SCOPE');
    }

    out.log(chalk.gray('   Structural analysis...'));
    if (!options.skipCompiler) {
      out.log(chalk.gray('   Compiler verification (TypeScript, Python, Rust)...'));
    }

    const result = await runCheck(graph, arch, {
      projectPath: rootPath,
      scope,
      skipStructural: options.skipStructural ?? false,
      skipCompiler:   options.skipCompiler   ?? false,
      strict:         options.strict         ?? false,
    });

    printCompilerSummary(result.compilerSummary, { json: options.json });

    if (!options.strict && result.skippedLanguages.length > 0) {
      out.log(chalk.yellow(`   ⚠ Skipped compiler(s) for: ${result.skippedLanguages.join(', ')} — not counted as failures.`));
      out.log(chalk.yellow('     Use --strict or run `cxgrd doctor` to fix your toolchain.'));
    }

    if (result.passed) {
      out.log(chalk.green('✓ All checks passed!'));
      out.log(chalk.gray(`   ${result.summary}`));
    } else {
      out.log(chalk.red('✗ Issues found:'));
      for (const issue of result.issues) {
        const color =
          issue.severity === 'error'   ? chalk.red :
          issue.severity === 'warning' ? chalk.yellow : chalk.blue;
        const tag = issue.source === 'compiler' ? 'compiler' : 'structural';
        out.log(color(`   [${issue.severity.toUpperCase()}][${tag}] ${issue.message}`));
        if (issue.file) {
          const loc  = issue.line ? `:${issue.line}` : '';
          const code = issue.code ? ` (${issue.code})` : '';
          out.log(chalk.gray(`          at ${issue.file}${loc}${code}`));
        }
      }
      out.log(chalk.gray(`   ${result.summary}`));
    }

    if (!session || session.plan === 'free') {
      await incrementAuditCount();
      await printAuditUsageStatus(json);
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

    const gitRef = await resolveGitSha(rootPath);
    const repoId = await resolveRepoFullName(rootPath);

    const changedFiles = execSync('git diff --name-only origin/main...HEAD')
      .toString().trim().split('\n').filter(Boolean);

    // graph is already in scope from above — no need to re-read
    const analyzer = new BlastRadiusAnalyzer(graph);
    // no description in CI — file-path classification handles it
    const blastResult = analyzer.analyze(changedFiles);

    if (isCi && session?.orgId) {
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
        out.warn(chalk.yellow(`   ⚠ Could not post CI result to server: ${err.message}`));
      });
    }

    trackEvent('cli_check', { scope, strict: !!options.strict, ci: isCi, passed: result.passed });

    result.blastResult = blastResult;
    if (json) {
      console.log(JSON.stringify(result));
    }

    // In CI mode, exit 1 on any failure — no exceptions
    if (!result.passed) {
      if (isCi) {
        out.error(chalk.red('\n✗ CI check failed — blocking merge.'));
      }
      process.exit(1);
    }

    return result;
    
  } catch (err: unknown) {
    const message = err instanceof Error ? err.message : String(err);
    out.error(chalk.red(`✗ Error: ${message}`));
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
  }>, options: CheckCommandOptions = {}
): void {
  const out = makeLogger(!!options.json);

  if (summaries.length === 0) return;
  out.log(chalk.gray('   Compiler runs:'));
  for (const s of summaries) {
    if (s.skipped) {
      out.log(chalk.gray(`     · ${s.language} (${s.tool} @ ${s.projectRoot}): skipped — ${s.skipReason}`));
      continue;
    }
    const status = s.passed ? chalk.green('ok') : chalk.red('failed');
    out.log(
      chalk.gray(`     · ${s.language} (${s.tool} @ ${s.projectRoot}): `) +
      status +
      chalk.gray(` — ${s.errorCount} errors, ${s.warningCount} warnings`),
    );
  }
}
