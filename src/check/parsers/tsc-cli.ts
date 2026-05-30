import type { CheckIssue } from '../types';

/** Fallback parser for `tsc --noEmit` stdout when programmatic API is unavailable. */
const TSC_LINE =
  /^(?<file>.+)\((?<line>\d+),(?<column>\d+)\):\s+(?<severity>error|warning)\s+(?<code>TS\d+):\s+(?<message>.+)$/;

export function parseTscCliOutput(output: string): CheckIssue[] {
  const issues: CheckIssue[] = [];

  for (const line of output.split('\n')) {
    const match = line.trim().match(TSC_LINE);
    if (!match?.groups) continue;

    issues.push({
      severity: match.groups.severity === 'error' ? 'error' : 'warning',
      message: match.groups.message,
      file: match.groups.file,
      line: Number.parseInt(match.groups.line, 10),
      column: Number.parseInt(match.groups.column, 10),
      code: match.groups.code,
      source: 'compiler',
      language: 'typescript',
    });
  }

  return issues;
}
