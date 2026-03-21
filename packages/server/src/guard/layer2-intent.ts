import { z } from 'zod';
import { GuardLayerResult } from '../audit/types';
import { AuditLogger } from '../audit/logger';

// Zod schemas for each tool's input
const toolSchemas: Record<string, z.ZodSchema> = {
  list_wallets: z.object({
    coin: z.string().min(1).optional(),
    limit: z.number().optional(),
  }),
  get_wallet: z.object({
    walletId: z.string().min(1),
  }),
  get_max_spendable: z.object({
    coin: z.string().min(1),
    walletId: z.string().min(1),
  }),
  list_transfers: z.object({
    coin: z.string().min(1),
    walletId: z.string().min(1),
    limit: z.number().optional(),
  }),
  generate_wallet: z.object({
    coin: z.string().min(1),
    label: z.string().min(1),
    walletVersion: z.number().optional(),
  }),
  create_address: z.object({
    coin: z.string().min(1),
    walletId: z.string().min(1),
    label: z.string().optional(),
  }),
  send_transaction: z.object({
    coin: z.string().min(1),
    walletId: z.string().min(1),
    address: z.string().min(1),
    amount: z.string().min(1),
  }),
  send_many: z.object({
    coin: z.string().min(1),
    walletId: z.string().min(1),
    recipients: z.array(
      z.object({
        address: z.string().min(1),
        amount: z.string().min(1),
      })
    ),
  }),
  list_policy_rules: z.object({
    walletId: z.string().min(1),
  }),
  add_policy_rule: z.object({
    coin: z.string().min(1),
    walletId: z.string().min(1),
    ruleId: z.string().min(1),
    type: z.string().min(1),
    addresses: z.array(z.string()).optional(),
    condition: z.record(z.unknown()).optional(),
    action: z.record(z.unknown()).optional(),
  }),
  manage_webhook: z.object({
    coin: z.string().min(1),
    walletId: z.string().min(1),
    type: z.string().min(1),
    url: z.string().url(),
  }),
  update_wallet: z.object({
    coin: z.string().min(1),
    walletId: z.string().min(1),
    label: z.string().min(1),
  }),
  consolidate_utxos: z.object({
    coin: z.string().min(1),
    walletId: z.string().min(1),
  }),
  sweep_wallet: z.object({
    coin: z.string().min(1),
    walletId: z.string().min(1),
    address: z.string().min(1),
  }),
  get_transfer: z.object({
    coin: z.string().min(1),
    walletId: z.string().min(1),
    transferId: z.string().min(1),
  }),
  list_addresses: z.object({
    coin: z.string().min(1),
    walletId: z.string().min(1),
    limit: z.number().optional(),
  }),
  freeze_wallet: z.object({
    coin: z.string().min(1),
    walletId: z.string().min(1),
    duration: z.number().optional(),
  }),
  get_fee_estimate: z.object({
    coin: z.string().min(1),
    numBlocks: z.number().optional(),
  }),
  list_pending_approvals: z.object({
    walletId: z.string().optional(),
  }),
  update_pending_approval: z.object({
    approvalId: z.string().min(1),
    state: z.enum(['approved', 'rejected']),
    coin: z.string().optional(),
    walletId: z.string().optional(),
  }),
  accelerate_transaction: z.object({
    coin: z.string().min(1),
    walletId: z.string().min(1),
    txid: z.string().min(1),
    feeRate: z.number().optional(),
  }),
  fanout_utxos: z.object({
    coin: z.string().min(1),
    walletId: z.string().min(1),
    target: z.number().optional(),
  }),
  list_webhooks: z.object({
    coin: z.string().min(1),
    walletId: z.string().min(1),
  }),
  remove_webhook: z.object({
    coin: z.string().min(1),
    walletId: z.string().min(1),
    type: z.string().min(1),
    url: z.string().url(),
  }),
  update_policy_rule: z.object({
    coin: z.string().min(1),
    walletId: z.string().min(1),
    ruleId: z.string().min(1),
    type: z.string().min(1),
    action: z.record(z.unknown()).optional(),
    addAddresses: z.array(z.string()).optional(),
    removeAddresses: z.array(z.string()).optional(),
    condition: z.record(z.unknown()).optional(),
  }),
  delete_policy_rule: z.object({
    coin: z.string().min(1),
    walletId: z.string().min(1),
    ruleId: z.string().min(1),
    type: z.string().min(1),
    action: z.record(z.unknown()).optional(),
  }),
  verify_address: z.object({
    coin: z.string().min(1),
    address: z.string().min(1),
  }),
  list_unspents: z.object({
    coin: z.string().min(1),
    walletId: z.string().min(1),
    limit: z.number().optional(),
  }),
  share_wallet: z.object({
    coin: z.string().min(1),
    walletId: z.string().min(1),
    email: z.string().min(1),
    permissions: z.string().optional(),
  }),
  build_transaction: z.object({
    coin: z.string().min(1),
    walletId: z.string().min(1),
    recipients: z.array(
      z.object({
        address: z.string().min(1),
        amount: z.string().min(1),
      })
    ),
  }),
  change_fee: z.object({
    coin: z.string().min(1),
    walletId: z.string().min(1),
    txid: z.string().min(1),
    fee: z.string().optional(),
  }),
  recover_token: z.object({
    coin: z.string().min(1),
    walletId: z.string().min(1),
    tokenContractAddress: z.string().min(1),
    recipient: z.string().min(1),
  }),
  consolidate_account: z.object({
    coin: z.string().min(1),
    walletId: z.string().min(1),
    consolidateAddresses: z.array(z.string()).optional(),
  }),
  enable_tokens: z.object({
    coin: z.string().min(1),
    walletId: z.string().min(1),
    tokens: z.array(z.string().min(1)),
  }),
  is_wallet_address: z.object({
    coin: z.string().min(1),
    walletId: z.string().min(1),
    address: z.string().min(1),
  }),
  get_canonical_address: z.object({
    coin: z.string().min(1),
    address: z.string().min(1),
  }),
  prebuild_and_sign_transaction: z.object({
    coin: z.string().min(1),
    walletId: z.string().min(1),
    recipients: z.array(
      z.object({
        address: z.string().min(1),
        amount: z.string().min(1),
      })
    ),
  }),
  accept_wallet_share: z.object({
    coin: z.string().min(1),
    shareId: z.string().min(1),
    userPassword: z.string().optional(),
  }),
  pay_lightning_invoice: z.object({
    coin: z.string().min(1),
    walletId: z.string().min(1),
    invoice: z.string().min(1),
  }),
  lightning_withdraw: z.object({
    coin: z.string().min(1),
    walletId: z.string().min(1),
    amount: z.string().min(1),
    address: z.string().min(1),
  }),
  search_bitgo_docs: z.object({
    query: z.string().min(1),
  }),
  web_search: z.object({
    query: z.string().min(1),
  }),
  web_fetch: z.object({
    url: z.string().min(1),
    maxLength: z.number().optional(),
  }),
  calculate: z.object({
    expression: z.string().min(1),
  }),
  get_crypto_price: z.object({
    coin: z.string().min(1),
  }),
  get_current_time: z.object({}),
};

export function evaluateLayer2(
  toolName: string,
  toolInput: Record<string, unknown>,
  auditLogger: AuditLogger
): GuardLayerResult {
  // Schema validation
  const schema = toolSchemas[toolName];
  if (!schema) {
    return { layer: 2, name: 'Intent Verification', passed: false, reason: `Unknown tool: ${toolName}` };
  }

  const result = schema.safeParse(toolInput);
  if (!result.success) {
    const errors = result.error.issues.map((i) => `${i.path.join('.')}: ${i.message}`).join('; ');
    return { layer: 2, name: 'Intent Verification', passed: false, reason: `Schema validation failed: ${errors}` };
  }

  // Anomaly detection for send operations
  const sendLikeTools = ['send_transaction', 'send_many', 'sweep_wallet', 'accelerate_transaction', 'change_fee'];
  if (sendLikeTools.includes(toolName)) {
    const recentSends = auditLogger.getRecentSends(60_000); // last 60 seconds
    if (recentSends.length >= 3) {
      return {
        layer: 2,
        name: 'Intent Verification',
        passed: false,
        reason: `Anomaly detected: ${recentSends.length} send operations in the last 60 seconds`,
      };
    }
  }

  return { layer: 2, name: 'Intent Verification', passed: true };
}
