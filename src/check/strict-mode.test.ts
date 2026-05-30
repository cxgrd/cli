import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { collectStrictModeIssues, getSkippedLanguagesInScope } from './strict-mode';
import type { CompilerRunSummary } from './types';

describe('strict mode', () => {
  it('flags skipped python when project uses python', () => {
    const summaries: CompilerRunSummary[] = [
      {
        language: 'python',
        tool: 'pyright',
        projectRoot: '.',
        passed: true,
        errorCount: 0,
        warningCount: 0,
        skipped: true,
        skipReason: 'pyright not found',
      },
    ];
    const issues = collectStrictModeIssues(summaries, ['python']);
    assert.equal(issues.length, 1);
    assert.equal(issues[0].code, 'CXGRD_STRICT_SKIP');
  });

  it('does not flag typescript when verifier ran', () => {
    const summaries: CompilerRunSummary[] = [
      {
        language: 'typescript',
        tool: 'typescript',
        projectRoot: 'cli',
        passed: true,
        errorCount: 0,
        warningCount: 0,
        skipped: false,
      },
    ];
    const issues = collectStrictModeIssues(summaries, ['typescript', 'python']);
    assert.equal(issues.length, 1);
    assert.equal(issues[0].language, 'python');
  });

  it('lists skipped languages for warnings', () => {
    const summaries: CompilerRunSummary[] = [
      {
        language: 'rust',
        tool: 'cargo',
        projectRoot: '.',
        passed: true,
        errorCount: 0,
        warningCount: 0,
        skipped: true,
      },
    ];
    assert.deepEqual(getSkippedLanguagesInScope(summaries, ['rust']), ['rust']);
  });
});
