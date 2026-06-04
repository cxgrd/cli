import { randomUUID } from 'crypto';
import { envString } from '../config/env';
import { readAuth, type StoredAuth } from './auth-store';
import { normalizePlan, type SubscriptionPlan } from './plans';
import type { OrgRole } from '../team/types';

function normalizeRole(role: string | undefined): OrgRole {
  const r = (role || 'member').toLowerCase();
  if (r === 'lead' || r === 'admin') return r;
  return 'member';
}

const POLL_INTERVAL_MS = 2000;
const POLL_TIMEOUT_MS = 5 * 60 * 1000;

export interface ActiveSession {
  token: string;
  plan: SubscriptionPlan;
  source: 'auth_file' | 'dev_override';
  email?: string;
  orgId?: string;
  orgName?: string;
  role: OrgRole;
}

export async function resolveActiveSession(): Promise<ActiveSession | null> {
  // Dev override — lets you test pro/team locally without real auth
  const devPlan = envString('CXGRD_DEV_PLAN');
  if (devPlan) {
    const plan = normalizePlan(devPlan);
    if (plan !== 'free') {
      return {
        token: envString('CXGRD_DEV_TOKEN', 'dev-local'),
        plan,
        source: 'dev_override',
        orgId: envString('CXGRD_DEV_ORG_ID', 'org_dev'),
        orgName: envString('CXGRD_DEV_ORG_NAME', 'Dev Org'),
        role: normalizeRole(envString('CXGRD_DEV_ROLE', 'member')),
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
    // orgId/orgName/role only populated for team/enterprise — undefined for free+pro
    orgId: stored.orgId,
    orgName: stored.orgName,
    role: normalizeRole(stored.role),
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
        'Auth API is not available yet. For local dev set CXGRD_DEV_PLAN=pro in .env',
      );
    }

    // 202 = still pending, user hasn't completed GitHub login yet
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
      org_id?: string;
      orgId?: string;
      org_name?: string;
      orgName?: string;
      role?: string;
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
      // these are only set for team/enterprise accounts
      orgId: data.org_id ?? data.orgId,
      orgName: data.org_name ?? data.orgName,
      role: normalizeRole(data.role),
      expiresAt: normalizeExpiry(data.expires_at ?? data.expiresAt),
      obtainedAt: Date.now(),
    };

    // Free and pro users both get a token — feature gates are enforced per-command
    return auth;
  }

  throw new Error('Timed out waiting for browser login. Try again.');
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

function normalizeExpiry(expiresAt: number | undefined): number | undefined {
  if (!expiresAt || Number.isNaN(expiresAt)) return undefined;
  // accept either epoch seconds or milliseconds
  return expiresAt < 1_000_000_000_000 ? expiresAt * 1000 : expiresAt;
}
