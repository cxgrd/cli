import { resolve } from 'path';
import chalk from 'chalk';
import { CgDirectory } from '../cg-directory';
import { ChangeDetector } from '../utils/change-detector';
import { BlastRadiusAnalyzer } from '../utils/blast-radius-analyzer';
import { resolveActiveSession } from '../auth/auth-session';
import { planIncludesFeature } from '../auth/plans';
import { getOrgPolicy } from '../team/policy-cache';
import { evaluateOrgPolicy } from '../team/policy-engine';
import { recordAuditEventIfTeam } from '../team/audit';
import { checkCommand } from './check';

/**
 * Pre-commit hook entry: org policy + blast radius on staged files.
 * Falls back to plain cxgrd check when not on a team plan.
 */
export async function teamPrecommitCommand(projectPath?: string): Promise<void> {
  const rootPath = resolve(projectPath || process.cwd());
  const session = await resolveActiveSession();

  if (!session || !planIncludesFeature(session.plan, 'org_policies') || !session.orgId) {
    console.log(chalk.gray('cxgrd: no team policy — run cxgrd check --staged only'));
    await checkCommand(rootPath, { scope: 'staged', strict: false, skipStructural: false, skipCompiler: false });
    return;
  }

  const cgDir = new CgDirectory(rootPath);
  const graph = await cgDir.readGraph();
  if (!graph) {
    console.error(chalk.red('cxgrd: no graph. Run cxgrd scan first.'));
    process.exit(1);
  }

  const detector = new ChangeDetector(rootPath);
  const staged = detector.getChangedFiles().stagedFiles;

  if (staged.length === 0) {
    process.exit(0);
  }

  const analyzer = new BlastRadiusAnalyzer(graph);
  const result = analyzer.analyze(staged);

  const policy = await getOrgPolicy(cgDir, session, false);
  const evaluation = evaluateOrgPolicy(
    result.totalRisk,
    result.riskLevel,
    session.role,
    policy,
  );

  await recordAuditEventIfTeam(session, rootPath, {
    eventType: 'precommit',
    riskScore: result.totalRisk,
    riskLevel: result.riskLevel,
    affectedCount: result.affectedFiles.length,
    passed: evaluation.allowed,
    summary: evaluation.allowed ? 'allowed' : evaluation.reason,
    metadata: { stagedFiles: staged.length, role: session.role },
  });

  console.log(chalk.gray(`cxgrd team policy: risk ${result.totalRisk}/100 (${result.riskLevel}) · role ${session.role}`));

  if (!evaluation.allowed) {
    console.error(chalk.red(`cxgrd: commit blocked — ${evaluation.reason}`));
    console.error(chalk.gray('  Run cxgrd input on your changes for details.'));
    process.exit(1);
  }

  if (result.riskLevel === 'medium' || result.riskLevel === 'high') {
    console.log(chalk.yellow(`cxgrd: warning — ${result.affectedFiles.length} file(s) may be affected`));
  }

  await checkCommand(rootPath, {
    scope: 'staged',
    strict: false,
    skipStructural: false,
    skipCompiler: false,
  });
}
