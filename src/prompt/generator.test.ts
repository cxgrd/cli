import { test } from 'node:test';
import assert from 'node:assert/strict';
import { generateDeterministicPrompt } from './generator';
import type { PromptSubgraph } from './subgraph';

function createSubgraph(overrides: Partial<PromptSubgraph> = {}): PromptSubgraph {
  return {
    changeDescription: 'rename the exported helper',
    seedFiles: ['src/helper.ts'],
    affectedFiles: [{
      path: 'src/consumer.ts',
      severity: 'high',
      reason: 'Depends on helper.ts',
      distance: 1,
      impactType: 'direct',
      changeRequired: true,
      suggestedFix: 'Update the imported symbol name',
    }],
    dependencies: [{ from: 'src/consumer.ts', to: './helper', type: 'import' }],
    symbols: { 'src/helper.ts': ['helper', 'HelperOptions'] },
    architectureLayers: { service: ['src/helper.ts'], application: ['src/consumer.ts'] },
    riskLevel: 'high',
    recommendations: ['Review all import sites.'],
    ...overrides,
  };
}

test('generates a deterministic prompt with request, per-file impact, and verification steps', () => {
  const subgraph = createSubgraph();
  const first = generateDeterministicPrompt(subgraph);
  const second = generateDeterministicPrompt(subgraph);

  assert.equal(first, second);
  assert.match(first, /^Implement rename the exported helper/);
  assert.match(first, /`src\/helper\.ts` — direct change target/);
  assert.match(first, /`src\/consumer\.ts` — high risk, direct dependent/);
  assert.match(first, /Suggested action: Update the imported symbol name/);
  assert.match(first, /Run the targeted unit and integration tests/);
  assert.match(first, /cxgrd check --changed/);
});

test('preserves an explicit change action and identifies unresolved file scope', () => {
  const prompt = generateDeterministicPrompt(createSubgraph({
    changeDescription: 'Modify the cache invalidation behavior',
    seedFiles: [],
    affectedFiles: [],
  }));

  assert.match(prompt, /^Modify the cache invalidation behavior/);
  assert.match(prompt, /No files were resolved by the blast-radius analysis/);
  assert.doesNotMatch(prompt, /`src\/helper\.ts`/);
});

test('adds repository memory only when provided', () => {
  const prompt = generateDeterministicPrompt(createSubgraph(), '## Repository context\n- Keep adapters thin');
  assert.match(prompt, /Repository context:\n## Repository context\n- Keep adapters thin/);
});
