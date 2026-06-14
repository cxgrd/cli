export type OrgRole = 'owner' | 'admin' | 'dev';

export interface GraphBundle {
  version: 1;
  repoId: string;
  gitRef: string;
  uploadedAt: number;
  uploadedBy?: string;
  graph: unknown;
  symbols: Record<string, string[]>;
  arch: unknown;
  meta: unknown;
  patterns?: unknown;
}

export interface SyncMeta {
  repoId: string;
  gitRef: string;
  lastPushedAt?: number;
  lastPulledAt?: number;
  remoteUploadedAt?: number;
}

export interface OrgPolicyDocument {
  version: 1;
  orgId: string;
  defaultMaxBlastRadius: number;
  roles: Record<
    OrgRole,
    {
      maxBlastRadius: number;
      blockOnRiskLevels: Array<'critical' | 'high' | 'medium' | 'low'>;
    }
  >;
  merge: {
    blockIfBlastRadiusAbove: number;
    requireCheckPass: boolean;
  };
}

export interface AuditEventPayload {
  eventType: 'scan' | 'input' | 'check' | 'sync' | 'precommit' | 'prompt';
  repoId: string;
  gitRef: string;
  riskScore?: number;
  riskLevel?: string;
  affectedCount?: number;
  passed?: boolean;
  summary?: string;
  metadata?: Record<string, unknown>;
}

export interface PolicyEvaluation {
  allowed: boolean;
  reason?: string;
  riskScore: number;
  riskLevel: string;
  thresholdUsed: number;
  role: OrgRole;
}
