import { execSync } from 'child_process';

export async function resolveRepoFullName(Root_Path: string): Promise<string> {
  try {
    const remote = execSync('git remote get-url origin', { cwd: Root_Path, stdio: 'pipe' })
      .toString().trim();
    const match = remote.match(/[:/]([^/]+\/[^/]+?)(\.git)?$/);
    return match ? match[1] : Root_Path.split(/[/\\]/).pop() ?? 'unknown';
  } catch {
    return Root_Path.split(/[/\\]/).pop() ?? 'unknown';
  }
}

export function resolveGitSha(Root_Path: string): string {
  try {
    return execSync('git rev-parse HEAD', { cwd: Root_Path, stdio: 'pipe' }).toString().trim();
  } catch {
    return `local-${Date.now()}`;
  }
}