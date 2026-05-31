export type SubscriptionPlan = 'free' | 'pro' | 'team' | 'enterprise';

export const PRO_FEATURES = ['prompt', 'repo_memory'] as const;
export type ProFeature = (typeof PRO_FEATURES)[number];

export function normalizePlan(plan: string | undefined): SubscriptionPlan {
  const p = (plan || 'free').toLowerCase();
  if (p === 'pro' || p === 'team' || p === 'enterprise') {
    return p;
  }
  return 'free';
}

export function planIncludesFeature(plan: SubscriptionPlan, feature: ProFeature): boolean {
  if (feature === 'prompt' || feature === 'repo_memory') {
    return plan === 'pro' || plan === 'team' || plan === 'enterprise';
  }
  return false;
}

export function planDisplayName(plan: SubscriptionPlan): string {
  return plan.charAt(0).toUpperCase() + plan.slice(1);
}
