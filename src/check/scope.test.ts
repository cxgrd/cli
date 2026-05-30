import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { issueInScope, normalizeProjectPath } from './scope';

describe('scope', () => {
  it('normalizes absolute paths to project-relative', () => {
    const rel = normalizeProjectPath('C:/proj', 'C:/proj/cli/src/index.ts');
    assert.equal(rel, 'cli/src/index.ts');
  });

  it('filters issues to scoped files', () => {
    const scope = new Set(['cli/src/foo.ts']);
    assert.equal(
      issueInScope('cli/src/foo.ts', scope, 'C:/proj'),
      true,
    );
    assert.equal(
      issueInScope('website/app/page.tsx', scope, 'C:/proj'),
      false,
    );
  });
});
