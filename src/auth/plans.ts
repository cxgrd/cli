export type SubscriptionPlan = 'free' | 'pro' | 'team' | 'enterprise';

export const PRO_FEATURES = [
  'prompt',
  'repo_memory',
  'cloud_sync',
  'advanced_analysis',
  'api_access',
  'priority_support',
] as const;
export type ProFeature = (typeof PRO_FEATURES)[number];

export const TEAM_FEATURES = ['team_cloud', 'org_policies', 'audit_events'] as const;
export type TeamFeature = (typeof TEAM_FEATURES)[number];

export function normalizePlan(plan: string | undefined): SubscriptionPlan {
  const p = (plan || 'free').toLowerCase();
  if (p === 'pro' || p === 'team' || p === 'enterprise') {
    return p;
  }
  return 'free';
}

export function planIncludesFeature(
  plan: SubscriptionPlan,
  feature: ProFeature | TeamFeature,
): boolean {
  if (
    feature === 'prompt' ||
    feature === 'repo_memory' ||
    feature === 'cloud_sync' ||
    feature === 'advanced_analysis' ||
    feature === 'api_access' ||
    feature === 'priority_support'
  ) {
    return plan === 'pro' || plan === 'team' || plan === 'enterprise';
  }
  if (feature === 'team_cloud' || feature === 'org_policies' || feature === 'audit_events') {
    return plan === 'team' || plan === 'enterprise';
  }
  return false;
}

export function isTeamOrEnterprise(plan: SubscriptionPlan): boolean {
  return plan === 'team' || plan === 'enterprise';
}

export function planDisplayName(plan: SubscriptionPlan): string {
  return plan.charAt(0).toUpperCase() + plan.slice(1);
}
