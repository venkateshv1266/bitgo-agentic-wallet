export interface GuardLayerResult {
  layer: number;
  name: string;
  passed: boolean;
  reason?: string;
}

export interface GuardResult {
  allowed: boolean;
  decision: 'approve' | 'deny' | 'escalate';
  reason?: string;
  layers: GuardLayerResult[];
}

export interface AuditEntry {
  id: string;
  timestamp: number;
  sessionId: string;
  tool: string;
  input: Record<string, unknown>;
  guardResult: GuardResult;
  executionResult?: unknown;
  status: 'allowed' | 'blocked' | 'escalated' | 'executed' | 'failed';
  durationMs: number;
}

export interface PendingApproval {
  id: string;
  toolName: string;
  toolInput: Record<string, unknown>;
  guardResult: GuardResult;
  status: 'pending' | 'approved' | 'rejected';
  createdAt: number;
  resolvedAt?: number;
  resolvedBy?: string;
}
