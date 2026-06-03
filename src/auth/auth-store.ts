import { mkdir, readFile, writeFile, unlink } from 'fs/promises';
import { homedir } from 'os';
import { join } from 'path';
import type { SubscriptionPlan } from './plans';
import { normalizePlan } from './plans';
import type { OrgRole } from '../team/types';

export interface StoredAuth {
  token: string;
  plan: SubscriptionPlan;
  expiresAt?: number;
  email?: string;
  orgId?: string;
  orgName?: string;
  role?: OrgRole;
  obtainedAt: number;
}

const AUTH_DIR = join(homedir(), '.cg');
const AUTH_PATH = join(AUTH_DIR, 'auth.json');

export async function readAuth(): Promise<StoredAuth | null> {
  try {
    const raw = await readFile(AUTH_PATH, 'utf-8');
    const data = JSON.parse(raw) as StoredAuth;
    if (!data.token) return null;
    const expiresAt = normalizeExpiry(data.expiresAt);
    if (expiresAt && Date.now() > expiresAt) {
      return null;
    }
    return { ...data, plan: normalizePlan(data.plan), expiresAt };
  } catch {
    return null;
  }
}

export async function writeAuth(auth: StoredAuth): Promise<void> {
  await mkdir(AUTH_DIR, { recursive: true });
  await writeFile(AUTH_PATH, JSON.stringify(auth, null, 2), 'utf-8');
}

export async function clearAuth(): Promise<void> {
  try {
    await unlink(AUTH_PATH);
  } catch {
    // already cleared
  }
}

export function getAuthPath(): string {
  return AUTH_PATH;
}

function normalizeExpiry(expiresAt: number | undefined): number | undefined {
  if (!expiresAt || Number.isNaN(expiresAt)) {
    return undefined;
  }
  return expiresAt < 1_000_000_000_000 ? expiresAt * 1000 : expiresAt;
}
