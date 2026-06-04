import { createHash } from 'crypto';
import { execSync } from 'child_process';

export interface RepoIdentity {
  repoId: string;
  gitRef: string;
  remoteUrl?: string;
}

export function resolveRepoIdentity(projectRoot: string): RepoIdentity {
  const remoteUrl = getGitRemote(projectRoot);
  const gitRef = getGitRef(projectRoot);
  const repoId = hashRepoId(remoteUrl || projectRoot);

  return { repoId, gitRef, remoteUrl };
}

function getGitRemote(cwd: string): string | undefined {
  try {
    const url = execSync('git config --get remote.origin.url', {
      cwd,
      encoding: 'utf-8',
      stdio: ['pipe', 'pipe', 'ignore'],
    }).trim();
    return url || undefined;
  } catch {
    return undefined;
  }
}

function getGitRef(cwd: string): string {
  try {
    const branch = execSync('git rev-parse --abbrev-ref HEAD', {
      cwd,
      encoding: 'utf-8',
      stdio: ['pipe', 'pipe', 'ignore'],
    }).trim();
    if (branch && branch !== 'HEAD') {
      return branch;
    }
  } catch {
    // fall through
  }
  return 'local';
}

function hashRepoId(seed: string): string {
  return createHash('sha256').update(seed).digest('hex').slice(0, 16);
}
