import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { evaluateOrgPolicy } from './policy-engine';
import type { OrgPolicyDocument } from './types';

const policy: OrgPolicyDocument = {
  version: 1,
  orgId: 'org_test',
  defaultMaxBlastRadius: 100,
  roles: {
    dev: { maxBlastRadius: 50, blockOnRiskLevels: ['critical', 'high'] },
    owner: { maxBlastRadius: 100, blockOnRiskLevels:[] },
    admin: { maxBlastRadius: 100, blockOnRiskLevels: [] },
  },
  merge: { blockIfBlastRadiusAbove: 80, requireCheckPass: false },
};

describe('evaluateOrgPolicy', () => {
  it('blocks dev when score exceeds merge threshold', () => {
    const r = evaluateOrgPolicy(90, 'medium', 'dev', policy);
    assert.equal(r.allowed, false);
  });

  it('allows dev below threshold', () => {
    const r = evaluateOrgPolicy(50, 'low', 'dev', policy);
    assert.equal(r.allowed, true);
  });

  it('blocks owner on high risk level', () => {
    const r = evaluateOrgPolicy(40, 'high', 'owner', policy);
    assert.equal(r.allowed, false);
  });
});
