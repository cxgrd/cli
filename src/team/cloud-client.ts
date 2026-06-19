import { envString } from '../config/env';
import type { ActiveSession } from '../auth/auth-session';
import type { AuditEventPayload, GraphBundle, OrgPolicyDocument } from './types';
import {
  devAppendEvent,
  devGetGraph,
  devGetPolicy,
  devPutGraph,
  isDevCloudEnabled,
} from './dev-store';

function apiBase(): string {
  return envString('CXGRD_AUTH_BASE_URL', 'https://cxgrd.com').replace(/\/$/, '');
}

function authHeaders(token: string): Record<string, string> {
  return {
    Accept: 'application/json',
    'Content-Type': 'application/json',
  };
}

async function apiFetch(path: string, token: string, init?: RequestInit): Promise<Response> {
  return fetch(`${apiBase()}${path}`, {
    ...init,
    headers: { ...authHeaders(token), ...init?.headers },
  });
}

function useDevStore(session: ActiveSession): boolean {
  return isDevCloudEnabled() || session.source === 'dev_override';
}

// POST /api/teams/:teamId/graph/sync
export async function pushGraph(session: ActiveSession, bundle: GraphBundle): Promise<void> {
  const teamId = session.orgId;
  if (!teamId) throw new Error('No team on this account. Team features require a team plan.');
  if (useDevStore(session)) { await devPutGraph(teamId, bundle); return; }
  const res = await apiFetch(`/api/teams/${teamId}/graph/sync`, session.token, {
    method: 'POST',
    body: JSON.stringify(bundle),
  });
  if (res.status === 404 || res.status === 501) { await devPutGraph(teamId, bundle); return; }
  if (!res.ok) {
    const body = await res.text().catch(() => '');
    throw new Error(`Graph push failed (${res.status}): ${body || res.statusText}`);
  }
}

// GET /api/teams/:teamId/graph/sync?repoId=...&sha=...
export async function pullGraph(
  session: ActiveSession,
  repoId: string,
  gitRef: string,
): Promise<GraphBundle | null> {
  const teamId = session.orgId;
  if (!teamId) throw new Error('No team on this account.');
  if (useDevStore(session)) return devGetGraph(teamId, repoId, gitRef);
  const res = await apiFetch(
    `/api/teams/${teamId}/graph/sync?repoId=${encodeURIComponent(repoId)}&sha=${encodeURIComponent(gitRef)}`,
    session.token,
    { method: 'GET' },
  );
  if (res.status === 404 || res.status === 501) return devGetGraph(teamId, repoId, gitRef);
  if (!res.ok) {
    const body = await res.text().catch(() => '');
    throw new Error(`Graph pull failed (${res.status}): ${body || res.statusText}`);
  }
  const data = await res.json() as { snapshot: GraphBundle };
  return data.snapshot ?? null;
}

// POST /api/teams/:teamId/audit
export async function postAuditEvent(
  session: ActiveSession,
  payload: AuditEventPayload,
): Promise<void> {
  const teamId = session.orgId;
  if (!teamId) return;
  if (useDevStore(session)) { await devAppendEvent(teamId, payload); return; }
  const res = await apiFetch(`/api/teams/${teamId}/audit`, session.token, {
    method: 'POST',
    body: JSON.stringify(payload),
  }).catch(() => null);
  if (!res || res.status === 404 || res.status === 501) {
    await devAppendEvent(teamId, payload);
  }
}

// POST /api/teams/:teamId/health
export async function postHealthSnapshot(
  session: ActiveSession,
  payload: {
    repoId: string;
    commitSha: string;
    fileCount: number;
    depCount: number;
    avgBlastRadius: number;
    maxBlastRadius: number;
    couplingScore: number;
    hubCount: number;
    hotspots: string[];
  },
): Promise<void> {
  const teamId = session.orgId;
  if (!teamId) return;
  if (useDevStore(session)) return;
  const res = await apiFetch(`/api/teams/${teamId}/health`, session.token, {
    method: 'POST',
    body: JSON.stringify(payload),
  }).catch(() => null);
  if (res && !res.ok && res.status !== 404 && res.status !== 501) {
    const body = await res.text().catch(() => '');
    console.debug(`Health snapshot skipped (${res.status}): ${body}`);
  }
}

// POST /api/teams/:teamId/ci-check
// Called by `cxgrd check --ci` — server updates the GitHub commit status
export async function postCiCheckResult(
  session: ActiveSession,
  payload: {
    repoId: string;
    gitRef: string;
    passed: boolean;
    issueCount: number;
    errorCount: number;
    summary: string;
  },
): Promise<void> {
  const teamId = session.orgId;
  if (!teamId) return;
  if (useDevStore(session)) return;
  const res = await apiFetch(`/api/teams/${teamId}/ci-check`, session.token, {
    method: 'POST',
    body: JSON.stringify(payload),
  }).catch(() => null);
  if (res && !res.ok && res.status !== 404 && res.status !== 501) {
    const body = await res.text().catch(() => '');
    throw new Error(`CI check post failed (${res.status}): ${body}`);
  }
}

export async function fetchOrgPolicy(session: ActiveSession): Promise<OrgPolicyDocument> {
  const teamId = session.orgId;
  if (!teamId) throw new Error('No team on this account.');
  if (useDevStore(session)) return (await devGetPolicy(teamId))!;
  const res = await apiFetch(`/api/teams/${teamId}/policies`, session.token, { method: 'GET' });
  if (res.status === 404 || res.status === 501) return (await devGetPolicy(teamId))!;
  if (!res.ok) {
    const body = await res.text().catch(() => '');
    throw new Error(`Policy fetch failed (${res.status}): ${body || res.statusText}`);
  }
  return (await res.json()) as OrgPolicyDocument;
}
