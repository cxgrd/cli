import chalk from 'chalk';
import { planIncludesFeature, planDisplayName, type ProFeature, type SubscriptionPlan } from './plans';
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

export async function requireProFeature(feature: ProFeature): Promise<ActiveSession> {
  const session = await resolveActiveSession();

  if (!session) {
    throw new ProRequiredError(
      `This feature requires a Pro, Team, or Enterprise plan.\n` +
        `  Run ${chalk.cyan('cxgrd auth login')} or visit https://cxgrd.com/upgrade\n` +
        `  Local dev: set CXGRD_DEV_PLAN=pro in .env (see .env.example)`,
      feature,
    );
  }

  if (!planIncludesFeature(session.plan, feature)) {
    throw new ProRequiredError(
      `Your plan (${planDisplayName(session.plan)}) does not include this feature.\n` +
        `  Upgrade at https://cxgrd.com/upgrade`,
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
  console.log(chalk.gray(`  Prompt generation: ${planIncludesFeature(session.plan, 'prompt') ? 'enabled' : 'disabled'}`));
}
