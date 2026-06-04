import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { evaluateOrgPolicy } from './policy-engine';
import type { OrgPolicyDocument } from './types';

const policy: OrgPolicyDocument = {
  version: 1,
  orgId: 'org_test',
  defaultMaxBlastRadius: 100,
  roles: {
    member: { maxBlastRadius: 85, blockOnRiskLevels: ['critical'] },
    lead: { maxBlastRadius: 70, blockOnRiskLevels: ['critical', 'high'] },
    admin: { maxBlastRadius: 100, blockOnRiskLevels: [] },
  },
  merge: { blockIfBlastRadiusAbove: 80, requireCheckPass: false },
};

describe('evaluateOrgPolicy', () => {
  it('blocks member when score exceeds merge threshold', () => {
    const r = evaluateOrgPolicy(90, 'medium', 'member', policy);
    assert.equal(r.allowed, false);
  });

  it('allows member below threshold', () => {
    const r = evaluateOrgPolicy(50, 'low', 'member', policy);
    assert.equal(r.allowed, true);
  });

  it('blocks lead on high risk level', () => {
    const r = evaluateOrgPolicy(40, 'high', 'lead', policy);
    assert.equal(r.allowed, false);
  });
});
