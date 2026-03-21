import { config } from '../config';
import { BitGoClient } from '../bitgo/client';
import { BitGoExpressClient } from '../bitgo/express';

type BroadcastFn = (event: string, data: unknown) => void;

/**
 * Manages transfer confirmation tracking.
 *
 * Two modes:
 * 1. Webhook mode (WEBHOOK_URL set): Registers webhooks on BitGo via Express so their
 *    servers POST to our /api/webhook endpoint when transfers confirm.
 * 2. Polling mode (default): After each send, polls the transfer status until
 *    it moves from 'signed' → 'confirmed'. Works locally without a public URL.
 */
export class WebhookManager {
  private bitgoClient: BitGoClient;
  private expressClient: BitGoExpressClient;
  private broadcast: BroadcastFn;
  // Track which wallets already have webhooks registered
  private registeredWallets: Set<string> = new Set();
  // Track active polling timers so we can clean up
  private pollingTimers: Map<string, NodeJS.Timeout> = new Map();
  // Timestamp of last successful tunnel verification (0 = never verified)
  private tunnelLastVerifiedAt = 0;
  private static readonly TUNNEL_VERIFY_TTL_MS = 5 * 60 * 1000; // re-verify after 5 min
  // Track already-confirmed transfers to avoid duplicate broadcasts
  private confirmedTransfers: Set<string> = new Set();

  constructor(bitgoClient: BitGoClient, expressClient: BitGoExpressClient, broadcast: BroadcastFn) {
    this.bitgoClient = bitgoClient;
    this.expressClient = expressClient;
    this.broadcast = broadcast;
  }

  /**
   * Register webhooks for all agentic wallets (call at startup).
   * Ensures incoming deposits trigger webhook callbacks.
   */
  async registerWebhooksForWallets(walletEntries: Array<{ walletId: string; coin: string }>): Promise<void> {
    if (!config.webhookUrl) {
      console.log('WebhookManager: No WEBHOOK_URL configured, skipping bulk webhook registration');
      return;
    }
    console.log(`WebhookManager: Registering webhooks for ${walletEntries.length} agentic wallet(s)...`);
    for (const entry of walletEntries) {
      await this.ensureWebhook(entry.coin, entry.walletId);
    }
  }

  /**
   * Track a transfer after a successful send.
   * - If WEBHOOK_URL is set, registers a webhook on BitGo for real-time callbacks.
   * - Otherwise, polls the transfer status until confirmed.
   */
  async trackTransfer(
    coin: string,
    walletId: string,
    transferId: string,
    txid: string
  ): Promise<void> {
    if (config.webhookUrl) {
      // Webhook mode: verify tunnel is reachable, register webhook
      const webhookHealthy = await this.ensureWebhook(coin, walletId);
      if (webhookHealthy) return;
      // Tunnel is stale/unreachable — fall through to polling
    }
    // Polling mode: check transfer status periodically
    this.pollTransferStatus(coin, walletId, transferId, txid);
  }

  /**
   * Poll transfer status until it confirms or we give up.
   * Polls every 15s for up to 10 minutes.
   */
  private pollTransferStatus(
    coin: string,
    walletId: string,
    transferId: string,
    txid: string
  ): void {
    const pollKey = `${walletId}:${transferId}`;
    let attempts = 0;
    const maxAttempts = 40; // 40 * 15s = 10 minutes
    const intervalMs = 15_000;

    console.log(`Polling transfer ${transferId} (tx: ${txid}) for confirmation...`);

    const timer = setInterval(async () => {
      attempts++;

      try {
        const result = await this.bitgoClient.listTransfers(coin, walletId, 5);
        const transfer = result.transfers?.find(
          (t: any) => t.id === transferId || t.txid === txid
        );

        if (transfer) {
          const state = transfer.state;

          if (state === 'confirmed') {
            const dedupeKey = `${txid || transferId}-confirmed`;
            if (!this.confirmedTransfers.has(dedupeKey)) {
              this.confirmedTransfers.add(dedupeKey);
              console.log(`Transfer ${transferId} confirmed on-chain (tx: ${txid})`);
              const details = await this.fetchTransferDetails(coin, walletId, transferId, transfer);
              this.broadcast('transfer_update', {
                walletId,
                transferId,
                txid,
                coin,
                state: 'confirmed',
                confirmations: transfer.confirmations,
                timestamp: Date.now(),
                ...details,
              });
            }
            clearInterval(timer);
            this.pollingTimers.delete(pollKey);
            return;
          }

          if (state === 'failed' || state === 'rejected') {
            console.log(`Transfer ${transferId} ${state} (tx: ${txid})`);
            this.broadcast('transfer_update', {
              walletId,
              transferId,
              txid,
              coin,
              state,
              timestamp: Date.now(),
            });
            clearInterval(timer);
            this.pollingTimers.delete(pollKey);
            return;
          }

          // Still pending/signed — keep polling
          if (attempts % 4 === 0) {
            console.log(`Transfer ${transferId} still ${state} (attempt ${attempts}/${maxAttempts})`);
          }
        }
      } catch (err: any) {
        console.warn(`Poll error for transfer ${transferId}: ${err.message}`);
      }

      if (attempts >= maxAttempts) {
        console.log(`Stopped polling transfer ${transferId} after ${maxAttempts} attempts`);
        clearInterval(timer);
        this.pollingTimers.delete(pollKey);
      }
    }, intervalMs);

    this.pollingTimers.set(pollKey, timer);
  }

  /**
   * Webhook mode: ensure a transfer webhook is registered for a wallet.
   * Returns true if webhook is healthy, false if tunnel is stale/unreachable.
   */
  async ensureWebhook(coin: string, walletId: string): Promise<boolean> {
    const webhookCallbackUrl = `${config.webhookUrl}/api/webhook`;

    // Re-verify tunnel reachability if never verified or TTL has expired.
    // This catches dead tunnels mid-run (e.g. cloudflared crashed after startup).
    const tunnelStale = Date.now() - this.tunnelLastVerifiedAt > WebhookManager.TUNNEL_VERIFY_TTL_MS;
    if (tunnelStale) {
      try {
        const res = await fetch(webhookCallbackUrl, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: '{}', signal: AbortSignal.timeout(5000) });
        if (res.ok) {
          const firstVerify = this.tunnelLastVerifiedAt === 0;
          this.tunnelLastVerifiedAt = Date.now();
          if (firstVerify) console.log(`Webhook tunnel verified: ${config.webhookUrl}`);
        } else {
          this.tunnelLastVerifiedAt = 0;
          console.warn(`Webhook tunnel returned ${res.status} — falling back to polling`);
          return false;
        }
      } catch (err: any) {
        this.tunnelLastVerifiedAt = 0;
        console.warn(`Webhook tunnel unreachable (${config.webhookUrl}): ${err.message} — falling back to polling`);
        return false;
      }
    }

    if (this.registeredWallets.has(walletId)) return true;

    try {
      // Check existing webhooks — avoid registering duplicates across server restarts
      const existing = await this.expressClient.listWebhooks(coin, walletId);
      const webhooks: Array<{ type: string; url: string; id?: string }> = existing?.webhooks ?? existing ?? [];

      // If our current URL is already registered, reuse it
      const alreadyRegistered = webhooks.find((w) => w.type === 'transfer' && w.url === webhookCallbackUrl);
      if (alreadyRegistered) {
        this.registeredWallets.add(walletId);
        console.log(`Webhook already registered for wallet ${walletId} — reusing`);
        return true;
      }

      // Remove stale transfer webhooks for old URLs to stay under the wallet limit
      for (const w of webhooks) {
        if (w.type === 'transfer' && w.url !== webhookCallbackUrl) {
          try {
            await this.expressClient.removeWebhook(coin, walletId, { type: 'transfer', url: w.url });
            console.log(`Removed stale webhook for wallet ${walletId}: ${w.url}`);
          } catch (rmErr: any) {
            console.warn(`Could not remove stale webhook for wallet ${walletId}: ${rmErr.message}`);
          }
        }
      }

      await this.expressClient.addWebhook(coin, walletId, {
        type: 'transfer',
        url: webhookCallbackUrl,
      });
      this.registeredWallets.add(walletId);
      console.log(`Webhook registered for wallet ${walletId} (${coin}) → ${webhookCallbackUrl}`);
      return true;
    } catch (err: any) {
      if (err.message?.includes('already exists') || err.message?.includes('duplicate')) {
        this.registeredWallets.add(walletId);
        return true;
      } else {
        console.warn(`Failed to register webhook for wallet ${walletId}: ${err.message}`);
        return false;
      }
    }
  }

  /**
   * Handle an incoming webhook payload from BitGo (webhook mode only).
   */
  handleWebhookEvent(payload: Record<string, any>): void {
    const { type, hash, transfer, coin, wallet, state } = payload;
    console.log(`Webhook received: type=${type} coin=${coin} wallet=${wallet} hash=${hash} state=${state}`);

    if (type === 'transfer') {
      const dedupeKey = `${hash || transfer}-${state || 'confirmed'}`;
      if (this.confirmedTransfers.has(dedupeKey)) {
        console.log(`Webhook duplicate skipped: ${dedupeKey}`);
        return;
      }
      this.confirmedTransfers.add(dedupeKey);

      // Fetch full transfer details asynchronously
      this.fetchTransferDetails(coin, wallet, transfer, null).then((details) => {
        this.broadcast('transfer_update', {
          walletId: wallet,
          transferId: transfer,
          txid: hash,
          coin,
          state: state || 'confirmed',
          timestamp: Date.now(),
          ...details,
        });
      });
    }
  }

  /**
   * Fetch full transfer details for enriched confirmation messages.
   * Falls back gracefully if the API call fails.
   */
  private async fetchTransferDetails(
    coin: string,
    walletId: string,
    transferId: string,
    transferData: any
  ): Promise<Record<string, unknown>> {
    try {
      let transfer = transferData;
      if (!transfer?.entries && transferId && coin && walletId) {
        transfer = await this.expressClient.getTransfer(coin, walletId, transferId);
      }
      if (!transfer) return {};

      const entries = transfer.entries || [];
      const fromEntry = entries.find((e: any) => e.value < 0 || e.valueString?.startsWith('-'));
      const toEntry = entries.find((e: any) => e.value > 0 && !e.valueString?.startsWith('-'));

      // Get display-friendly amount
      const valueRaw = transfer.valueString || transfer.value?.toString() || '0';
      const absValue = valueRaw.startsWith('-') ? valueRaw.slice(1) : valueRaw;
      const displayAmount = this.expressClient.formatDisplayUnits(absValue, coin);

      return {
        amount: displayAmount,
        amountRaw: absValue,
        fromAddress: fromEntry?.address || '',
        toAddress: toEntry?.address || '',
        confirmations: transfer.confirmations || 0,
        feeString: transfer.feeString || transfer.fee?.toString() || '',
        displayFee: transfer.feeString
          ? this.expressClient.formatDisplayUnits(transfer.feeString, coin)
          : '',
        date: transfer.date || '',
      };
    } catch (err: any) {
      console.warn(`Failed to fetch transfer details: ${err.message}`);
      return {};
    }
  }

  /**
   * Clean up all polling timers (e.g., on server shutdown).
   */
  cleanup(): void {
    for (const timer of this.pollingTimers.values()) {
      clearInterval(timer);
    }
    this.pollingTimers.clear();
  }
}
