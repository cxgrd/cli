import { randomUUID } from 'crypto';
import { envString } from '../config/env';
import { readAuth, type StoredAuth } from './auth-store';
import { normalizePlan, type SubscriptionPlan } from './plans';
import type { OrgRole } from '../team/types';

function normalizeRole(role: string | undefined): OrgRole {
  const r = (role || 'dev').toLowerCase();
  if (r === 'owner' || r === 'admin') return r;
  return 'dev';
}

const POLL_INTERVAL_MS = 2000;
const POLL_TIMEOUT_MS = 5 * 60 * 1000;

export interface ActiveSession {
  token: string;
  plan: SubscriptionPlan;
  source: 'auth_file' | 'env_token' | 'dev_override';
  email?: string;
  orgId?: string;
  orgName?: string;
  role: OrgRole;
}

export async function resolveActiveSession(): Promise<ActiveSession | null> {
  // 1. Dev override (local dev only)
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
        role: normalizeRole(envString('CXGRD_DEV_ROLE', 'dev')),
      };
    }
  }

  // 2. CI environment — CXGRD_AUTH_TOKEN set as GitHub Actions secret
  // No auth file exists in CI, so we read the JWT directly from the env var
  // and decode plan/orgId/role from it without hitting the network.
  const envToken = process.env.CXGRD_AUTH_TOKEN;
  if (envToken) {
    const decoded = decodeJwtPayload(envToken);
    return {
      token: envToken,
      plan: normalizePlan(decoded?.plan),
      source: 'env_token',
      email: decoded?.email,
      orgId: decoded?.team_id,
      orgName: undefined,
      role: normalizeRole(decoded?.team_role),
    };
  }

  // 3. Normal interactive login — reads from ~/.cg/auth.json
  const stored = await readAuth();
  if (!stored) return null;

  return {
    token: stored.token,
    plan: stored.plan,
    source: 'auth_file',
    email: stored.email,
    orgId: stored.orgId,
    orgName: stored.orgName,
    role: normalizeRole(stored.role),
  };
}

// Decode JWT payload without verifying signature — safe here because
// we're just reading claims for local use. The server always re-verifies.
function decodeJwtPayload(token: string): Record<string, string> | null {
  try {
    const parts = token.split('.');
    if (parts.length !== 3) return null;
    const decoded = Buffer.from(parts[1], 'base64url').toString('utf8');
    return JSON.parse(decoded) as Record<string, string>;
  } catch {
    return null;
  }
}

export async function pollAuthSession(sessionId: string): Promise<StoredAuth> {
  const baseUrl = envString('CXGRD_AUTH_BASE_URL', 'https://cxgrd.com').replace(/\/$/, '');
  const url = `${baseUrl}/api/auth/cli/session/${sessionId}`;
  const started = Date.now();

  while (Date.now() - started < POLL_TIMEOUT_MS) {
    let response: Response;

    try {
      response = await fetch(url, {
        method: 'GET',
        headers: { Accept: 'application/json' },
      });
    } catch {
      await sleep(POLL_INTERVAL_MS);
      continue;
    }

    if (response.status === 501) {
      throw new Error(
        'Auth API is not available yet. For local dev set CXGRD_DEV_PLAN=pro in .env',
      );
    }

    if (response.status === 404) { await sleep(POLL_INTERVAL_MS); continue; }
    if (response.status === 202) { await sleep(POLL_INTERVAL_MS); continue; }

    if (response.status === 410) {
      throw new Error('Session expired. Run cxgrd auth login again.');
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
    if (!token) { await sleep(POLL_INTERVAL_MS); continue; }

    return {
      token,
      plan: normalizePlan(data.plan),
      email: data.email,
      orgId: data.org_id ?? data.orgId,
      orgName: data.org_name ?? data.orgName,
      role: normalizeRole(data.role),
      expiresAt: normalizeExpiry(data.expires_at ?? data.expiresAt),
      obtainedAt: Date.now(),
    };
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
  return expiresAt < 1_000_000_000_000 ? expiresAt * 1000 : expiresAt;
}
