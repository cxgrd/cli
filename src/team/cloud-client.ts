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
    Authorization: `Bearer ${token}`,
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

export async function pushGraph(session: ActiveSession, bundle: GraphBundle): Promise<void> {
  const orgId = session.orgId;
  if (!orgId) {
    throw new Error('No organization on this account. Team features require an org.');
  }

  if (useDevStore(session)) {
    await devPutGraph(orgId, bundle);
    return;
  }

  const res = await apiFetch(`/api/orgs/${orgId}/graphs`, session.token, {
    method: 'PUT',
    body: JSON.stringify(bundle),
  });

  if (res.status === 404 || res.status === 501) {
    await devPutGraph(orgId, bundle);
    return;
  }

  if (!res.ok) {
    const body = await res.text().catch(() => '');
    throw new Error(`Graph push failed (${res.status}): ${body || res.statusText}`);
  }
}

export async function pullGraph(
  session: ActiveSession,
  repoId: string,
  gitRef: string,
): Promise<GraphBundle | null> {
  const orgId = session.orgId;
  if (!orgId) {
    throw new Error('No organization on this account.');
  }

  if (useDevStore(session)) {
    return devGetGraph(orgId, repoId, gitRef);
  }

  const res = await apiFetch(
    `/api/orgs/${orgId}/graphs?repoId=${encodeURIComponent(repoId)}&ref=${encodeURIComponent(gitRef)}`,
    session.token,
    { method: 'GET' },
  );

  if (res.status === 404) {
    return devGetGraph(orgId, repoId, gitRef);
  }

  if (res.status === 501) {
    return devGetGraph(orgId, repoId, gitRef);
  }

  if (!res.ok) {
    const body = await res.text().catch(() => '');
    throw new Error(`Graph pull failed (${res.status}): ${body || res.statusText}`);
  }

  return (await res.json()) as GraphBundle;
}

export async function fetchOrgPolicy(session: ActiveSession): Promise<OrgPolicyDocument> {
  const orgId = session.orgId;
  if (!orgId) {
    throw new Error('No organization on this account.');
  }

  if (useDevStore(session)) {
    const policy = await devGetPolicy(orgId);
    return policy!;
  }

  const res = await apiFetch(`/api/orgs/${orgId}/policies`, session.token, { method: 'GET' });

  if (res.status === 404 || res.status === 501) {
    const policy = await devGetPolicy(orgId);
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
  const orgId = session.orgId;
  if (!orgId) return;

  if (useDevStore(session)) {
    await devAppendEvent(orgId, payload);
    return;
  }

  const res = await apiFetch(`/api/orgs/${orgId}/events`, session.token, {
    method: 'POST',
    body: JSON.stringify(payload),
  });

  if (res.status === 404 || res.status === 501) {
    await devAppendEvent(orgId, payload);
    return;
  }

  if (!res.ok) {
    // Non-fatal for CLI UX
    return;
  }
}
