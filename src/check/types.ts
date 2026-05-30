import type { CompilerLanguage } from '../toolchain/types';

export type IssueSeverity = 'error' | 'warning' | 'info';

export interface CheckIssue {
  severity: IssueSeverity;
  message: string;
  file?: string;
  line?: number;
  column?: number;
  code?: string;
  source: 'structural' | 'compiler';
  language?: string;
}

export interface CheckResult {
  passed: boolean;
  issues: CheckIssue[];
  summary: string;
  compilerSummary: CompilerRunSummary[];
  /** Languages in scope whose compiler was skipped (informational when not strict). */
  skippedLanguages: CompilerLanguage[];
}

export interface CompilerRunSummary {
  language: string;
  tool: string;
  projectRoot: string;
  passed: boolean;
  errorCount: number;
  warningCount: number;
  skipped: boolean;
  skipReason?: string;
}

export type CheckScope = 'all' | 'staged' | 'changed';

export interface CheckOptions {
  projectPath: string;
  scope: CheckScope;
  skipStructural: boolean;
  skipCompiler: boolean;
  /** Fail when a detected language's compiler did not run (e.g. Pyright missing). */
  strict: boolean;
}
