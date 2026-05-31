import { randomUUID } from 'crypto';
import { envString } from '../config/env';
import { readAuth, type StoredAuth } from './auth-store';
import { normalizePlan, type SubscriptionPlan } from './plans';

const POLL_INTERVAL_MS = 2000;
const POLL_TIMEOUT_MS = 5 * 60 * 1000;

export interface ActiveSession {
  token: string;
  plan: SubscriptionPlan;
  source: 'auth_file' | 'dev_override';
  email?: string;
}

export async function resolveActiveSession(): Promise<ActiveSession | null> {
  const devPlan = envString('CXGRD_DEV_PLAN');
  if (devPlan) {
    const plan = normalizePlan(devPlan);
    if (plan !== 'free') {
      return {
        token: envString('CXGRD_DEV_TOKEN', 'dev-local'),
        plan,
        source: 'dev_override',
      };
    }
  }

  const stored = await readAuth();
  if (!stored) return null;

  return {
    token: stored.token,
    plan: stored.plan,
    source: 'auth_file',
    email: stored.email,
  };
}

export async function pollAuthSession(sessionId: string): Promise<StoredAuth> {
  const baseUrl = envString('CXGRD_AUTH_BASE_URL', 'https://cxgrd.com').replace(/\/$/, '');
  const url = `${baseUrl}/api/auth/cli/session/${sessionId}`;
  const started = Date.now();

  while (Date.now() - started < POLL_TIMEOUT_MS) {
    const response = await fetch(url, {
      method: 'GET',
      headers: { Accept: 'application/json' },
    });

    if (response.status === 404 || response.status === 501) {
      throw new Error(
        'Auth API is not available yet (website routes pending). For local development set CXGRD_DEV_PLAN=pro in .env',
      );
    }

    if (response.status === 202) {
      await sleep(POLL_INTERVAL_MS);
      continue;
    }

    if (!response.ok) {
      const body = await response.text().catch(() => '');
      throw new Error(`Auth poll failed (${response.status}): ${body || response.statusText}`);
    }

    const data = (await response.json()) as {
      token?: string;
      access_token?: string;
      plan?: string;
      email?: string;
      expires_at?: number;
      expiresAt?: number;
    };

    const token = data.token || data.access_token;
    if (!token) {
      await sleep(POLL_INTERVAL_MS);
      continue;
    }

    const auth: StoredAuth = {
      token,
      plan: normalizePlan(data.plan),
      email: data.email,
      expiresAt: data.expires_at ?? data.expiresAt,
      obtainedAt: Date.now(),
    };

    if (auth.plan === 'free') {
      throw new Error('Account is on the Free plan. Upgrade to Pro to use prompt generation.');
    }

    return auth;
  }

  throw new Error('Timed out waiting for browser login. Try again or use CXGRD_DEV_PLAN=pro for local dev.');
}

export function createCliSessionId(): string {
  return randomUUID();
}

export function buildCliAuthUrl(sessionId: string): string {
  const baseUrl = envString('CXGRD_AUTH_BASE_URL', 'https://cxgrd.com').replace(/\/$/, '');
  return `${baseUrl}/auth/cli?session=${encodeURIComponent(sessionId)}`;
}

function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}
