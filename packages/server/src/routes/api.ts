import { Router } from 'express';
import type { Request, Response } from 'express-serve-static-core';
import { AuditLogger } from '../audit/logger';
import { PolicyEngine } from '../guard/layer3-policy';
import { PolicyRule } from '../guard/types';
import { WebhookManager } from '../webhooks/manager';
import { PassphraseVault } from '../bitgo/vault';
import { BitGoExpressClient } from '../bitgo/express';

export function createApiRouter(
  auditLogger: AuditLogger,
  policyEngine: PolicyEngine,
  webhookManager?: WebhookManager,
  vault?: PassphraseVault,
  expressClient?: BitGoExpressClient
): Router {
  const router = Router();

  // --- Audit Trail ---
  router.get('/audit', (req: Request, res: Response) => {
    const { tool, status, limit } = req.query;
    const entries = auditLogger.getEntries({
      tool: tool as string,
      status: status as string,
      limit: limit ? parseInt(limit as string, 10) : 50,
    });
    res.json({ entries });
  });

  // --- Policies ---
  router.get('/policies', (req: Request, res: Response) => {
    const { walletId } = req.query;
    if (walletId) {
      res.json({ rules: policyEngine.getRulesForWallet(walletId as string) });
    } else {
      res.json({ rules: policyEngine.getRules() });
    }
  });

  router.post('/policies', (req: Request, res: Response) => {
    const rule = req.body as PolicyRule;
    if (!rule.id || !rule.type) {
      res.status(400).json({ error: 'Rule must have id and type' });
      return;
    }
    policyEngine.addRule(rule);
    res.json({ success: true, rule });
  });

  router.delete('/policies/:id', (req: Request, res: Response) => {
    const removed = policyEngine.removeRule(req.params.id as string);
    if (removed) {
      res.json({ success: true });
    } else {
      res.status(404).json({ error: 'Rule not found' });
    }
  });

  router.patch('/policies/:id/toggle', (req: Request, res: Response) => {
    const { enabled } = req.body;
    const toggled = policyEngine.toggleRule(req.params.id as string, enabled);
    if (toggled) {
      res.json({ success: true });
    } else {
      res.status(404).json({ error: 'Rule not found' });
    }
  });

  // --- Pending Approvals ---
  router.get('/approvals', (_req: Request, res: Response) => {
    res.json({ approvals: auditLogger.getPendingApprovals() });
  });

  router.post('/approvals/:id/resolve', (req: Request, res: Response) => {
    const { decision } = req.body;
    if (decision !== 'approved' && decision !== 'rejected') {
      res.status(400).json({ error: 'Decision must be "approved" or "rejected"' });
      return;
    }
    const approval = auditLogger.resolveApproval(req.params.id as string, decision);
    if (approval) {
      res.json({ success: true, approval });
    } else {
      res.status(404).json({ error: 'Approval not found or already resolved' });
    }
  });

  // --- Wallets (auto-fetch from BitGo) ---
  router.get('/wallets', async (_req: Request, res: Response) => {
    if (!expressClient) {
      res.json({ wallets: [] });
      return;
    }
    try {
      const data = await expressClient.listAllWallets();
      res.json(data);
    } catch (err: any) {
      res.status(500).json({ error: err.message || 'Failed to fetch wallets' });
    }
  });

  // --- Vault Wallet IDs ---
  router.get('/vault/wallets', (_req: Request, res: Response) => {
    const walletIds = vault ? vault.listWalletIds() : [];
    res.json({ walletIds });
  });

  // --- Transfers (fetch from all agentic wallets, paginated) ---
  router.get('/transfers', async (req: Request, res: Response) => {
    if (!expressClient || !vault) {
      res.json({ transfers: [], nextBatchToken: null });
      return;
    }
    const limit = parseInt(req.query.limit as string, 10) || 20;
    const prevId = req.query.prevId as string | undefined;
    const walletEntries = vault.listWalletEntries();

    if (walletEntries.length === 0) {
      res.json({ transfers: [], nextBatchToken: null });
      return;
    }

    try {
      // Fetch transfers from all agentic wallets in parallel
      const results = await Promise.allSettled(
        walletEntries.map((entry) =>
          expressClient!.listTransfers(entry.coin, entry.walletId, {
            limit,
            prevId,
          }).then((data: any) => ({
            walletId: entry.walletId,
            walletLabel: entry.label,
            coin: entry.coin,
            transfers: data.transfers || [],
            nextBatchToken: data.nextBatchToken || null,
          }))
        )
      );

      // Merge all transfers, tag with wallet info
      const allTransfers: any[] = [];
      const nextTokens: Record<string, string> = {};

      for (const r of results) {
        if (r.status === 'fulfilled') {
          for (const t of r.value.transfers) {
            const rawValue = t.valueString || String(t.value || '0');
            const coin = t.coin || r.value.coin;
            // Determine direction: negative valueString = send, positive = receive
            const isNegative = rawValue.startsWith('-');
            const absValue = isNegative ? rawValue.slice(1) : rawValue;
            const displayValue = expressClient!.formatDisplayUnits(absValue, coin);
            // Extract from/to from entries (negative value = sender, positive = receiver)
            const entries = t.entries || [];
            const fromEntry = entries.find((e: any) => e.value < 0 || e.valueString?.startsWith('-'));
            const toEntry = entries.find((e: any) => e.value > 0 && !e.valueString?.startsWith('-'));
            allTransfers.push({
              id: t.id,
              txid: t.txid || '',
              coin,
              walletId: r.value.walletId,
              walletLabel: r.value.walletLabel,
              type: isNegative ? 'send' : 'receive',
              value: displayValue,
              state: t.state,
              date: t.date,
              confirmations: t.confirmations,
              fromAddress: fromEntry?.address || '',
              toAddress: toEntry?.address || '',
            });
          }
          if (r.value.nextBatchToken) {
            nextTokens[r.value.walletId] = r.value.nextBatchToken;
          }
        }
      }

      // Sort by date descending
      allTransfers.sort((a, b) => {
        const da = new Date(a.date || 0).getTime();
        const db = new Date(b.date || 0).getTime();
        return db - da;
      });

      res.json({
        transfers: allTransfers.slice(0, limit),
        nextBatchToken: Object.keys(nextTokens).length > 0 ? JSON.stringify(nextTokens) : null,
      });
    } catch (err: any) {
      res.status(500).json({ error: err.message || 'Failed to fetch transfers' });
    }
  });

  // --- Webhook Receiver (BitGo → our server) ---
  router.post('/webhook', (req: Request, res: Response) => {
    if (webhookManager) {
      webhookManager.handleWebhookEvent(req.body);
    }
    // Always respond 200 so BitGo doesn't retry
    res.json({ success: true });
  });

  return router;
}
