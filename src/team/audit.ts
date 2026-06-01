import type { ActiveSession } from '../auth/auth-session';
import { planIncludesFeature } from '../auth/plans';
import type { AuditEventPayload } from './types';
import { postAuditEvent } from './cloud-client';
import { resolveRepoIdentity } from './repo-identity';

export async function recordAuditEventIfTeam(
  session: ActiveSession | null,
  projectRoot: string,
  partial: Omit<AuditEventPayload, 'repoId' | 'gitRef'>,
): Promise<void> {
  if (!session?.orgId) return;
  if (!planIncludesFeature(session.plan, 'team_cloud')) return;

  const identity = resolveRepoIdentity(projectRoot);
  await postAuditEvent(session, {
    ...partial,
    repoId: identity.repoId,
    gitRef: identity.gitRef,
  });
}
