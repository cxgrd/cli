import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { normalizePlan, planIncludesFeature } from './plans';

describe('plans', () => {
  it('enables prompt for pro and above', () => {
    assert.equal(planIncludesFeature('pro', 'prompt'), true);
    assert.equal(planIncludesFeature('pro', 'api_access'), true);
    assert.equal(planIncludesFeature('pro', 'advanced_analysis'), true);
    assert.equal(planIncludesFeature('team', 'prompt'), true);
    assert.equal(planIncludesFeature('free', 'prompt'), false);
  });

  it('enables team cloud only for team and enterprise', () => {
    assert.equal(planIncludesFeature('team', 'team_cloud'), true);
    assert.equal(planIncludesFeature('pro', 'team_cloud'), false);
    assert.equal(planIncludesFeature('enterprise', 'audit_events'), true);
  });

  it('normalizes plan names case-insensitively', () => {
    assert.equal(normalizePlan('invalid'), 'free');
    assert.equal(normalizePlan('PRO'), 'pro');
    assert.equal(normalizePlan('Team'), 'team');
  });
});
