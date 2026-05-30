import type { CheckIssue } from '../types';

interface PyrightDiagnostic {
  file?: string;
  severity: string;
  message: string;
  rule?: string;
  range?: {
    start?: { line?: number; character?: number };
  };
}

interface PyrightOutput {
  generalDiagnostics?: PyrightDiagnostic[];
  summary?: {
    errorCount?: number;
    warningCount?: number;
  };
}

export function parsePyrightJson(output: string): CheckIssue[] {
  let parsed: PyrightOutput;
  try {
    parsed = JSON.parse(output) as PyrightOutput;
  } catch {
    return [];
  }

  const issues: CheckIssue[] = [];
  for (const diag of parsed.generalDiagnostics || []) {
    if (!diag.file) continue;

    const severity =
      diag.severity === 'error' ? 'error' : diag.severity === 'warning' ? 'warning' : 'info';

    issues.push({
      severity,
      message: diag.message,
      file: diag.file,
      line: (diag.range?.start?.line ?? 0) + 1,
      column: (diag.range?.start?.character ?? 0) + 1,
      code: diag.rule,
      source: 'compiler',
      language: 'python',
    });
  }

  return issues;
}
