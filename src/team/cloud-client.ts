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
    'x-cxgrd-token': token,
  };
}

async function apiFetch(
  path: string,
  token: string,
  init?: RequestInit,
): Promise<Response> {
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
  if (!teamId) {
    throw new Error('No team on this account. Team features require a team plan.');
  }

  if (useDevStore(session)) {
    await devPutGraph(teamId, bundle);
    return;
  }

  const res = await apiFetch(`/api/teams/${teamId}/graph/sync`, session.token, {
    method: 'POST',
    body: JSON.stringify(bundle),
  });

  if (res.status === 404 || res.status === 501) {
    // Fall back to dev store during local development
    await devPutGraph(teamId, bundle);
    return;
  }

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
  if (!teamId) {
    throw new Error('No team on this account.');
  }

  if (useDevStore(session)) {
    return devGetGraph(teamId, repoId, gitRef);
  }

  const res = await apiFetch(
    `/api/teams/${teamId}/graph/sync?repoId=${encodeURIComponent(repoId)}&sha=${encodeURIComponent(gitRef)}`,
    session.token,
    { method: 'GET' },
  );

  if (res.status === 404) {
    // No snapshot yet for this SHA — fall back to dev store
    return devGetGraph(teamId, repoId, gitRef);
  }

  if (res.status === 501) {
    return devGetGraph(teamId, repoId, gitRef);
  }

  if (!res.ok) {
    const body = await res.text().catch(() => '');
    throw new Error(`Graph pull failed (${res.status}): ${body || res.statusText}`);
  }

  const data = await res.json() as { snapshot: GraphBundle };
  return data.snapshot ?? null;
}

export async function fetchOrgPolicy(session: ActiveSession): Promise<OrgPolicyDocument> {
  const teamId = session.orgId;
  if (!teamId) {
    throw new Error('No team on this account.');
  }

  if (useDevStore(session)) {
    const policy = await devGetPolicy(teamId);
    return policy!;
  }

  // Policies endpoint will be wired in phase 2 — fall back to dev store for now
  const res = await apiFetch(`/api/teams/${teamId}/policies`, session.token, { method: 'GET' });

  if (res.status === 404 || res.status === 501) {
    const policy = await devGetPolicy(teamId);
    return policy!;
  }

  if (!res.ok) {
    const body = await res.text().catch(() => '');
    throw new Error(`Policy fetch failed (${res.status}): ${body || res.statusText}`);
  }

  return (await res.json()) as OrgPolicyDocument;
}

export async function postAuditEvent(
  session: ActiveSession,
  payload: AuditEventPayload,
): Promise<void> {
  const teamId = session.orgId;
  if (!teamId) return;

  if (useDevStore(session)) {
    await devAppendEvent(teamId, payload);
    return;
  }

  // Audit events endpoint will be wired in phase 2 — non-fatal for now
  const res = await apiFetch(`/api/teams/${teamId}/events`, session.token, {
    method: 'POST',
    body: JSON.stringify(payload),
  }).catch(() => null);

  if (!res || res.status === 404 || res.status === 501) {
    await devAppendEvent(teamId, payload);
  }
}
