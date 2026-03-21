import { config } from '../config';

/**
 * BitGo SDK client wrapper for READ operations.
 * Uses the BitGo SDK directly for wallet queries, balance checks, and transfer listings.
 */
export class BitGoClient {
  private bitgo: any;
  private initialized = false;

  async init(): Promise<void> {
    if (this.initialized) return;
    // Dynamic import to handle bitgo's module system
    const { BitGo } = await import('bitgo');
    this.bitgo = new BitGo({
      env: config.bitgo.env,
      accessToken: config.bitgo.accessToken,
    });
    this.initialized = true;
    console.log(`BitGo SDK initialized (env: ${config.bitgo.env})`);
  }

  async listWallets(coin: string, limit = 25): Promise<any> {
    await this.init();
    const coinInstance = this.bitgo.coin(coin);
    const result = await coinInstance.wallets().list({ limit });
    return {
      wallets: result.wallets.map((w: any) => ({
        id: w.id(),
        label: w.label(),
        coin: coin,
        balance: w.balanceString(),
        confirmedBalance: w.confirmedBalanceString(),
        spendableBalance: w.spendableBalanceString(),
        receiveAddress: w.receiveAddress(),
      })),
    };
  }

  async getWallet(coin: string, walletId: string): Promise<any> {
    await this.init();
    const wallet = await this.bitgo.coin(coin).wallets().get({ id: walletId });
    return {
      id: wallet.id(),
      label: wallet.label(),
      coin,
      balance: wallet.balanceString(),
      confirmedBalance: wallet.confirmedBalanceString(),
      spendableBalance: wallet.spendableBalanceString(),
      receiveAddress: wallet.receiveAddress(),
      type: wallet.type(),
    };
  }

  async getMaxSpendable(coin: string, walletId: string): Promise<any> {
    await this.init();
    const wallet = await this.bitgo.coin(coin).wallets().get({ id: walletId });
    return await wallet.maximumSpendable({});
  }

  async listTransfers(coin: string, walletId: string, limit = 10): Promise<any> {
    await this.init();
    const wallet = await this.bitgo.coin(coin).wallets().get({ id: walletId });
    const result = await wallet.transfers({ limit });
    return {
      transfers: result.transfers.map((t: any) => ({
        id: t.id,
        coin: t.coin,
        txid: t.txid,
        type: t.type,
        value: t.valueString,
        state: t.state,
        date: t.date,
        confirmations: t.confirmations,
      })),
    };
  }

  async createPolicyRule(
    coin: string,
    walletId: string,
    params: { id: string; type: string; condition: any; action: any }
  ): Promise<any> {
    await this.init();
    const wallet = await this.bitgo.coin(coin).wallets().get({ id: walletId });
    return await wallet.createPolicyRule(params);
  }

  async addWebhook(
    coin: string,
    walletId: string,
    params: { type: string; url: string }
  ): Promise<any> {
    await this.init();
    const wallet = await this.bitgo.coin(coin).wallets().get({ id: walletId });
    return await wallet.addWebhook(params);
  }
}
