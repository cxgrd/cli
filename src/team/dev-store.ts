import { mkdir, readFile, writeFile, appendFile } from 'fs/promises';
import { existsSync } from 'fs';
import { homedir } from 'os';
import { join } from 'path';
import type { AuditEventPayload, GraphBundle, OrgPolicyDocument } from './types';

const DEV_ROOT = join(homedir(), '.cg', 'dev-cloud');

export function isDevCloudEnabled(): boolean {
  const v = process.env.CXGRD_DEV_CLOUD?.trim().toLowerCase();
  return v === '1' || v === 'true' || v === 'yes';
}

function graphPath(orgId: string, repoId: string, gitRef: string): string {
  const safeRef = gitRef.replace(/[^a-zA-Z0-9._-]/g, '_');
  return join(DEV_ROOT, 'orgs', orgId, 'graphs', repoId, `${safeRef}.json`);
}

function policyPath(orgId: string): string {
  return join(DEV_ROOT, 'orgs', orgId, 'policy.json');
}

function eventsPath(orgId: string): string {
  return join(DEV_ROOT, 'orgs', orgId, 'events.jsonl');
}

export async function devPutGraph(orgId: string, bundle: GraphBundle): Promise<void> {
  const path = graphPath(orgId, bundle.repoId, bundle.gitRef);
  await mkdir(join(path, '..'), { recursive: true });
  await writeFile(path, JSON.stringify(bundle, null, 2), 'utf-8');
}

export async function devGetGraph(
  orgId: string,
  repoId: string,
  gitRef: string,
): Promise<GraphBundle | null> {
  const path = graphPath(orgId, repoId, gitRef);
  if (!existsSync(path)) return null;
  const raw = await readFile(path, 'utf-8');
  return JSON.parse(raw) as GraphBundle;
}

export async function devGetPolicy(orgId: string): Promise<OrgPolicyDocument | null> {
  const path = policyPath(orgId);
  if (!existsSync(path)) {
    return defaultDevPolicy(orgId);
  }
  const raw = await readFile(path, 'utf-8');
  return JSON.parse(raw) as OrgPolicyDocument;
}

export async function devPutPolicy(orgId: string, policy: OrgPolicyDocument): Promise<void> {
  const path = policyPath(orgId);
  await mkdir(join(path, '..'), { recursive: true });
  await writeFile(path, JSON.stringify(policy, null, 2), 'utf-8');
}

export async function devAppendEvent(orgId: string, payload: AuditEventPayload): Promise<void> {
  const path = eventsPath(orgId);
  await mkdir(join(path, '..'), { recursive: true });
  await appendFile(path, `${JSON.stringify({ ...payload, recordedAt: Date.now() })}\n`, 'utf-8');
}

function defaultDevPolicy(orgId: string): OrgPolicyDocument {
  return {
    version: 1,
    orgId,
    defaultMaxBlastRadius: 100,
    roles: {
      member: { maxBlastRadius: 85, blockOnRiskLevels: ['critical'] },
      lead: { maxBlastRadius: 70, blockOnRiskLevels: ['critical', 'high'] },
      admin: { maxBlastRadius: 100, blockOnRiskLevels: [] },
    },
    merge: {
      blockIfBlastRadiusAbove: 80,
      requireCheckPass: false,
    },
  };
}

export function getDevCloudRoot(): string {
  return DEV_ROOT;
}
