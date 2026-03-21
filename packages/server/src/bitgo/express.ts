import { config } from '../config';

/**
 * BitGo Express HTTP client for WRITE/signing operations.
 * Calls the BitGo Express Docker container on localhost:3080.
 */
export class BitGoExpressClient {
  private baseUrl: string;
  private accessToken: string;
  private bitgo: any = null;

  constructor() {
    this.baseUrl = config.bitgo.expressUrl;
    this.accessToken = config.bitgo.accessToken;
  }

  async initSdk(): Promise<void> {
    if (this.bitgo) return;
    const { BitGo } = await import('bitgo');
    this.bitgo = new BitGo({ env: config.bitgo.env });
  }

  /**
   * Use bitgojs SDK coin.getBaseFactor() to convert base units to display units.
   */
  formatDisplayUnits(baseUnits: string, coin: string): string {
    return this.formatBaseUnits(baseUnits, coin);
  }

  private formatBaseUnits(baseUnits: string, coin: string): string {
    if (!this.bitgo || !baseUnits || baseUnits === '0') return '0';
    try {
      const coinInstance = this.bitgo.coin(coin);
      const baseFactor = coinInstance.getBaseFactor();
      if (!baseFactor || baseFactor === 0) return baseUnits;
      const raw = BigInt(baseUnits);
      const divisor = BigInt(baseFactor);
      const whole = raw / divisor;
      const frac = raw % divisor;
      if (frac === 0n) return whole.toString();
      const decimals = Math.round(Math.log10(Number(baseFactor)));
      const fracStr = frac.toString().padStart(decimals, '0').replace(/0+$/, '');
      return `${whole}.${fracStr}`;
    } catch {
      return baseUnits;
    }
  }

  private async request(method: string, path: string, body?: unknown): Promise<any> {
    const url = `${this.baseUrl}${path}`;
    const response = await fetch(url, {
      method,
      headers: {
        Authorization: `Bearer ${this.accessToken}`,
        'Content-Type': 'application/json',
      },
      body: body ? JSON.stringify(body) : undefined,
    });

    const data = await response.json() as Record<string, any>;
    if (!response.ok) {
      throw new Error(
        `BitGo Express error (${response.status}): ${data.message || data.error || JSON.stringify(data)}`
      );
    }
    return data;
  }

  /**
   * List all wallets across all coins using GET /api/v2/wallets.
   * Optionally filter by coin.
   */
  async listAllWallets(params: { coin?: string; limit?: number } = {}): Promise<any> {
    await this.initSdk();
    const query = new URLSearchParams();
    query.set('expandBalance', 'true');
    if (params.limit) query.set('limit', String(params.limit));
    if (params.coin) query.set('coin', params.coin);
    const qs = query.toString() ? `?${query.toString()}` : '';
    const data = await this.request('GET', `/api/v2/wallets${qs}`);
    return {
      wallets: (data.wallets || []).map((w: any) => {
        // receiveAddress can be a string or an object with .address
        let addr = '';
        if (typeof w.receiveAddress === 'string') {
          addr = w.receiveAddress;
        } else if (w.receiveAddress?.address) {
          addr = w.receiveAddress.address;
        } else if (w.coinSpecific?.baseAddress) {
          addr = w.coinSpecific.baseAddress;
        }
        const balanceRaw = w.balanceString || String(w.balance || '0');
        const spendableRaw = w.spendableBalanceString || String(w.spendableBalance || '0');
        return {
          id: w.id,
          label: w.label,
          coin: w.coin,
          balance: this.formatBaseUnits(balanceRaw, w.coin),
          balanceRaw: balanceRaw,
          spendableBalance: this.formatBaseUnits(spendableRaw, w.coin),
          spendableBalanceRaw: spendableRaw,
          receiveAddress: addr,
          startDate: w.startDate || '',
        };
      }),
    };
  }

  /**
   * Determine the correct walletVersion for a coin using the SDK.
   * EVM TSS coins need version 5; others use default.
   */
  private getWalletVersion(coin: string): number | undefined {
    if (!this.bitgo) return undefined;
    try {
      const coinInstance = this.bitgo.coin(coin);
      const isEvm = typeof coinInstance.isEVM === 'function' && coinInstance.isEVM();
      const isTss = typeof coinInstance.supportsTss === 'function' && coinInstance.supportsTss();
      if (isEvm || isTss) {
        return 5;
      }
      return undefined;
    } catch {
      return undefined;
    }
  }

  /**
   * Get a single wallet by ID using GET /api/v2/wallet/{walletId}.
   * No coin parameter needed — the API resolves it automatically.
   */
  async getWallet(walletId: string): Promise<any> {
    await this.initSdk();
    const data = await this.request('GET', `/api/v2/wallet/${walletId}`);
    const coin = data.coin || '';
    const balanceRaw = data.balanceString || String(data.balance || '0');
    const spendableRaw = data.spendableBalanceString || String(data.spendableBalance || '0');
    let addr = '';
    if (typeof data.receiveAddress === 'string') {
      addr = data.receiveAddress;
    } else if (data.receiveAddress?.address) {
      addr = data.receiveAddress.address;
    } else if (data.coinSpecific?.baseAddress) {
      addr = data.coinSpecific.baseAddress;
    }
    return {
      id: data.id,
      label: data.label,
      coin,
      balance: this.formatBaseUnits(balanceRaw, coin),
      balanceRaw,
      spendableBalance: this.formatBaseUnits(spendableRaw, coin),
      spendableBalanceRaw: spendableRaw,
      receiveAddress: addr,
      type: data.type,
      multisigType: data.multisigType,
    };
  }

  async generateWallet(
    coin: string,
    params: {
      label: string;
      passphrase: string;
      enterprise?: string;
      walletVersion?: number;
    }
  ): Promise<any> {
    await this.initSdk();
    const walletVersion = params.walletVersion !== undefined ? params.walletVersion : this.getWalletVersion(coin);
    const body: Record<string, unknown> = {
      label: params.label,
      passphrase: params.passphrase,
      enterprise: params.enterprise || config.bitgo.enterpriseId,
      type: 'hot',
    };
    if (walletVersion !== undefined) {
      body.walletVersion = walletVersion;
    }
    // walletVersion 0/1/2 = multisig (onchain); 3/5/6 = TSS (default for EVM/TSS coins)
    if (walletVersion !== undefined && walletVersion <= 2) {
      body.multisigType = 'onchain';
    }
    return this.request('POST', `/api/v2/${coin}/wallet/generate`, body);
  }

  async createAddress(
    coin: string,
    walletId: string,
    params: { label?: string } = {}
  ): Promise<any> {
    return this.request('POST', `/api/v2/${coin}/wallet/${walletId}/address`, params);
  }

  async sendTransaction(
    coin: string,
    walletId: string,
    params: {
      address: string;
      amount: string;
      walletPassphrase: string;
    }
  ): Promise<any> {
    await this.initSdk();
    const body: Record<string, unknown> = { ...params };
    // TSS wallets (EVM, etc.) require type: 'transfer' for sendcoins
    try {
      const coinInstance = this.bitgo.coin(coin);
      if (typeof coinInstance.supportsTss === 'function' && coinInstance.supportsTss()) {
        body.type = 'transfer';
      }
    } catch {
      // If coin lookup fails, send without type and let Express handle it
    }
    return this.request('POST', `/api/v2/${coin}/wallet/${walletId}/sendcoins`, body);
  }

  async sendMany(
    coin: string,
    walletId: string,
    params: {
      recipients: Array<{ address: string; amount: string }>;
      walletPassphrase: string;
    }
  ): Promise<any> {
    await this.initSdk();
    const body: Record<string, unknown> = { ...params };
    try {
      const coinInstance = this.bitgo.coin(coin);
      if (typeof coinInstance.supportsTss === 'function' && coinInstance.supportsTss()) {
        body.type = 'transfer';
      }
    } catch {
      // fallback: send without type
    }
    return this.request('POST', `/api/v2/${coin}/wallet/${walletId}/sendmany`, body);
  }

  async consolidateUnspents(
    coin: string,
    walletId: string,
    params: { walletPassphrase: string }
  ): Promise<any> {
    return this.request(
      'POST',
      `/api/v2/${coin}/wallet/${walletId}/consolidateunspents`,
      params
    );
  }

  async sweep(
    coin: string,
    walletId: string,
    params: {
      address: string;
      walletPassphrase: string;
    }
  ): Promise<any> {
    return this.request('POST', `/api/v2/${coin}/wallet/${walletId}/sweep`, params);
  }

  async updateWallet(
    coin: string,
    walletId: string,
    params: { label?: string }
  ): Promise<any> {
    return this.request('PUT', `/api/v2/${coin}/wallet/${walletId}`, params);
  }

  async listTransfers(
    coin: string,
    walletId: string,
    params: { limit?: number; prevId?: string } = {}
  ): Promise<any> {
    const query = new URLSearchParams();
    if (params.limit) query.set('limit', String(params.limit));
    if (params.prevId) query.set('prevId', params.prevId);
    const qs = query.toString() ? `?${query.toString()}` : '';
    return this.request('GET', `/api/v2/${coin}/wallet/${walletId}/transfer${qs}`);
  }

  async addWebhook(
    coin: string,
    walletId: string,
    params: { type: string; url: string }
  ): Promise<any> {
    return this.request('POST', `/api/v2/${coin}/wallet/${walletId}/webhooks`, params);
  }

  async getTransfer(
    coin: string,
    walletId: string,
    transferId: string
  ): Promise<any> {
    return this.request('GET', `/api/v2/${coin}/wallet/${walletId}/transfer/${transferId}`);
  }

  async listAddresses(
    coin: string,
    walletId: string,
    params: { limit?: number } = {}
  ): Promise<any> {
    const query = new URLSearchParams();
    if (params.limit) query.set('limit', String(params.limit));
    const qs = query.toString() ? `?${query.toString()}` : '';
    return this.request('GET', `/api/v2/${coin}/wallet/${walletId}/addresses${qs}`);
  }

  async freezeWallet(
    coin: string,
    walletId: string,
    params: { duration?: number } = {}
  ): Promise<any> {
    return this.request('POST', `/api/v2/${coin}/wallet/${walletId}/freeze`, {
      duration: params.duration || 86400,
    });
  }

  async getFeeEstimate(coin: string, params: { numBlocks?: number } = {}): Promise<any> {
    const query = new URLSearchParams();
    if (params.numBlocks) query.set('numBlocks', String(params.numBlocks));
    const qs = query.toString() ? `?${query.toString()}` : '';
    return this.request('GET', `/api/v2/${coin}/tx/fee${qs}`);
  }

  async listPendingApprovals(params: { walletId?: string } = {}): Promise<any> {
    const query = new URLSearchParams();
    if (params.walletId) query.set('walletId', params.walletId);
    if (config.bitgo.enterpriseId) query.set('enterprise', config.bitgo.enterpriseId);
    const qs = query.toString() ? `?${query.toString()}` : '';
    return this.request('GET', `/api/v2/pendingApprovals${qs}`);
  }

  async updatePendingApproval(
    approvalId: string,
    params: { state: string; otp?: string; walletPassphrase?: string }
  ): Promise<any> {
    return this.request('PUT', `/api/v2/pendingapprovals/${approvalId}`, params);
  }

  async accelerateTransaction(
    coin: string,
    walletId: string,
    params: { txid: string; walletPassphrase: string; feeRate?: number }
  ): Promise<any> {
    return this.request('POST', `/api/v2/${coin}/wallet/${walletId}/acceleratetx`, params);
  }

  async fanoutUnspents(
    coin: string,
    walletId: string,
    params: { walletPassphrase: string; target?: number }
  ): Promise<any> {
    return this.request('POST', `/api/v2/${coin}/wallet/${walletId}/fanoutunspents`, params);
  }

  async listWebhooks(coin: string, walletId: string): Promise<any> {
    return this.request('GET', `/api/v2/${coin}/wallet/${walletId}/webhooks`);
  }

  async removeWebhook(
    coin: string,
    walletId: string,
    params: { type: string; url: string }
  ): Promise<any> {
    return this.request('DELETE', `/api/v2/${coin}/wallet/${walletId}/webhooks`, params);
  }

  async listPolicyRules(walletId: string): Promise<any> {
    const data = await this.request('GET', `/api/v2/wallet/${walletId}`);
    return {
      walletId,
      coin: data.coin,
      label: data.label,
      rules: data.admin?.policy?.rules ?? [],
    };
  }

  async createPolicyRule(
    coin: string,
    walletId: string,
    params: { id: string; type: string; condition: any; action: any }
  ): Promise<any> {
    return this.request('POST', `/api/v2/${coin}/wallet/${walletId}/policy/rule`, params);
  }

  async updatePolicyRule(
    coin: string,
    walletId: string,
    params: { id: string; type: string; condition: any; action: any }
  ): Promise<any> {
    return this.request('PUT', `/api/v2/${coin}/wallet/${walletId}/policy/rule`, params);
  }

  async deletePolicyRule(
    coin: string,
    walletId: string,
    params: { id: string; type: string; action: any }
  ): Promise<any> {
    return this.request('DELETE', `/api/v2/${coin}/wallet/${walletId}/policy/rule`, params);
  }

  async verifyAddress(coin: string, params: { address: string }): Promise<any> {
    return this.request('POST', `/api/v2/${coin}/verifyaddress`, params);
  }

  async listUnspents(
    coin: string,
    walletId: string,
    params: { limit?: number } = {}
  ): Promise<any> {
    const query = new URLSearchParams();
    if (params.limit) query.set('limit', String(params.limit));
    const qs = query.toString() ? `?${query.toString()}` : '';
    return this.request('GET', `/api/v2/${coin}/wallet/${walletId}/unspents${qs}`);
  }

  async shareWallet(
    coin: string,
    walletId: string,
    params: { email: string; permissions: string; walletPassphrase: string }
  ): Promise<any> {
    return this.request('POST', `/api/v2/${coin}/wallet/${walletId}/share`, params);
  }

  async buildTransaction(
    coin: string,
    walletId: string,
    params: { recipients: Array<{ address: string; amount: string }> }
  ): Promise<any> {
    return this.request('POST', `/api/v2/${coin}/wallet/${walletId}/tx/build`, params);
  }

  async changeFee(
    coin: string,
    walletId: string,
    params: { txid: string; fee?: string; walletPassphrase: string }
  ): Promise<any> {
    return this.request('POST', `/api/v2/${coin}/wallet/${walletId}/tx/changeFee`, params);
  }

  async recoverToken(
    coin: string,
    walletId: string,
    params: { tokenContractAddress: string; recipient: string; walletPassphrase: string }
  ): Promise<any> {
    return this.request('POST', `/api/v2/${coin}/wallet/${walletId}/recovertoken`, params);
  }

  async consolidateAccount(
    coin: string,
    walletId: string,
    params: { walletPassphrase: string; consolidateAddresses?: string[] }
  ): Promise<any> {
    return this.request('POST', `/api/v2/${coin}/wallet/${walletId}/consolidateAccount`, params);
  }

  async enableTokens(
    coin: string,
    walletId: string,
    params: { tokens: string[]; walletPassphrase: string }
  ): Promise<any> {
    return this.request('POST', `/api/v2/${coin}/wallet/${walletId}/enableTokens`, params);
  }

  async isWalletAddress(
    coin: string,
    walletId: string,
    params: { address: string }
  ): Promise<any> {
    return this.request('POST', `/api/v2/${coin}/wallet/${walletId}/iswalletaddress`, params);
  }

  async getCanonicalAddress(coin: string, params: { address: string }): Promise<any> {
    return this.request('POST', `/api/v2/${coin}/canonicaladdress`, params);
  }

  async prebuildAndSignTransaction(
    coin: string,
    walletId: string,
    params: {
      recipients: Array<{ address: string; amount: string }>;
      walletPassphrase: string;
    }
  ): Promise<any> {
    await this.initSdk();
    const body: Record<string, unknown> = { ...params };
    try {
      const coinInstance = this.bitgo.coin(coin);
      if (typeof coinInstance.supportsTss === 'function' && coinInstance.supportsTss()) {
        body.type = 'transfer';
      }
    } catch {
      // fallback
    }
    return this.request('POST', `/api/v2/${coin}/wallet/${walletId}/prebuildAndSignTransaction`, body);
  }

  async acceptWalletShare(
    coin: string,
    shareId: string,
    params: { userPassword?: string }
  ): Promise<any> {
    return this.request('POST', `/api/v2/${coin}/walletshare/${shareId}/acceptshare`, params);
  }

  async payLightningInvoice(
    coin: string,
    walletId: string,
    params: { invoice: string; walletPassphrase: string }
  ): Promise<any> {
    return this.request('POST', `/api/v2/${coin}/wallet/${walletId}/lightning/payment`, params);
  }

  async lightningWithdraw(
    coin: string,
    walletId: string,
    params: { amount: string; address: string; walletPassphrase: string }
  ): Promise<any> {
    return this.request('POST', `/api/v2/${coin}/wallet/${walletId}/lightning/withdraw`, params);
  }

  async healthCheck(): Promise<boolean> {
    try {
      const response = await fetch(`${this.baseUrl}/api/v2/ping`, {
        headers: { Authorization: `Bearer ${this.accessToken}` },
      });
      return response.ok;
    } catch {
      return false;
    }
  }
}
