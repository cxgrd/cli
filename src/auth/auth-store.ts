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
    if (data.expiresAt && Date.now() > data.expiresAt) {
      return null;
    }
    return { ...data, plan: normalizePlan(data.plan) };
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
