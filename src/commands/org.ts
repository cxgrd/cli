import { resolve } from 'path';
import chalk from 'chalk';
import { CgDirectory } from '../cg-directory';
import { requireTeamFeature, TeamRequiredError, printSessionStatus } from '../auth/entitlements';
import { resolveActiveSession } from '../auth/auth-session';
import { refreshOrgPolicyCache, readCachedOrgPolicy } from '../team/policy-cache';
import { getDevCloudRoot, isDevCloudEnabled } from '../team/dev-store';

export async function orgStatusCommand(): Promise<void> {
  const session = await resolveActiveSession();
  console.log(chalk.blue('✓ Organization status\n'));
  printSessionStatus(session);

  if (session?.orgId && isDevCloudEnabled()) {
    console.log(chalk.gray(`\n  Dev cloud data: ${getDevCloudRoot()}/orgs/${session.orgId}/`));
  }
}

export async function orgPolicyRefreshCommand(projectPath?: string): Promise<void> {
  const rootPath = resolve(projectPath || process.cwd());

  try {
    const session = await requireTeamFeature('org_policies');
    const cgDir = new CgDirectory(rootPath);
    const policy = await refreshOrgPolicyCache(cgDir, session);

    console.log(chalk.green('✓ Org policy cached locally'));
    console.log(chalk.gray(`   Merge block above: ${policy.merge.blockIfBlastRadiusAbove}`));
    console.log(chalk.gray(`   Your role (${session.role}) max score: ${policy.roles[session.role]?.maxBlastRadius}`));
    console.log(chalk.gray(`   File: ${cgDir.getPath()}/org-policy.json`));
  } catch (err: unknown) {
    if (err instanceof TeamRequiredError) {
      console.error(chalk.red(`\n✗ ${err.message}`));
      process.exit(1);
    }
    throw err;
  }
}

export async function orgPolicyShowCommand(projectPath?: string): Promise<void> {
  const rootPath = resolve(projectPath || process.cwd());
  const cgDir = new CgDirectory(rootPath);
  const policy = await readCachedOrgPolicy(cgDir);

  if (!policy) {
    console.log(chalk.yellow('No cached policy. Run: cxgrd org policy refresh'));
    return;
  }

  console.log(JSON.stringify(policy, null, 2));
}
