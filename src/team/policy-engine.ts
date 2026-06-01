import type { OrgPolicyDocument, OrgRole, PolicyEvaluation } from './types';

export function evaluateOrgPolicy(
  riskScore: number,
  riskLevel: string,
  role: OrgRole,
  policy: OrgPolicyDocument,
): PolicyEvaluation {
  const rolePolicy = policy.roles[role] || policy.roles.member;
  const mergeThreshold = policy.merge.blockIfBlastRadiusAbove;
  const roleThreshold = rolePolicy.maxBlastRadius;
  const effectiveThreshold = Math.min(mergeThreshold, roleThreshold);

  const normalizedLevel = riskLevel.toLowerCase() as 'critical' | 'high' | 'medium' | 'low';

  if (rolePolicy.blockOnRiskLevels.includes(normalizedLevel)) {
    return {
      allowed: false,
      reason: `Org policy blocks commits when risk level is ${normalizedLevel} for role "${role}"`,
      riskScore,
      riskLevel,
      thresholdUsed: effectiveThreshold,
      role,
    };
  }

  if (riskScore > effectiveThreshold) {
    return {
      allowed: false,
      reason: `Blast radius score ${riskScore} exceeds org threshold ${effectiveThreshold} (role: ${role})`,
      riskScore,
      riskLevel,
      thresholdUsed: effectiveThreshold,
      role,
    };
  }

  return {
    allowed: true,
    riskScore,
    riskLevel,
    thresholdUsed: effectiveThreshold,
    role,
  };
}
