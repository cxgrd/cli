import type { ActiveSession } from '../auth/auth-session';
import { planIncludesFeature } from '../auth/plans';
import type { AuditEventPayload } from './types';
import { postAuditEvent } from './cloud-client';
import { resolveRepoIdentity } from './repo-identity';

export async function recordAuditEventIfTeam(
  session: ActiveSession | null,
  projectRoot: string,
  partial: {
    eventType: AuditEventPayload['eventType'];
    riskScore?: number;    // mapped to blastRadius on the wire
    riskLevel?: string;
    affectedCount?: number;
    passed?: boolean;
    summary?: string;
    metadata?: Record<string, unknown>;
  },
): Promise<void> {
  if (!session?.orgId) return;
  if (!planIncludesFeature(session.plan, 'team_cloud')) return;

  const identity = resolveRepoIdentity(projectRoot);

  await postAuditEvent(session, {
    eventType:   partial.eventType,
    repoId:      identity.repoId,
    gitRef:      identity.gitRef,
    // riskScore from CLI maps to blastRadius in the API
    blastRadius: partial.riskScore,
    riskLevel:   partial.riskLevel,
    passed:      partial.passed,
    summary:     partial.summary,
    metadata: {
      ...partial.metadata,
      ...(partial.affectedCount !== undefined && { affectedCount: partial.affectedCount }),
    },
  });
}
