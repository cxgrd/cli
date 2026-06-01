import { readFile, writeFile, mkdir } from 'fs/promises';
import { join } from 'path';
import { existsSync } from 'fs';
import type { CgDirectory } from '../cg-directory';
import type { OrgPolicyDocument } from './types';
import { fetchOrgPolicy } from './cloud-client';
import type { ActiveSession } from '../auth/auth-session';

export async function refreshOrgPolicyCache(
  cgDir: CgDirectory,
  session: ActiveSession,
): Promise<OrgPolicyDocument> {
  const policy = await fetchOrgPolicy(session);
  const path = join(cgDir.getPath(), 'org-policy.json');
  await mkdir(cgDir.getPath(), { recursive: true });
  await writeFile(path, JSON.stringify(policy, null, 2), 'utf-8');
  return policy;
}

export async function readCachedOrgPolicy(cgDir: CgDirectory): Promise<OrgPolicyDocument | null> {
  const path = join(cgDir.getPath(), 'org-policy.json');
  if (!existsSync(path)) return null;
  try {
    return JSON.parse(await readFile(path, 'utf-8')) as OrgPolicyDocument;
  } catch {
    return null;
  }
}

export async function getOrgPolicy(
  cgDir: CgDirectory,
  session: ActiveSession,
  refresh = false,
): Promise<OrgPolicyDocument> {
  if (!refresh) {
    const cached = await readCachedOrgPolicy(cgDir);
    if (cached) return cached;
  }
  return refreshOrgPolicyCache(cgDir, session);
}
