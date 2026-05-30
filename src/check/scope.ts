import { relative } from 'path';
import { ChangeDetector } from '../utils/change-detector';

export function normalizeProjectPath(projectRoot: string, filePath: string): string {
  const rel = relative(projectRoot, filePath);
  if (!rel || rel.startsWith('..')) {
    return filePath.replace(/\\/g, '/');
  }
  return rel.replace(/\\/g, '/');
}

/**
 * Resolve which project-relative paths are in scope for this check run.
 * Returns null when scope is "all" (no file filter).
 */
export function resolveScopeFiles(
  projectRoot: string,
  scope: 'all' | 'staged' | 'changed',
): Set<string> | null {
  if (scope === 'all') {
    return null;
  }

  const detector = new ChangeDetector(projectRoot);
  const changed = detector.getChangedFiles();
  const raw =
    scope === 'staged' ? changed.stagedFiles : [...new Set([...changed.stagedFiles, ...changed.unstaged])];

  const scoped = new Set<string>();
  for (const file of raw) {
    scoped.add(normalizeProjectPath(projectRoot, file));
  }
  return scoped;
}

export function issueInScope(
  issueFile: string | undefined,
  scopeFiles: Set<string> | null,
  projectRoot: string,
): boolean {
  if (!scopeFiles) {
    return true;
  }
  if (!issueFile) {
    return false;
  }
  const normalized = normalizeProjectPath(projectRoot, issueFile);
  if (scopeFiles.has(normalized)) {
    return true;
  }
  return [...scopeFiles].some(
    (scoped) => normalized.startsWith(scoped) || scoped.startsWith(normalized),
  );
}

export function filterIssuesByScope<T extends { file?: string }>(
  issues: T[],
  scopeFiles: Set<string> | null,
  projectRoot: string,
): T[] {
  if (!scopeFiles) {
    return issues;
  }
  return issues.filter((issue) => issueInScope(issue.file, scopeFiles, projectRoot));
}
