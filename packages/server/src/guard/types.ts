export interface PolicyRule {
  id: string;
  walletId: string;  // Which agentic wallet this rule applies to ('*' = all wallets)
  type: 'tx_limit' | 'velocity_limit' | 'address_whitelist' | 'address_blacklist';
  enabled: boolean;
  params: Record<string, any>;
}

export interface TxLimitParams {
  softLimitUsd: string;   // e.g. "500" for $500
  hardLimitUsd: string;   // e.g. "1000" for $1000
}

export interface VelocityLimitParams {
  maxTotalUsd: string;    // e.g. "5000" for $5000 per window
  windowSeconds: number;
}

export interface AddressListParams {
  addresses: string[];
}
