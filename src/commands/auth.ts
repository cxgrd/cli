import chalk from 'chalk';
import { loadCxgrdEnv, envString } from '../config/env';
import { clearAuth, getAuthPath, readAuth, writeAuth } from '../auth/auth-store';
import {
  buildCliAuthUrl,
  createCliSessionId,
  pollAuthSession,
  resolveActiveSession,
} from '../auth/auth-session';
import { openBrowser } from '../auth/open-browser';
import { printSessionStatus } from '../auth/entitlements';

async function initiateSession(sessionId: string): Promise<void> {
  const baseUrl = envString('CXGRD_AUTH_BASE_URL', 'https://cxgrd.com').replace(/\/$/, '');
  const url = `${baseUrl}/api/auth/cli/initiate`;

  const response = await fetch(url, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ sessionId }),
  });

  if (!response.ok) {
    const body = await response.text().catch(() => '');
    throw new Error(`Failed to initiate session (${response.status}): ${body || response.statusText}`);
  }
}

export async function authLoginCommand(): Promise<void> {
  await loadCxgrdEnv();

  const sessionId = createCliSessionId();
  const url = buildCliAuthUrl(sessionId);

  console.log(chalk.blue('✓ Opening browser for GitHub sign-in...'));
  console.log(chalk.gray(`   Session: ${sessionId.slice(0, 8)}...`));
  console.log(chalk.gray(`   If the browser does not open: ${url}\n`));

  // Register the session on the server BEFORE opening browser and polling
  try {
    await initiateSession(sessionId);
  } catch (err: unknown) {
    const message = err instanceof Error ? err.message : String(err);
    console.error(chalk.red(`\n✗ Could not reach auth server: ${message}`));
    console.error(chalk.gray('  For local dev: set CXGRD_DEV_PLAN=pro in .env'));
    process.exit(1);
  }

  openBrowser(url);

  console.log(chalk.gray('   Waiting for authorization...'));

  try {
    const auth = await pollAuthSession(sessionId);
    await writeAuth(auth);
    console.log(chalk.green('\n✓ Signed in successfully'));
    console.log(chalk.gray(`   Token saved to ${getAuthPath()}`));
    console.log(chalk.gray(`   Plan: ${auth.plan}`));
    if (auth.orgId) {
      console.log(chalk.gray(`   Org: ${auth.orgName || auth.orgId} · role: ${auth.role || 'dev'}`));
    }
  } catch (err: unknown) {
    const message = err instanceof Error ? err.message : String(err);
    console.error(chalk.red(`\n✗ ${message}`));
    process.exit(1);
  }
}

export async function authLogoutCommand(): Promise<void> {
  await clearAuth();
  console.log(chalk.green('✓ Signed out. Pro features disabled until you log in again.'));
}

export async function authStatusCommand(): Promise<void> {
  await loadCxgrdEnv();
  console.log(chalk.blue('✓ cxgrd auth status\n'));
  const stored = await readAuth();
  const session = await resolveActiveSession();

  printSessionStatus(session);

  if (stored) {
    console.log(chalk.gray(`\n  Credentials: ${getAuthPath()}`));
    if (stored.expiresAt) {
      const exp = new Date(stored.expiresAt).toISOString();
      console.log(chalk.gray(`  Expires: ${exp}`));
    }
  }
}
