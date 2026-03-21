import { GuardResult } from '../audit/types';
import { AuditLogger } from '../audit/logger';
import { evaluateLayer1 } from './layer1-auth';
import { evaluateLayer2 } from './layer2-intent';
import { PolicyEngine } from './layer3-policy';

export class AgentGuard {
  private policyEngine: PolicyEngine;

  constructor(policyEngine: PolicyEngine) {
    this.policyEngine = policyEngine;
  }

  async evaluate(
    toolName: string,
    toolInput: Record<string, unknown>,
    sessionId: string,
    auditLogger: AuditLogger
  ): Promise<GuardResult> {
    const layers = [];

    // Layer 1: Auth & Rate Limit
    const l1 = evaluateLayer1(sessionId);
    layers.push(l1);
    if (!l1.passed) {
      return { allowed: false, decision: 'deny', reason: l1.reason, layers };
    }

    // Layer 2: Intent Verification
    const l2 = evaluateLayer2(toolName, toolInput, auditLogger);
    layers.push(l2);
    if (!l2.passed) {
      return { allowed: false, decision: 'deny', reason: l2.reason, layers };
    }

    // Layer 3: Policy Rules (async — needs USD price lookups)
    const l3 = await this.policyEngine.evaluate(toolName, toolInput, auditLogger);
    layers.push(l3);
    if (!l3.passed) {
      const decision = l3.decision || 'deny';
      return { allowed: false, decision, reason: l3.reason, layers };
    }

    return { allowed: true, decision: 'approve', layers };
  }

  getPolicyEngine(): PolicyEngine {
    return this.policyEngine;
  }
}
