import chalk from 'chalk';
import {
  planIncludesFeature,
  planDisplayName,
  isTeamOrEnterprise,
  type ProFeature,
  type TeamFeature,
} from './plans';
import { resolveActiveSession, type ActiveSession } from './auth-session';

export class ProRequiredError extends Error {
  constructor(
    message: string,
    public readonly feature: ProFeature,
  ) {
    super(message);
    this.name = 'ProRequiredError';
  }
}

export class TeamRequiredError extends Error {
  constructor(
    message: string,
    public readonly feature: TeamFeature,
  ) {
    super(message);
    this.name = 'TeamRequiredError';
  }
}

export async function requireProFeature(feature: ProFeature): Promise<ActiveSession> {
  const session = await resolveActiveSession();

  if (!session) {
    throw new ProRequiredError(
      `This feature requires a Pro, Team, or Enterprise plan.\n` +
        `  Run ${chalk.cyan('cxgrd auth login')} or visit https://cxgrd.dev/upgrade\n` +
        `  Local dev: set CXGRD_DEV_PLAN=pro in .env (see .env.example)`,
      feature,
    );
  }

  if (!planIncludesFeature(session.plan, feature)) {
    throw new ProRequiredError(
      `Your plan (${planDisplayName(session.plan)}) does not include this feature.\n` +
        `  Upgrade at https://cxgrd.dev/upgrade`,
      feature,
    );
  }

  return session;
}

export async function requireTeamFeature(feature: TeamFeature): Promise<ActiveSession> {
  const session = await resolveActiveSession();

  if (!session) {
    throw new TeamRequiredError(
      `This feature requires Team or Enterprise.\n` +
        `  Run ${chalk.cyan('cxgrd auth login')} after upgrading\n` +
        `  Local dev: CXGRD_DEV_PLAN=team CXGRD_DEV_ORG_ID=org_dev CXGRD_DEV_CLOUD=1`,
      feature,
    );
  }

  if (!planIncludesFeature(session.plan, feature)) {
    throw new TeamRequiredError(
      `Your plan (${planDisplayName(session.plan)}) does not include team features.\n` +
        `  Upgrade at https://cxgrd.dev/upgrade`,
      feature,
    );
  }

  if (!session.orgId) {
    throw new TeamRequiredError(
      `No organization linked to your account. Join or create a team workspace in the dashboard.`,
      feature,
    );
  }

  return session;
}

export function printSessionStatus(session: ActiveSession | null): void {
  if (!session) {
    console.log(chalk.gray('  Not signed in (Free tier — scan, input, check available locally)'));
    return;
  }

  const src =
    session.source === 'dev_override'
      ? chalk.yellow(' (dev override via CXGRD_DEV_PLAN)')
      : '';
  console.log(
    chalk.green(`  Signed in as ${session.email || 'user'} — ${planDisplayName(session.plan)} plan`) +
      src,
  );
  console.log(
    chalk.gray(`  Prompt: ${planIncludesFeature(session.plan, 'prompt') ? 'yes' : 'no'}`),
  );
  if (isTeamOrEnterprise(session.plan)) {
    console.log(
      chalk.gray(
        `  Org: ${session.orgName || session.orgId || '—'} · role: ${session.role} · sync: enabled`,
      ),
    );
  }
}
