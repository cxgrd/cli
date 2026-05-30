import type { CheckIssue } from '../types';

interface CargoMessage {
  reason?: string;
  level?: string;
  message?: string;
  code?: { code?: string };
  spans?: Array<{
    file_name?: string;
    line_start?: number;
    column_start?: number;
  }>;
}

export function parseCargoJsonLines(output: string): CheckIssue[] {
  const issues: CheckIssue[] = [];

  for (const line of output.split('\n')) {
    const trimmed = line.trim();
    if (!trimmed.startsWith('{')) continue;

    let msg: CargoMessage;
    try {
      msg = JSON.parse(trimmed) as CargoMessage;
    } catch {
      continue;
    }

    if (msg.reason !== 'compiler-message') continue;
    if (msg.level !== 'error' && msg.level !== 'warning') continue;

    const span = msg.spans?.[0];
    if (!span?.file_name) continue;

    issues.push({
      severity: msg.level === 'error' ? 'error' : 'warning',
      message: msg.message || 'Compiler error',
      file: span.file_name,
      line: span.line_start,
      column: span.column_start,
      code: msg.code?.code,
      source: 'compiler',
      language: 'rust',
    });
  }

  return issues;
}
