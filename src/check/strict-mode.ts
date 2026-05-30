import type { CheckIssue, CompilerRunSummary } from './types';
import type { CompilerLanguage } from '../toolchain/types';

const SKIP_HINTS: Record<CompilerLanguage, string> = {
  typescript: 'bundled TypeScript should always run — please report a bug if you see this',
  python: 'pip install pyright',
  rust: 'install Rust from https://rustup.rs/',
};

export function collectStrictModeIssues(
  summaries: CompilerRunSummary[],
  languagesInScope: CompilerLanguage[],
): CheckIssue[] {
  const issues: CheckIssue[] = [];

  for (const lang of languagesInScope) {
    const runs = summaries.filter((s) => s.language === lang);
    const allSkipped = runs.length === 0 || runs.every((s) => s.skipped);

    if (!allSkipped) {
      continue;
    }

    const skipReason = runs.find((s) => s.skipReason)?.skipReason;
    const hint = skipReason ?? SKIP_HINTS[lang];

    issues.push({
      severity: 'error',
      source: 'compiler',
      language: lang,
      code: 'CXGRD_STRICT_SKIP',
      message: `Strict mode: ${lang} verification did not run (${hint}). Run \`cxgrd doctor\` for setup help.`,
    });
  }

  return issues;
}

export function getSkippedLanguagesInScope(
  summaries: CompilerRunSummary[],
  languagesInScope: CompilerLanguage[],
): CompilerLanguage[] {
  return languagesInScope.filter((lang) => {
    const runs = summaries.filter((s) => s.language === lang);
    return runs.length === 0 || runs.every((s) => s.skipped);
  });
}
