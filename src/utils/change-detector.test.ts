import { test } from 'node:test';
import assert from 'node:assert/strict';
import { selectChangeTargets } from './change-detector';

test('uses request-matched files instead of unrelated Git changes', () => {
  assert.deepEqual(
    selectChangeTargets(
      [],
      ['src/prompt/generator.ts'],
      ['src/commands/input.ts', 'src/commands/prompt.ts'],
    ),
    ['src/prompt/generator.ts'],
  );
});

test('combines and deduplicates explicit description and symbol matches', () => {
  assert.deepEqual(
    selectChangeTargets(
      ['src/prompt/generator.ts'],
      ['src/prompt/generator.ts', 'src/prompt/subgraph.ts'],
      ['src/commands/input.ts'],
    ),
    ['src/prompt/generator.ts', 'src/prompt/subgraph.ts'],
  );
});

test('falls back to unique Git changes when the request identifies no files', () => {
  assert.deepEqual(
    selectChangeTargets([], [], ['src/commands/input.ts', 'src/commands/input.ts']),
    ['src/commands/input.ts'],
  );
});
