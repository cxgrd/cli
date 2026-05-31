import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { normalizePlan, planIncludesFeature } from './plans';

describe('plans', () => {
  it('enables prompt for pro and above', () => {
    assert.equal(planIncludesFeature('pro', 'prompt'), true);
    assert.equal(planIncludesFeature('team', 'prompt'), true);
    assert.equal(planIncludesFeature('free', 'prompt'), false);
  });

  it('normalizes plan names case-insensitively', () => {
    assert.equal(normalizePlan('invalid'), 'free');
    assert.equal(normalizePlan('PRO'), 'pro');
    assert.equal(normalizePlan('Team'), 'team');
  });
});
