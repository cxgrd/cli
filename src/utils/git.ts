import { execSync } from 'child_process';

export async function resolveRepoFullName(rootPath: string): Promise<string> {
  try {
    const remote = execSync('git remote get-url origin', { cwd: rootPath, stdio: 'pipe' })
      .toString().trim();
    const match = remote.match(/[:/]([^/]+\/[^/]+?)(\.git)?$/);
    return match ? match[1] : rootPath.split(/[/\\]/).pop() ?? 'unknown';
  } catch {
    return rootPath.split(/[/\\]/).pop() ?? 'unknown';
  }
}

export function resolveGitSha(rootPath: string): string {
  try {
    return execSync('git rev-parse HEAD', { cwd: rootPath, stdio: 'pipe' }).toString().trim();
  } catch {
    return `local-${Date.now()}`;
  }
}