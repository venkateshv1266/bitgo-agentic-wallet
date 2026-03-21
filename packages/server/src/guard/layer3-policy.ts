import fs from 'fs';
import path from 'path';
import BigNumber from 'bignumber.js';
import { GuardLayerResult } from '../audit/types';
import { AuditLogger } from '../audit/logger';
import { PolicyRule, TxLimitParams, VelocityLimitParams, AddressListParams } from './types';
import { getUsdValue } from './prices';

const POLICY_FILE = path.resolve(__dirname, '../../../../guard-policies.json');

function formatUsd(value: number): string {
  return '$' + value.toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 });
}

export class PolicyEngine {
  private rules: PolicyRule[] = [];

  constructor() {
    // Default rules apply to all wallets (walletId: '*')
    const defaults: PolicyRule[] = [
      {
        id: 'default-tx-limit',
        walletId: '*',
        type: 'tx_limit',
        enabled: true,
        params: {
          softLimitUsd: '500',   // $500 triggers escalation
          hardLimitUsd: '1000',  // $1000 hard deny
        } as TxLimitParams,
      },
      {
        id: 'default-velocity',
        walletId: '*',
        type: 'velocity_limit',
        enabled: true,
        params: {
          maxTotalUsd: '5000',   // $5000 per hour
          windowSeconds: 3600,
        } as VelocityLimitParams,
      },
    ];

    const loaded = this.loadFromDisk();
    if (loaded) {
      this.rules = loaded;
    } else {
      this.rules = defaults;
      this.saveToDisk();
    }
  }

  getRulesForWallet(walletId: string): PolicyRule[] {
    return this.rules.filter((r) => r.walletId === '*' || r.walletId === walletId);
  }

  getRules(): PolicyRule[] {
    return [...this.rules];
  }

  addRule(rule: PolicyRule): void {
    const idx = this.rules.findIndex((r) => r.id === rule.id);
    if (idx >= 0) {
      this.rules[idx] = rule;
    } else {
      this.rules.push(rule);
    }
    this.saveToDisk();
  }

  removeRule(ruleId: string): boolean {
    const idx = this.rules.findIndex((r) => r.id === ruleId);
    if (idx >= 0) {
      this.rules.splice(idx, 1);
      this.saveToDisk();
      return true;
    }
    return false;
  }

  toggleRule(ruleId: string, enabled: boolean): boolean {
    const rule = this.rules.find((r) => r.id === ruleId);
    if (rule) {
      rule.enabled = enabled;
      this.saveToDisk();
      return true;
    }
    return false;
  }

  async evaluate(
    toolName: string,
    toolInput: Record<string, unknown>,
    auditLogger: AuditLogger
  ): Promise<GuardLayerResult & { decision?: 'approve' | 'deny' | 'escalate' }> {
    // Only apply policies to write/send operations
    const sendTools = [
      'send_transaction', 'send_many', 'sweep_wallet', 'accelerate_transaction', 'change_fee',
      'pay_lightning_invoice', 'lightning_withdraw',
    ];
    if (!sendTools.includes(toolName)) {
      return { layer: 3, name: 'Policy Rules', passed: true, decision: 'approve' };
    }

    const addresses = this.extractAddresses(toolName, toolInput);
    const amounts = this.extractAmounts(toolName, toolInput);
    const coin = (toolInput.coin as string) || '';
    const walletId = (toolInput.walletId as string) || '*';

    // Only evaluate rules that match this wallet (or apply to all wallets)
    const applicableRules = this.rules.filter(
      (r) => r.enabled && (r.walletId === '*' || r.walletId === walletId)
    );

    for (const rule of applicableRules) {
      switch (rule.type) {
        case 'address_blacklist': {
          const params = rule.params as AddressListParams;
          const normalizedBlacklist = params.addresses.map((a) => a.toLowerCase());
          for (const addr of addresses) {
            if (normalizedBlacklist.includes(addr.toLowerCase())) {
              return {
                layer: 3,
                name: 'Policy Rules',
                passed: false,
                reason: `[Policy: ${rule.id} (address_blacklist)] Address ${addr} is blacklisted — escalated to human approval`,
                decision: 'escalate',
              };
            }
          }
          break;
        }

        case 'address_whitelist': {
          const params = rule.params as AddressListParams;
          if (params.addresses.length > 0) {
            const normalizedWhitelist = params.addresses.map((a) => a.toLowerCase());
            for (const addr of addresses) {
              if (!normalizedWhitelist.includes(addr.toLowerCase())) {
                return {
                  layer: 3,
                  name: 'Policy Rules',
                  passed: false,
                  reason: `[Policy: ${rule.id} (address_whitelist)] Address ${addr} is not in the whitelist — transaction blocked`,
                  decision: 'deny',
                };
              }
            }
          }
          break;
        }

        case 'tx_limit': {
          const params = rule.params as TxLimitParams;

          // Convert each transaction amount to USD
          for (const amount of amounts) {
            let usdValue = 0;
            if (coin) {
              usdValue = await getUsdValue(coin, amount.toString());
            }

            const hardLimitUsd = new BigNumber(params.hardLimitUsd);
            const softLimitUsd = new BigNumber(params.softLimitUsd);
            const usdBN = new BigNumber(usdValue);

            if (usdBN.gt(hardLimitUsd)) {
              return {
                layer: 3,
                name: 'Policy Rules',
                passed: false,
                reason: `[Policy: ${rule.id} (tx_limit)] Amount ${formatUsd(usdValue)} exceeds hard limit of ${formatUsd(hardLimitUsd.toNumber())} — escalated to human approval`,
                decision: 'escalate',
              };
            }
            if (usdBN.gt(softLimitUsd)) {
              return {
                layer: 3,
                name: 'Policy Rules',
                passed: false,
                reason: `[Policy: ${rule.id} (tx_limit)] Amount ${formatUsd(usdValue)} exceeds soft limit of ${formatUsd(softLimitUsd.toNumber())} — escalated to human approval`,
                decision: 'escalate',
              };
            }
          }
          break;
        }

        case 'velocity_limit': {
          const params = rule.params as VelocityLimitParams;

          const windowMs = params.windowSeconds * 1000;
          const recentSends = auditLogger.getRecentSends(windowMs);

          // Sum USD values of recent sends
          let totalUsd = new BigNumber(0);
          for (const entry of recentSends) {
            const entryAmounts = this.extractAmounts(entry.tool, entry.input);
            const entryCoin = (entry.input.coin as string) || '';
            for (const amt of entryAmounts) {
              if (entryCoin) {
                const entryUsd = await getUsdValue(entryCoin, amt.toString());
                totalUsd = totalUsd.plus(entryUsd);
              }
            }
          }

          // Add USD value of current transaction
          for (const amount of amounts) {
            if (coin) {
              const currentUsd = await getUsdValue(coin, amount.toString());
              totalUsd = totalUsd.plus(currentUsd);
            }
          }

          const maxTotalUsd = new BigNumber(params.maxTotalUsd);

          if (totalUsd.gt(maxTotalUsd)) {
            return {
              layer: 3,
              name: 'Policy Rules',
              passed: false,
              reason: `[Policy: ${rule.id} (velocity_limit)] Total ${formatUsd(totalUsd.toNumber())} would exceed ${formatUsd(maxTotalUsd.toNumber())} limit in ${params.windowSeconds}s window — transaction blocked`,
              decision: 'deny',
            };
          }
          break;
        }
      }
    }

    return { layer: 3, name: 'Policy Rules', passed: true, decision: 'approve' };
  }

  private loadFromDisk(): PolicyRule[] | null {
    try {
      if (fs.existsSync(POLICY_FILE)) {
        const raw = fs.readFileSync(POLICY_FILE, 'utf8');
        const data = JSON.parse(raw);
        if (data && Array.isArray(data.rules)) {
          console.log(`PolicyEngine: loaded ${data.rules.length} rule(s) from ${POLICY_FILE}`);
          return data.rules as PolicyRule[];
        }
      }
    } catch (err) {
      console.error('PolicyEngine: failed to load from disk, using defaults:', err);
    }
    return null;
  }

  private saveToDisk(): void {
    try {
      const data = { rules: this.rules };
      fs.writeFileSync(POLICY_FILE, JSON.stringify(data, null, 2));
      console.log(`PolicyEngine: saved ${this.rules.length} rule(s) to ${POLICY_FILE}`);
    } catch (err) {
      console.error('PolicyEngine: failed to save to disk:', err);
    }
  }

  private extractAddresses(toolName: string, input: Record<string, unknown>): string[] {
    if (toolName === 'send_transaction' || toolName === 'sweep_wallet') {
      return input.address ? [input.address as string] : [];
    }
    if (toolName === 'send_many') {
      const recipients = (input.recipients as Array<{ address: string }>) || [];
      return recipients.map((r) => r.address);
    }
    return [];
  }

  private extractAmounts(toolName: string, input: Record<string, unknown>): BigNumber[] {
    if (toolName === 'send_transaction') {
      return input.amount ? [new BigNumber(input.amount as string)] : [];
    }
    if (toolName === 'send_many') {
      const recipients = (input.recipients as Array<{ amount: string }>) || [];
      return recipients.map((r) => new BigNumber(r.amount));
    }
    return [];
  }
}
