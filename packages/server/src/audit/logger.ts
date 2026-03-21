import fs from 'fs';
import path from 'path';
import { v4 as uuid } from 'uuid';
import { AuditEntry, GuardResult, PendingApproval } from './types';

type BroadcastFn = (event: string, data: unknown) => void;

export class AuditLogger {
  private entries: AuditEntry[] = [];
  private pendingApprovals: Map<string, PendingApproval> = new Map();
  private approvalResolvers: Map<string, (decision: 'approved' | 'rejected') => void> = new Map();
  private logFile: string;
  private broadcast: BroadcastFn;

  constructor(broadcast: BroadcastFn) {
    this.logFile = path.resolve(__dirname, '../../../../audit-trail.jsonl');
    this.broadcast = broadcast;
  }

  log(entry: Omit<AuditEntry, 'id' | 'timestamp'>): AuditEntry {
    const full: AuditEntry = {
      ...entry,
      id: uuid(),
      timestamp: Date.now(),
      input: this.redactSensitive(entry.input),
    };
    this.entries.push(full);
    this.persistEntry(full);
    this.broadcast('audit_entry', full);
    return full;
  }

  getEntries(filter?: { tool?: string; status?: string; limit?: number }): AuditEntry[] {
    let result = [...this.entries];
    if (filter?.tool) result = result.filter((e) => e.tool === filter.tool);
    if (filter?.status) result = result.filter((e) => e.status === filter.status);
    result.sort((a, b) => b.timestamp - a.timestamp);
    if (filter?.limit) result = result.slice(0, filter.limit);
    return result;
  }

  getRecentSends(windowMs: number): AuditEntry[] {
    const cutoff = Date.now() - windowMs;
    return this.entries.filter(
      (e) =>
        e.timestamp > cutoff &&
        (e.tool === 'send_transaction' || e.tool === 'send_many') &&
        e.status === 'executed'
    );
  }

  // --- Pending Approvals ---

  createPendingApproval(
    toolName: string,
    toolInput: Record<string, unknown>,
    guardResult: GuardResult
  ): { approval: PendingApproval; waitForDecision: Promise<'approved' | 'rejected'> } {
    const approval: PendingApproval = {
      id: uuid(),
      toolName,
      toolInput: this.redactSensitive(toolInput),
      guardResult,
      status: 'pending',
      createdAt: Date.now(),
    };
    this.pendingApprovals.set(approval.id, approval);
    // Don't broadcast here — the brain's emitter handles per-session delivery

    const waitForDecision = new Promise<'approved' | 'rejected'>((resolve) => {
      this.approvalResolvers.set(approval.id, resolve);
    });

    return { approval, waitForDecision };
  }

  resolveApproval(approvalId: string, decision: 'approved' | 'rejected'): PendingApproval | null {
    const approval = this.pendingApprovals.get(approvalId);
    if (!approval || approval.status !== 'pending') return null;

    approval.status = decision;
    approval.resolvedAt = Date.now();
    approval.resolvedBy = 'human';

    const resolver = this.approvalResolvers.get(approvalId);
    if (resolver) {
      resolver(decision);
      this.approvalResolvers.delete(approvalId);
    }

    this.broadcast('approval_resolved', { approvalId, decision });
    return approval;
  }

  getPendingApprovals(): PendingApproval[] {
    return Array.from(this.pendingApprovals.values()).filter((a) => a.status === 'pending');
  }

  private redactSensitive(input: Record<string, unknown>): Record<string, unknown> {
    const redacted = { ...input };
    if ('walletPassphrase' in redacted) redacted.walletPassphrase = '[REDACTED]';
    if ('passphrase' in redacted) redacted.passphrase = '[REDACTED]';
    return redacted;
  }

  private persistEntry(entry: AuditEntry): void {
    try {
      fs.appendFileSync(this.logFile, JSON.stringify(entry) + '\n');
    } catch {
      // Non-critical: log to console if file write fails
      console.error('Failed to persist audit entry to file');
    }
  }
}
