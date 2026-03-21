import { BitGoClient } from '../bitgo/client';
import { BitGoExpressClient } from '../bitgo/express';
import { PassphraseVault } from '../bitgo/vault';
import { WebhookManager } from '../webhooks/manager';
import { config } from '../config';

export class ToolHandlers {
  private sdk: BitGoClient;
  private express: BitGoExpressClient;
  private vault: PassphraseVault;
  private webhookManager?: WebhookManager;

  constructor(sdk: BitGoClient, express: BitGoExpressClient, vault: PassphraseVault, webhookManager?: WebhookManager) {
    this.sdk = sdk;
    this.express = express;
    this.vault = vault;
    this.webhookManager = webhookManager;
  }

  async execute(toolName: string, input: Record<string, unknown>): Promise<unknown> {
    switch (toolName) {
      case 'list_wallets': {
        const result = await this.express.listAllWallets({
          coin: input.coin as string | undefined,
          limit: input.limit as number | undefined,
        });
        // Annotate which wallets are agentic (managed by the agent, passphrase in vault)
        const vaultIds = new Set(this.vault.listWalletIds());
        if (result.wallets) {
          result.wallets = result.wallets.map((w: any) => ({
            ...w,
            isAgentic: vaultIds.has(w.id),
          }));
        }
        return result;
      }

      case 'get_wallet': {
        const wallet = await this.express.getWallet(input.walletId as string);
        wallet.isAgentic = this.vault.has(input.walletId as string);
        return wallet;
      }

      case 'get_max_spendable':
        return this.sdk.getMaxSpendable(input.coin as string, input.walletId as string);

      case 'list_transfers':
        return this.sdk.listTransfers(
          input.coin as string,
          input.walletId as string,
          input.limit as number | undefined
        );

      case 'generate_wallet':
        return this.handleGenerateWallet(input);

      case 'create_address':
        return this.express.createAddress(input.coin as string, input.walletId as string, {
          label: input.label as string | undefined,
        });

      case 'send_transaction':
        return this.handleSendTransaction(input);

      case 'send_many':
        return this.handleSendMany(input);

      case 'list_policy_rules':
        return this.express.listPolicyRules(input.walletId as string);

      case 'add_policy_rule': {
        const coin = input.coin as string;
        const walletId = input.walletId as string;
        const ruleId = input.ruleId as string;
        const type = input.type as string;
        const action = (input.action as any) ?? { type: 'deny' };
        const addresses = input.addresses as string[] | undefined;

        if (type === 'advancedWhitelist') {
          // Step 1: Create the empty whitelist rule
          await this.express.createPolicyRule(coin, walletId, { id: ruleId, type, condition: {}, action });
          // Step 2: Add each address via PUT
          let result: any;
          for (const address of (addresses ?? [])) {
            result = await this.express.updatePolicyRule(coin, walletId, {
              id: ruleId,
              type,
              condition: { add: { type: 'address', item: address } },
              action,
            });
          }
          return result ?? { success: true, ruleId };
        }

        return this.express.createPolicyRule(coin, walletId, {
          id: ruleId,
          type,
          condition: (input.condition as any) ?? {},
          action,
        });
      }

      case 'manage_webhook':
        return this.sdk.addWebhook(input.coin as string, input.walletId as string, {
          type: input.type as string,
          url: input.url as string,
        });

      case 'update_wallet':
        return this.express.updateWallet(
          input.coin as string,
          input.walletId as string,
          { label: input.label as string }
        );

      case 'consolidate_utxos':
        return this.handleConsolidate(input);

      case 'sweep_wallet':
        return this.handleSweep(input);

      case 'get_transfer':
        return this.express.getTransfer(
          input.coin as string,
          input.walletId as string,
          input.transferId as string
        );

      case 'list_addresses':
        return this.express.listAddresses(input.coin as string, input.walletId as string, {
          limit: input.limit as number | undefined,
        });

      case 'freeze_wallet':
        return this.express.freezeWallet(input.coin as string, input.walletId as string, {
          duration: input.duration as number | undefined,
        });

      case 'get_fee_estimate':
        return this.express.getFeeEstimate(input.coin as string, {
          numBlocks: input.numBlocks as number | undefined,
        });

      case 'list_pending_approvals':
        return this.express.listPendingApprovals({
          walletId: input.walletId as string | undefined,
        });

      case 'update_pending_approval':
        return this.handleUpdatePendingApproval(input);

      case 'accelerate_transaction':
        return this.handleAccelerateTransaction(input);

      case 'fanout_utxos':
        return this.handleFanout(input);

      case 'list_webhooks':
        return this.express.listWebhooks(input.coin as string, input.walletId as string);

      case 'remove_webhook':
        return this.express.removeWebhook(input.coin as string, input.walletId as string, {
          type: input.type as string,
          url: input.url as string,
        });

      case 'update_policy_rule': {
        const coin = input.coin as string;
        const walletId = input.walletId as string;
        const ruleId = input.ruleId as string;
        const type = input.type as string;
        const action = input.action as any;
        const addAddresses = input.addAddresses as string[] | undefined;
        const removeAddresses = input.removeAddresses as string[] | undefined;

        if (type === 'advancedWhitelist') {
          let result: any;
          for (const address of (addAddresses ?? [])) {
            result = await this.express.updatePolicyRule(coin, walletId, {
              id: ruleId, type, action,
              condition: { add: { type: 'address', item: address } },
            });
          }
          for (const address of (removeAddresses ?? [])) {
            result = await this.express.updatePolicyRule(coin, walletId, {
              id: ruleId, type, action,
              condition: { remove: { type: 'address', item: address } },
            });
          }
          return result ?? { success: true };
        }

        return this.express.updatePolicyRule(coin, walletId, {
          id: ruleId,
          type,
          condition: (input.condition as any) ?? {},
          action,
        });
      }

      case 'delete_policy_rule':
        return this.express.deletePolicyRule(input.coin as string, input.walletId as string, {
          id: input.ruleId as string,
          type: input.type as string,
          action: (input.action as any) ?? { type: 'deny' },
        });

      case 'verify_address':
        return this.express.verifyAddress(input.coin as string, {
          address: input.address as string,
        });

      case 'list_unspents':
        return this.express.listUnspents(input.coin as string, input.walletId as string, {
          limit: input.limit as number | undefined,
        });

      case 'share_wallet':
        return this.handleShareWallet(input);

      case 'build_transaction':
        return this.express.buildTransaction(input.coin as string, input.walletId as string, {
          recipients: input.recipients as Array<{ address: string; amount: string }>,
        });

      case 'change_fee':
        return this.handleChangeFee(input);

      case 'recover_token':
        return this.handleRecoverToken(input);

      case 'consolidate_account':
        return this.handleConsolidateAccount(input);

      case 'enable_tokens':
        return this.handleEnableTokens(input);

      case 'is_wallet_address':
        return this.express.isWalletAddress(
          input.coin as string,
          input.walletId as string,
          { address: input.address as string }
        );

      case 'get_canonical_address':
        return this.express.getCanonicalAddress(input.coin as string, {
          address: input.address as string,
        });

      case 'prebuild_and_sign_transaction':
        return this.handlePrebuildAndSign(input);

      case 'accept_wallet_share':
        return this.express.acceptWalletShare(
          input.coin as string,
          input.shareId as string,
          { userPassword: input.userPassword as string | undefined }
        );

      case 'pay_lightning_invoice':
        return this.handlePayLightningInvoice(input);

      case 'lightning_withdraw':
        return this.handleLightningWithdraw(input);

      case 'search_bitgo_docs':
        return this.handleSearchDocs(input);

      case 'web_search':
        return this.handleWebSearch(input);

      case 'web_fetch':
        return this.handleWebFetch(input);

      case 'calculate':
        return this.handleCalculate(input);

      case 'get_crypto_price':
        return this.handleGetCryptoPrice(input);

      case 'get_current_time':
        return this.handleGetCurrentTime();

      default:
        throw new Error(`Unknown tool: ${toolName}`);
    }
  }

  private async handleGenerateWallet(input: Record<string, unknown>): Promise<unknown> {
    const coin = input.coin as string;
    const label = input.label as string;
    const walletVersion = input.walletVersion as number | undefined;

    // Generate and store passphrase in vault
    const passphrase = this.vault.generatePassphrase();

    const result = await this.express.generateWallet(coin, {
      label,
      passphrase,
      enterprise: config.bitgo.enterpriseId || undefined,
      walletVersion,
    });

    // Store passphrase in vault
    const walletId = result.wallet?.id || result.id;
    const backupKey = result.backupKeychain?.prv;
    this.vault.store(walletId, coin, label, passphrase, backupKey);

    // Register webhook for the new wallet so incoming deposits are captured
    this.webhookManager?.ensureWebhook(coin, walletId).catch(() => {});

    // Return wallet info (never the passphrase)
    return {
      walletId,
      label,
      coin,
      receiveAddress: result.wallet?.receiveAddress,
      message: 'Wallet created successfully. Passphrase securely stored in vault.',
    };
  }

  private async handleSendTransaction(input: Record<string, unknown>): Promise<unknown> {
    const walletId = input.walletId as string;
    const coin = input.coin as string;
    const passphrase = this.vault.retrieve(walletId);
    if (!passphrase) {
      throw new Error(
        `No passphrase found in vault for wallet ${walletId}. Was this wallet created by the agent?`
      );
    }

    const result = await this.express.sendTransaction(coin, walletId, {
      address: input.address as string,
      amount: input.amount as string,
      walletPassphrase: passphrase,
    });

    // Track transfer for on-chain confirmation (via polling or webhook)
    const transferId = result.transfer?.id || result.transferId;
    const txid = result.transfer?.txid || result.txid;
    if (transferId || txid) {
      this.webhookManager?.trackTransfer(coin, walletId, transferId, txid).catch(() => {});
    }

    // Augment with display-formatted amount using BitGo SDK base factor (same
    // pattern as api.ts and webhooks/manager.ts) so the UI never needs to
    // do its own unit conversion.
    if (result.transfer) {
      const rawValue = result.transfer.valueString || String(result.transfer.value || input.amount || '0');
      const absValue = rawValue.startsWith('-') ? rawValue.slice(1) : rawValue;
      result.transfer.displayAmount = this.express.formatDisplayUnits(absValue, coin);
    }

    return result;
  }

  private async handleSendMany(input: Record<string, unknown>): Promise<unknown> {
    const walletId = input.walletId as string;
    const coin = input.coin as string;
    const passphrase = this.vault.retrieve(walletId);
    if (!passphrase) {
      throw new Error(`No passphrase found in vault for wallet ${walletId}.`);
    }

    const result = await this.express.sendMany(coin, walletId, {
      recipients: input.recipients as Array<{ address: string; amount: string }>,
      walletPassphrase: passphrase,
    });

    // Track transfer for on-chain confirmation
    const transferId = result.transfer?.id || result.transferId;
    const txid = result.transfer?.txid || result.txid;
    if (transferId || txid) {
      this.webhookManager?.trackTransfer(coin, walletId, transferId, txid).catch(() => {});
    }

    return result;
  }

  private async handleConsolidate(input: Record<string, unknown>): Promise<unknown> {
    const walletId = input.walletId as string;
    const passphrase = this.vault.retrieve(walletId);
    if (!passphrase) {
      throw new Error(`No passphrase found in vault for wallet ${walletId}.`);
    }

    return this.express.consolidateUnspents(input.coin as string, walletId, {
      walletPassphrase: passphrase,
    });
  }

  private async handleSweep(input: Record<string, unknown>): Promise<unknown> {
    const walletId = input.walletId as string;
    const passphrase = this.vault.retrieve(walletId);
    if (!passphrase) {
      throw new Error(`No passphrase found in vault for wallet ${walletId}.`);
    }

    return this.express.sweep(input.coin as string, walletId, {
      address: input.address as string,
      walletPassphrase: passphrase,
    });
  }

  private async handleUpdatePendingApproval(input: Record<string, unknown>): Promise<unknown> {
    const approvalId = input.approvalId as string;
    const state = input.state as string;
    const walletId = input.walletId as string | undefined;

    const params: Record<string, unknown> = { state };

    // If approving and we have a walletId, try to get passphrase for signing
    if (state === 'approved' && walletId) {
      const passphrase = this.vault.retrieve(walletId);
      if (passphrase) {
        params.walletPassphrase = passphrase;
      }
    }

    return this.express.updatePendingApproval(approvalId, params as any);
  }

  private async handleAccelerateTransaction(input: Record<string, unknown>): Promise<unknown> {
    const walletId = input.walletId as string;
    const passphrase = this.vault.retrieve(walletId);
    if (!passphrase) {
      throw new Error(`No passphrase found in vault for wallet ${walletId}.`);
    }

    return this.express.accelerateTransaction(input.coin as string, walletId, {
      txid: input.txid as string,
      walletPassphrase: passphrase,
      feeRate: input.feeRate as number | undefined,
    });
  }

  private async handleFanout(input: Record<string, unknown>): Promise<unknown> {
    const walletId = input.walletId as string;
    const passphrase = this.vault.retrieve(walletId);
    if (!passphrase) {
      throw new Error(`No passphrase found in vault for wallet ${walletId}.`);
    }

    return this.express.fanoutUnspents(input.coin as string, walletId, {
      walletPassphrase: passphrase,
      target: input.target as number | undefined,
    });
  }

  private async handleShareWallet(input: Record<string, unknown>): Promise<unknown> {
    const walletId = input.walletId as string;
    const passphrase = this.vault.retrieve(walletId);
    if (!passphrase) {
      throw new Error(`No passphrase found in vault for wallet ${walletId}.`);
    }

    return this.express.shareWallet(input.coin as string, walletId, {
      email: input.email as string,
      permissions: (input.permissions as string) || 'view',
      walletPassphrase: passphrase,
    });
  }

  private async handleChangeFee(input: Record<string, unknown>): Promise<unknown> {
    const walletId = input.walletId as string;
    const passphrase = this.vault.retrieve(walletId);
    if (!passphrase) {
      throw new Error(`No passphrase found in vault for wallet ${walletId}.`);
    }

    return this.express.changeFee(input.coin as string, walletId, {
      txid: input.txid as string,
      fee: input.fee as string | undefined,
      walletPassphrase: passphrase,
    });
  }

  private async handleRecoverToken(input: Record<string, unknown>): Promise<unknown> {
    const walletId = input.walletId as string;
    const passphrase = this.vault.retrieve(walletId);
    if (!passphrase) {
      throw new Error(`No passphrase found in vault for wallet ${walletId}.`);
    }

    return this.express.recoverToken(input.coin as string, walletId, {
      tokenContractAddress: input.tokenContractAddress as string,
      recipient: input.recipient as string,
      walletPassphrase: passphrase,
    });
  }

  private async handleConsolidateAccount(input: Record<string, unknown>): Promise<unknown> {
    const walletId = input.walletId as string;
    const passphrase = this.vault.retrieve(walletId);
    if (!passphrase) {
      throw new Error(`No passphrase found in vault for wallet ${walletId}.`);
    }

    return this.express.consolidateAccount(input.coin as string, walletId, {
      walletPassphrase: passphrase,
      consolidateAddresses: input.consolidateAddresses as string[] | undefined,
    });
  }

  private async handleEnableTokens(input: Record<string, unknown>): Promise<unknown> {
    const walletId = input.walletId as string;
    const passphrase = this.vault.retrieve(walletId);
    if (!passphrase) {
      throw new Error(`No passphrase found in vault for wallet ${walletId}.`);
    }

    return this.express.enableTokens(input.coin as string, walletId, {
      tokens: input.tokens as string[],
      walletPassphrase: passphrase,
    });
  }

  private async handlePrebuildAndSign(input: Record<string, unknown>): Promise<unknown> {
    const walletId = input.walletId as string;
    const passphrase = this.vault.retrieve(walletId);
    if (!passphrase) {
      throw new Error(`No passphrase found in vault for wallet ${walletId}.`);
    }

    return this.express.prebuildAndSignTransaction(input.coin as string, walletId, {
      recipients: input.recipients as Array<{ address: string; amount: string }>,
      walletPassphrase: passphrase,
    });
  }

  private async handlePayLightningInvoice(input: Record<string, unknown>): Promise<unknown> {
    const walletId = input.walletId as string;
    const passphrase = this.vault.retrieve(walletId);
    if (!passphrase) {
      throw new Error(`No passphrase found in vault for wallet ${walletId}.`);
    }

    return this.express.payLightningInvoice(input.coin as string, walletId, {
      invoice: input.invoice as string,
      walletPassphrase: passphrase,
    });
  }

  private async handleLightningWithdraw(input: Record<string, unknown>): Promise<unknown> {
    const walletId = input.walletId as string;
    const passphrase = this.vault.retrieve(walletId);
    if (!passphrase) {
      throw new Error(`No passphrase found in vault for wallet ${walletId}.`);
    }

    return this.express.lightningWithdraw(input.coin as string, walletId, {
      amount: input.amount as string,
      address: input.address as string,
      walletPassphrase: passphrase,
    });
  }

  private async handleSearchDocs(input: Record<string, unknown>): Promise<unknown> {
    const query = input.query as string;
    return this.fetchDocsPage(query);
  }

  private async fetchDocsPage(query: string): Promise<unknown> {
    // Map common error topics to relevant doc pages on developers.bitgo.com.
    // ORDER MATTERS: more-specific (multi-word) patterns must come before
    // less-specific single-word patterns to avoid early short-circuit on find().
    const lowerQuery = query.toLowerCase();
    const docPages: Array<{ patterns: string[]; url: string; topic: string }> = [
      { patterns: ['create address', 'pricing plan'], url: 'https://developers.bitgo.com/docs/wallets-create-addresses', topic: 'Creating addresses' },
      { patterns: ['wallet type', 'wallet overview'], url: 'https://developers.bitgo.com/docs/wallets-overview', topic: 'Wallet overview' },
      { patterns: ['create wallet', 'generate wallet'], url: 'https://developers.bitgo.com/docs/wallets-create-wallets', topic: 'Creating wallets' },
      { patterns: ['sendcoins', 'send transaction', 'send many', 'withdraw'], url: 'https://developers.bitgo.com/docs/withdraw-wallet-type-self-custody-mpc-hot-simple', topic: 'Sending transactions' },
      { patterns: ['whitelist', 'blacklist', 'address policy'], url: 'https://developers.bitgo.com/docs/wallets-whitelists-blacklists', topic: 'Wallet policies and whitelists' },
      { patterns: ['consolidat'], url: 'https://developers.bitgo.com/docs/wallets-unspents-consolidate', topic: 'UTXO consolidation' },
      { patterns: ['token enablement', 'erc20', 'enable token'], url: 'https://developers.bitgo.com/docs/wallets-token-enablement', topic: 'Token enablement' },
      { patterns: ['mpc key', 'tss key', 'create key'], url: 'https://developers.bitgo.com/docs/wallets-create-mpc-keys', topic: 'MPC key creation' },
      { patterns: ['fee estimate', 'estimate fee'], url: 'https://developers.bitgo.com/docs/withdraw-estimate-fees', topic: 'Fee estimation' },
      { patterns: ['webhook'], url: 'https://developers.bitgo.com/docs/webhooks-overview', topic: 'Webhooks' },
      { patterns: ['balance'], url: 'https://developers.bitgo.com/docs/wallets-view-balances', topic: 'Viewing balances' },
      { patterns: ['transfer', 'transaction'], url: 'https://developers.bitgo.com/docs/wallets-view-transactions', topic: 'Viewing transactions' },
      { patterns: ['freeze'], url: 'https://developers.bitgo.com/docs/wallets-manage-freeze', topic: 'Freezing wallets' },
      { patterns: ['recover'], url: 'https://developers.bitgo.com/docs/wallets-recover', topic: 'Wallet recovery' },
      { patterns: ['lightning'], url: 'https://developers.bitgo.com/docs/lightning-set-up-wallets', topic: 'Lightning wallets' },
      { patterns: ['utxo', 'unspent'], url: 'https://developers.bitgo.com/docs/wallets-view-utxo', topic: 'UTXOs' },
      // Generic single-word fallbacks — kept last to avoid overshadowing specific patterns above
      { patterns: ['address'], url: 'https://developers.bitgo.com/docs/wallets-create-addresses', topic: 'Creating addresses' },
      { patterns: ['wallet'], url: 'https://developers.bitgo.com/docs/wallets-create-wallets', topic: 'Creating wallets' },
      { patterns: ['send', 'policy', 'fee', 'key', 'token', 'mpc', 'tss'], url: 'https://developers.bitgo.com/docs/wallets-overview', topic: 'Wallet overview' },
    ];

    // Use word-boundary matching so 'address' doesn't match inside 'INVALID_ADDRESS'
    const matchedPage = docPages.find((p) =>
      p.patterns.some((pat) => new RegExp(`\\b${pat.replace(/[-]/g, '\\-')}\\b`, 'i').test(lowerQuery))
    );
    const url = matchedPage?.url || 'https://developers.bitgo.com/docs/wallets-overview';

    try {
      const res = await fetch(url, {
        signal: AbortSignal.timeout(10000),
      });
      const html = await res.text();

      // Extract body content from Readme.io embedded JSON (SPA renders client-side)
      let textContent = '';
      const bodyMatch = html.match(/"body":"((?:[^"\\]|\\.)*)"/);
      if (bodyMatch) {
        try {
          const bodyHtml = JSON.parse('"' + bodyMatch[1] + '"');
          textContent = bodyHtml
            .replace(/<script[^>]*>[\s\S]*?<\/script>/gi, '')
            .replace(/<style[^>]*>[\s\S]*?<\/style>/gi, '')
            .replace(/<[^>]+>/g, ' ')
            .replace(/\s+/g, ' ')
            .trim();
        } catch {
          // Fallback: strip HTML from full page
          textContent = html
            .replace(/<script[^>]*>[\s\S]*?<\/script>/gi, '')
            .replace(/<style[^>]*>[\s\S]*?<\/style>/gi, '')
            .replace(/<[^>]+>/g, ' ')
            .replace(/\s+/g, ' ')
            .trim();
        }
      }

      return {
        source: 'BitGo Developer Documentation',
        topic: matchedPage?.topic || query,
        url,
        content: textContent.slice(0, 5000) || 'Could not extract content from documentation page.',
      };
    } catch (err: any) {
      return {
        source: 'BitGo Developer Documentation',
        error: `Could not fetch docs: ${err.message}`,
        suggestion: `Visit https://developers.bitgo.com and search for: ${query}`,
      };
    }
  }

  // ── Web Search (DuckDuckGo HTML) ──

  private async handleWebSearch(input: Record<string, unknown>): Promise<unknown> {
    const query = input.query as string;
    try {
      // Use DuckDuckGo HTML search (no API key needed)
      const searchUrl = `https://html.duckduckgo.com/html/?q=${encodeURIComponent(query)}`;
      const res = await fetch(searchUrl, {
        headers: {
          'User-Agent': 'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36',
          'Accept': 'text/html',
        },
        signal: AbortSignal.timeout(10000),
      });
      const html = await res.text();

      // Extract search results from DuckDuckGo HTML
      const results: Array<{ title: string; url: string; snippet: string }> = [];
      const resultBlocks = html.split('web-result');

      for (let i = 1; i < Math.min(resultBlocks.length, 8); i++) {
        const block = resultBlocks[i];

        // Extract title from result__a link
        const titleMatch = block.match(/class="result__a"[^>]*>([\s\S]*?)<\/a>/);
        const title = titleMatch
          ? titleMatch[1].replace(/<[^>]+>/g, '').replace(/\s+/g, ' ').trim()
          : '';

        // Extract URL from result__url
        const urlMatch = block.match(/class="result__url"[^>]*href="([^"]*)"/);
        let url = '';
        if (urlMatch) {
          url = urlMatch[1].trim();
          if (url.includes('uddg=')) {
            const decoded = decodeURIComponent(url.split('uddg=')[1]?.split('&')[0] || '');
            url = decoded || url;
          }
          if (url.startsWith('//')) url = 'https:' + url;
          if (!url.startsWith('http')) url = 'https://' + url;
        }

        // Extract snippet from result__snippet
        const snippetMatch = block.match(/class="result__snippet"[^>]*>([\s\S]*?)<\/(?:a|span)>/);
        const snippet = snippetMatch
          ? snippetMatch[1].replace(/<[^>]+>/g, '').replace(/\s+/g, ' ').trim()
          : '';

        if (title && url) {
          results.push({ title, url, snippet });
        }
      }

      return {
        query,
        resultCount: results.length,
        results: results.slice(0, 6),
      };
    } catch (err: any) {
      return {
        query,
        error: `Search failed: ${err.message}`,
        suggestion: 'Try a different search query or use search_bitgo_docs for BitGo-specific questions.',
      };
    }
  }

  // ── Web Fetch (extract text from any URL) ──

  private async handleWebFetch(input: Record<string, unknown>): Promise<unknown> {
    const url = input.url as string;
    const maxLength = Math.min((input.maxLength as number) || 5000, 10000);

    // Basic URL validation
    if (!url.startsWith('http://') && !url.startsWith('https://')) {
      return { error: 'URL must start with http:// or https://' };
    }

    try {
      const res = await fetch(url, {
        headers: {
          'User-Agent': 'Mozilla/5.0 (compatible; BitGoAgent/1.0)',
          'Accept': 'text/html,application/json,text/plain',
        },
        signal: AbortSignal.timeout(15000),
        redirect: 'follow',
      });

      const contentType = res.headers.get('content-type') || '';

      if (contentType.includes('application/json')) {
        const json = await res.json();
        const text = JSON.stringify(json, null, 2);
        return {
          url,
          contentType: 'json',
          content: text.slice(0, maxLength),
          truncated: text.length > maxLength,
        };
      }

      const html = await res.text();

      // Try to extract body from Readme.io-style SPA pages
      let textContent = '';
      const bodyMatch = html.match(/"body":"((?:[^"\\]|\\.)*)"/);
      if (bodyMatch) {
        try {
          const bodyHtml = JSON.parse('"' + bodyMatch[1] + '"');
          textContent = bodyHtml
            .replace(/<script[^>]*>[\s\S]*?<\/script>/gi, '')
            .replace(/<style[^>]*>[\s\S]*?<\/style>/gi, '')
            .replace(/<[^>]+>/g, ' ')
            .replace(/\s+/g, ' ')
            .trim();
        } catch {
          // Fall through to standard HTML extraction
        }
      }

      if (!textContent) {
        // Extract title
        const titleMatch = html.match(/<title[^>]*>([\s\S]*?)<\/title>/i);
        const title = titleMatch ? titleMatch[1].replace(/<[^>]+>/g, '').trim() : '';

        // Extract main content — try article/main tags first, then body
        let contentHtml = html;
        const mainMatch = html.match(/<(?:article|main)[^>]*>([\s\S]*?)<\/(?:article|main)>/i);
        if (mainMatch) {
          contentHtml = mainMatch[1];
        }

        textContent = contentHtml
          .replace(/<script[^>]*>[\s\S]*?<\/script>/gi, '')
          .replace(/<style[^>]*>[\s\S]*?<\/style>/gi, '')
          .replace(/<nav[^>]*>[\s\S]*?<\/nav>/gi, '')
          .replace(/<header[^>]*>[\s\S]*?<\/header>/gi, '')
          .replace(/<footer[^>]*>[\s\S]*?<\/footer>/gi, '')
          .replace(/<[^>]+>/g, ' ')
          .replace(/\s+/g, ' ')
          .trim();

        if (title) textContent = `Title: ${title}\n\n${textContent}`;
      }

      return {
        url,
        contentType: 'html',
        content: textContent.slice(0, maxLength),
        truncated: textContent.length > maxLength,
      };
    } catch (err: any) {
      return {
        url,
        error: `Failed to fetch: ${err.message}`,
      };
    }
  }

  // ── Calculator ──

  private handleCalculate(input: Record<string, unknown>): unknown {
    const expression = input.expression as string;

    // Sanitize: only allow safe math characters
    const sanitized = expression.replace(/\s/g, '');
    if (!/^[0-9+\-*/().eE,_]+$/.test(sanitized)) {
      return { error: 'Invalid expression. Only numbers and basic operators (+, -, *, /, **, ()) are allowed.' };
    }

    try {
      // Use Function constructor for safe math evaluation (no access to globals)
      const result = new Function(`"use strict"; return (${expression})`)();

      // Handle common crypto unit conversions in the response
      return {
        expression,
        result: typeof result === 'number' ? result : String(result),
        formatted: typeof result === 'number'
          ? result.toLocaleString('en-US', { maximumFractionDigits: 18 })
          : String(result),
      };
    } catch (err: any) {
      return { expression, error: `Calculation error: ${err.message}` };
    }
  }

  // ── Crypto Price (CoinGecko free API) ──

  private async handleGetCryptoPrice(input: Record<string, unknown>): Promise<unknown> {
    const coin = (input.coin as string).toLowerCase();

    // Map common names/tickers to CoinGecko IDs
    const coinMap: Record<string, string> = {
      btc: 'bitcoin', bitcoin: 'bitcoin', tbtc: 'bitcoin',
      eth: 'ethereum', ethereum: 'ethereum', teth: 'ethereum', hteth: 'ethereum',
      sol: 'solana', solana: 'solana', tsol: 'solana',
      ltc: 'litecoin', litecoin: 'litecoin', tltc: 'litecoin',
      xrp: 'ripple', ripple: 'ripple', txrp: 'ripple',
      avax: 'avalanche-2', avalanche: 'avalanche-2',
      matic: 'matic-network', polygon: 'matic-network',
      doge: 'dogecoin', dogecoin: 'dogecoin',
      ada: 'cardano', cardano: 'cardano',
      dot: 'polkadot', polkadot: 'polkadot',
      atom: 'cosmos', cosmos: 'cosmos',
      algo: 'algorand', algorand: 'algorand',
      xlm: 'stellar', stellar: 'stellar',
      eos: 'eos', near: 'near', sui: 'sui',
    };

    const geckoId = coinMap[coin] || coin;

    try {
      const res = await fetch(
        `https://api.coingecko.com/api/v3/simple/price?ids=${geckoId}&vs_currencies=usd&include_24hr_change=true&include_market_cap=true`,
        { signal: AbortSignal.timeout(10000) }
      );
      const data = await res.json() as Record<string, any>;

      if (data[geckoId]) {
        const price = data[geckoId];
        return {
          coin: geckoId,
          usd: price.usd,
          usd_24h_change: price.usd_24h_change
            ? `${price.usd_24h_change > 0 ? '+' : ''}${price.usd_24h_change.toFixed(2)}%`
            : null,
          market_cap_usd: price.usd_market_cap || null,
          note: coin.startsWith('t') ? 'Price shown is for mainnet coin. Testnet coins have no real value.' : undefined,
        };
      }

      return { coin, error: `Could not find price for "${coin}". Try the full name (e.g., "bitcoin", "ethereum").` };
    } catch (err: any) {
      return { coin, error: `Price lookup failed: ${err.message}` };
    }
  }

  // ── Current Time ──

  private handleGetCurrentTime(): unknown {
    const now = new Date();
    return {
      utc: now.toISOString(),
      unix: now.getTime(),
      human: now.toLocaleString('en-US', {
        weekday: 'long',
        year: 'numeric',
        month: 'long',
        day: 'numeric',
        hour: '2-digit',
        minute: '2-digit',
        second: '2-digit',
        timeZoneName: 'short',
      }),
    };
  }
}
