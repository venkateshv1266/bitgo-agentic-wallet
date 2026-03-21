/**
 * Tool definitions for the BitGo wallet agent.
 * These are used to define the tools available in the MCP server / Claude tool_use.
 */

export interface ToolDefinition {
  name: string;
  description: string;
  inputSchema: {
    type: 'object';
    properties: Record<string, any>;
    required: string[];
  };
}

export const TOOL_DEFINITIONS: ToolDefinition[] = [
  {
    name: 'list_wallets',
    description:
      'List wallets. If no coin is specified, lists ALL wallets across all chains. If coin is specified, lists wallets for that coin only. Returns wallet IDs, labels, coins, balances, and receive addresses.',
    inputSchema: {
      type: 'object',
      properties: {
        coin: { type: 'string', description: 'Optional coin ticker to filter by (e.g., tbtc, teth). Omit to list all wallets across all chains.' },
        limit: { type: 'number', description: 'Max wallets to return (default 25)' },
      },
      required: [],
    },
  },
  {
    name: 'get_wallet',
    description:
      'Get detailed information about a specific wallet by its ID. Returns balance, coin, label, type, and receive address. Use this instead of list_wallets when asking about a specific wallet.',
    inputSchema: {
      type: 'object',
      properties: {
        walletId: { type: 'string', description: 'Wallet ID' },
      },
      required: ['walletId'],
    },
  },
  {
    name: 'get_max_spendable',
    description:
      'Calculate the maximum amount that can be spent from a wallet, accounting for fees.',
    inputSchema: {
      type: 'object',
      properties: {
        coin: { type: 'string', description: 'Coin ticker' },
        walletId: { type: 'string', description: 'Wallet ID' },
      },
      required: ['coin', 'walletId'],
    },
  },
  {
    name: 'list_transfers',
    description: 'List recent transfers (incoming and outgoing) for a wallet.',
    inputSchema: {
      type: 'object',
      properties: {
        coin: { type: 'string', description: 'Coin ticker' },
        walletId: { type: 'string', description: 'Wallet ID' },
        limit: { type: 'number', description: 'Max transfers to return (default 10)' },
      },
      required: ['coin', 'walletId'],
    },
  },
  {
    name: 'generate_wallet',
    description:
      'Create a new hot (self-custodial) wallet. The passphrase is auto-generated and stored securely in the vault.',
    inputSchema: {
      type: 'object',
      properties: {
        coin: { type: 'string', description: 'Coin ticker (e.g., tbtc)' },
        label: { type: 'string', description: 'Human-readable wallet label' },
        walletVersion: {
          type: 'number',
          description: 'Wallet version to use when creating the wallet (default: 5)',
        },
      },
      required: ['coin', 'label'],
    },
  },
  {
    name: 'create_address',
    description: 'Generate a new receive address for a wallet.',
    inputSchema: {
      type: 'object',
      properties: {
        coin: { type: 'string', description: 'Coin ticker' },
        walletId: { type: 'string', description: 'Wallet ID' },
        label: { type: 'string', description: 'Optional label for the address' },
      },
      required: ['coin', 'walletId'],
    },
  },
  {
    name: 'send_transaction',
    description:
      'Send cryptocurrency to a single address. The passphrase is auto-retrieved from the vault for signing.',
    inputSchema: {
      type: 'object',
      properties: {
        coin: { type: 'string', description: 'Coin ticker' },
        walletId: { type: 'string', description: 'Source wallet ID' },
        address: { type: 'string', description: 'Destination address' },
        amount: {
          type: 'string',
          description: 'Amount in base units (e.g., satoshis for BTC, wei for ETH)',
        },
      },
      required: ['coin', 'walletId', 'address', 'amount'],
    },
  },
  {
    name: 'send_many',
    description:
      'Send cryptocurrency to multiple recipients in a single transaction. Passphrase auto-retrieved from vault.',
    inputSchema: {
      type: 'object',
      properties: {
        coin: { type: 'string', description: 'Coin ticker' },
        walletId: { type: 'string', description: 'Source wallet ID' },
        recipients: {
          type: 'array',
          items: {
            type: 'object',
            properties: {
              address: { type: 'string' },
              amount: { type: 'string' },
            },
            required: ['address', 'amount'],
          },
          description: 'Array of {address, amount} recipients',
        },
      },
      required: ['coin', 'walletId', 'recipients'],
    },
  },
  {
    name: 'list_policy_rules',
    description:
      'List all policy rules on a BitGo wallet. ' +
      'Call this before delete_policy_rule to discover rule IDs, types, and actions. ' +
      'Also call this when the user asks to see, list, or check policies on a wallet.',
    inputSchema: {
      type: 'object',
      properties: {
        walletId: { type: 'string', description: 'Wallet ID' },
      },
      required: ['walletId'],
    },
  },
  {
    name: 'add_policy_rule',
    description:
      'Add a policy rule to a BitGo wallet via BitGo Express. ' +
      'For address whitelisting: type="advancedWhitelist", provide addresses=[...] array, action={type:"deny"}. ' +
      'For other types (velocityLimit, coinAddressBlacklist, allTx): provide condition object and action. ' +
      'advancedWhitelist is a two-step operation (create + add addresses) handled automatically.',
    inputSchema: {
      type: 'object',
      properties: {
        coin: { type: 'string', description: 'Coin ticker (e.g. hteth, tbtc)' },
        walletId: { type: 'string', description: 'Wallet ID' },
        ruleId: { type: 'string', description: 'Unique rule identifier' },
        type: {
          type: 'string',
          description: 'Rule type: advancedWhitelist | coinAddressBlacklist | velocityLimit | allTx',
        },
        addresses: {
          type: 'array',
          description: 'For advancedWhitelist: list of addresses to whitelist',
          items: { type: 'string' },
        },
        condition: {
          type: 'object',
          description: 'For non-advancedWhitelist types: rule condition object',
        },
        action: {
          type: 'object',
          description: 'Action when triggered. Default: {type: "deny"}',
        },
      },
      required: ['coin', 'walletId', 'ruleId', 'type'],
    },
  },
  {
    name: 'manage_webhook',
    description: 'Add a webhook to receive notifications for wallet events.',
    inputSchema: {
      type: 'object',
      properties: {
        coin: { type: 'string', description: 'Coin ticker' },
        walletId: { type: 'string', description: 'Wallet ID' },
        type: {
          type: 'string',
          description: 'Event type (e.g., transfer, transaction, pendingapproval)',
        },
        url: { type: 'string', description: 'Webhook URL to receive events' },
      },
      required: ['coin', 'walletId', 'type', 'url'],
    },
  },
  {
    name: 'consolidate_utxos',
    description: 'Consolidate unspent transaction outputs (UTXOs) for a UTXO-based wallet.',
    inputSchema: {
      type: 'object',
      properties: {
        coin: { type: 'string', description: 'Coin ticker (UTXO coin only, e.g., tbtc)' },
        walletId: { type: 'string', description: 'Wallet ID' },
      },
      required: ['coin', 'walletId'],
    },
  },
  {
    name: 'update_wallet',
    description:
      'Update properties of an existing wallet, such as its label (name). Use this to rename a wallet.',
    inputSchema: {
      type: 'object',
      properties: {
        coin: { type: 'string', description: 'Coin ticker (e.g., tbtc, hteth, tsol)' },
        walletId: { type: 'string', description: 'Wallet ID to update' },
        label: { type: 'string', description: 'New label/name for the wallet' },
      },
      required: ['coin', 'walletId', 'label'],
    },
  },
  {
    name: 'sweep_wallet',
    description: 'Sweep all funds from a wallet to a destination address.',
    inputSchema: {
      type: 'object',
      properties: {
        coin: { type: 'string', description: 'Coin ticker' },
        walletId: { type: 'string', description: 'Source wallet ID' },
        address: { type: 'string', description: 'Destination address to sweep to' },
      },
      required: ['coin', 'walletId', 'address'],
    },
  },

  // ── New tools ──────────────────────────────────────────────────────

  {
    name: 'get_transfer',
    description:
      'Get details of a specific transfer by its transfer ID or transaction hash. Use to check status, confirmations, and details of a particular transaction.',
    inputSchema: {
      type: 'object',
      properties: {
        coin: { type: 'string', description: 'Coin ticker' },
        walletId: { type: 'string', description: 'Wallet ID' },
        transferId: { type: 'string', description: 'Transfer ID or txid to look up' },
      },
      required: ['coin', 'walletId', 'transferId'],
    },
  },
  {
    name: 'list_addresses',
    description:
      'List all addresses for a wallet. Useful for seeing receive addresses, labels, and balances per address.',
    inputSchema: {
      type: 'object',
      properties: {
        coin: { type: 'string', description: 'Coin ticker' },
        walletId: { type: 'string', description: 'Wallet ID' },
        limit: { type: 'number', description: 'Max addresses to return (default 25)' },
      },
      required: ['coin', 'walletId'],
    },
  },
  {
    name: 'freeze_wallet',
    description:
      'Freeze a wallet to prevent any outgoing transactions. Use this as an emergency security measure if a wallet may be compromised. Freeze lasts for a specified duration.',
    inputSchema: {
      type: 'object',
      properties: {
        coin: { type: 'string', description: 'Coin ticker' },
        walletId: { type: 'string', description: 'Wallet ID to freeze' },
        duration: { type: 'number', description: 'Freeze duration in seconds (default 86400 = 24 hours)' },
      },
      required: ['coin', 'walletId'],
    },
  },
  {
    name: 'get_fee_estimate',
    description:
      'Get the current fee estimate for a coin. Returns recommended fee rates for transactions. Useful for planning sends and estimating costs.',
    inputSchema: {
      type: 'object',
      properties: {
        coin: { type: 'string', description: 'Coin ticker' },
        numBlocks: { type: 'number', description: 'Target confirmation blocks (default 2). Lower = higher fee.' },
      },
      required: ['coin'],
    },
  },
  {
    name: 'list_pending_approvals',
    description:
      'List pending approvals for the enterprise or a specific wallet. These are transactions or operations awaiting human approval due to policy rules.',
    inputSchema: {
      type: 'object',
      properties: {
        walletId: { type: 'string', description: 'Optional wallet ID to filter approvals' },
      },
      required: [],
    },
  },
  {
    name: 'update_pending_approval',
    description:
      'Approve or reject a pending approval. Requires the approval ID and a state of "approved" or "rejected". For approvals requiring signing (e.g., transactions), the passphrase is auto-retrieved from the vault.',
    inputSchema: {
      type: 'object',
      properties: {
        approvalId: { type: 'string', description: 'Pending approval ID' },
        state: {
          type: 'string',
          enum: ['approved', 'rejected'],
          description: 'Decision: "approved" or "rejected"',
        },
        coin: { type: 'string', description: 'Coin ticker (needed for signing approved transactions)' },
        walletId: { type: 'string', description: 'Wallet ID (needed for vault passphrase lookup)' },
      },
      required: ['approvalId', 'state'],
    },
  },
  {
    name: 'accelerate_transaction',
    description:
      'Accelerate a stuck/unconfirmed transaction using Child-Pays-For-Parent (CPFP). Only works for UTXO-based coins (BTC, LTC, etc.).',
    inputSchema: {
      type: 'object',
      properties: {
        coin: { type: 'string', description: 'Coin ticker (UTXO coin only)' },
        walletId: { type: 'string', description: 'Wallet ID' },
        txid: { type: 'string', description: 'Transaction ID of the stuck transaction to accelerate' },
        feeRate: { type: 'number', description: 'Optional fee rate in satoshis/byte for the CPFP transaction' },
      },
      required: ['coin', 'walletId', 'txid'],
    },
  },
  {
    name: 'fanout_utxos',
    description:
      'Fan out (split) UTXOs into many smaller outputs. Useful for preparing a wallet for many parallel sends. Only works for UTXO-based coins.',
    inputSchema: {
      type: 'object',
      properties: {
        coin: { type: 'string', description: 'Coin ticker (UTXO coin only, e.g., tbtc)' },
        walletId: { type: 'string', description: 'Wallet ID' },
        target: { type: 'number', description: 'Target number of unspents to fan out to (default 200)' },
      },
      required: ['coin', 'walletId'],
    },
  },
  {
    name: 'list_webhooks',
    description: 'List all webhooks registered for a wallet.',
    inputSchema: {
      type: 'object',
      properties: {
        coin: { type: 'string', description: 'Coin ticker' },
        walletId: { type: 'string', description: 'Wallet ID' },
      },
      required: ['coin', 'walletId'],
    },
  },
  {
    name: 'remove_webhook',
    description: 'Remove a webhook from a wallet.',
    inputSchema: {
      type: 'object',
      properties: {
        coin: { type: 'string', description: 'Coin ticker' },
        walletId: { type: 'string', description: 'Wallet ID' },
        type: { type: 'string', description: 'Webhook event type (e.g., transfer, transaction, pendingapproval)' },
        url: { type: 'string', description: 'Webhook URL to remove' },
      },
      required: ['coin', 'walletId', 'type', 'url'],
    },
  },
  {
    name: 'update_policy_rule',
    description:
      'Update an existing BitGo wallet policy rule. ' +
      'ALWAYS call list_policy_rules first to get the rule id, type, and action — never guess them. ' +
      'If the user did not specify which rule to update, call list_policy_rules and ask them to confirm. ' +
      'For advancedWhitelist: use addAddresses to add new addresses, removeAddresses to remove existing ones. ' +
      'For other types: provide condition and/or action to replace.',
    inputSchema: {
      type: 'object',
      properties: {
        coin: { type: 'string', description: 'Coin ticker (e.g. hteth, tbtc)' },
        walletId: { type: 'string', description: 'Wallet ID' },
        ruleId: { type: 'string', description: 'Rule ID from list_policy_rules' },
        type: { type: 'string', description: 'Rule type from list_policy_rules (e.g. advancedWhitelist)' },
        action: { type: 'object', description: 'Rule action from list_policy_rules (e.g. {type:"deny"})' },
        addAddresses: {
          type: 'array',
          items: { type: 'string' },
          description: 'advancedWhitelist only: addresses to add to the whitelist',
        },
        removeAddresses: {
          type: 'array',
          items: { type: 'string' },
          description: 'advancedWhitelist only: addresses to remove from the whitelist',
        },
        condition: {
          type: 'object',
          description: 'For non-advancedWhitelist types: new condition object',
        },
      },
      required: ['coin', 'walletId', 'ruleId', 'type'],
    },
  },
  {
    name: 'delete_policy_rule',
    description:
      'Remove a policy rule from a BitGo wallet. ' +
      'ALWAYS call list_policy_rules first to get the rule id, type, and action — never guess them. ' +
      'If the user did not specify which rule to delete, call list_policy_rules and ask them to confirm.',
    inputSchema: {
      type: 'object',
      properties: {
        coin: { type: 'string', description: 'Coin ticker (e.g. hteth, tbtc)' },
        walletId: { type: 'string', description: 'Wallet ID' },
        ruleId: { type: 'string', description: 'Policy rule ID to remove' },
        type: { type: 'string', description: 'Rule type (e.g. advancedWhitelist, velocityLimit)' },
        action: { type: 'object', description: 'Rule action — must match the existing rule. Default: {type:"deny"}' },
      },
      required: ['coin', 'walletId', 'ruleId', 'type'],
    },
  },
  {
    name: 'verify_address',
    description:
      'Verify if an address is valid for a given coin. Use this to validate addresses before sending transactions.',
    inputSchema: {
      type: 'object',
      properties: {
        coin: { type: 'string', description: 'Coin ticker' },
        address: { type: 'string', description: 'Address to verify' },
      },
      required: ['coin', 'address'],
    },
  },
  {
    name: 'list_unspents',
    description:
      'List unspent transaction outputs (UTXOs) for a UTXO-based wallet. Shows available inputs for transactions.',
    inputSchema: {
      type: 'object',
      properties: {
        coin: { type: 'string', description: 'Coin ticker (UTXO coin only)' },
        walletId: { type: 'string', description: 'Wallet ID' },
        limit: { type: 'number', description: 'Max unspents to return (default 25)' },
      },
      required: ['coin', 'walletId'],
    },
  },
  {
    name: 'share_wallet',
    description:
      'Share a wallet with another user by their email address. Grants them access to the wallet with a specified permission level.',
    inputSchema: {
      type: 'object',
      properties: {
        coin: { type: 'string', description: 'Coin ticker' },
        walletId: { type: 'string', description: 'Wallet ID to share' },
        email: { type: 'string', description: 'Email of the user to share with' },
        permissions: {
          type: 'string',
          description: 'Permission level: "view", "spend", or "admin" (default "view")',
        },
      },
      required: ['coin', 'walletId', 'email'],
    },
  },
  {
    name: 'build_transaction',
    description:
      'Build a transaction without sending it. Returns the unsigned transaction, fee estimate, and details. Useful for previewing a transaction before committing.',
    inputSchema: {
      type: 'object',
      properties: {
        coin: { type: 'string', description: 'Coin ticker' },
        walletId: { type: 'string', description: 'Source wallet ID' },
        recipients: {
          type: 'array',
          items: {
            type: 'object',
            properties: {
              address: { type: 'string' },
              amount: { type: 'string' },
            },
            required: ['address', 'amount'],
          },
          description: 'Array of {address, amount} recipients',
        },
      },
      required: ['coin', 'walletId', 'recipients'],
    },
  },
  {
    name: 'change_fee',
    description:
      'Change the fee on an unconfirmed transaction (Replace-By-Fee / RBF). Only works for UTXO-based coins that support RBF.',
    inputSchema: {
      type: 'object',
      properties: {
        coin: { type: 'string', description: 'Coin ticker (UTXO coin only)' },
        walletId: { type: 'string', description: 'Wallet ID' },
        txid: { type: 'string', description: 'Transaction ID to bump the fee on' },
        fee: { type: 'string', description: 'New fee amount in base units (satoshis)' },
      },
      required: ['coin', 'walletId', 'txid'],
    },
  },
  {
    name: 'recover_token',
    description:
      'Recover an ERC20/token that was sent to the wrong address within a wallet. Only works for account-based coins (ETH, etc.) that support token recovery.',
    inputSchema: {
      type: 'object',
      properties: {
        coin: { type: 'string', description: 'Coin ticker (e.g., hteth, teth)' },
        walletId: { type: 'string', description: 'Wallet ID' },
        tokenContractAddress: {
          type: 'string',
          description: 'Contract address of the token to recover',
        },
        recipient: { type: 'string', description: 'Address to send recovered tokens to' },
      },
      required: ['coin', 'walletId', 'tokenContractAddress', 'recipient'],
    },
  },
  {
    name: 'consolidate_account',
    description:
      'Consolidate account-based coin balances (ETH, SOL, XRP, etc.) from receive addresses back to the base address. This is the account-based equivalent of consolidate_utxos.',
    inputSchema: {
      type: 'object',
      properties: {
        coin: { type: 'string', description: 'Coin ticker (account-based coin, e.g., hteth, tsol)' },
        walletId: { type: 'string', description: 'Wallet ID' },
        consolidateAddresses: {
          type: 'array',
          items: { type: 'string' },
          description: 'Optional specific addresses to consolidate from. If omitted, consolidates all.',
        },
      },
      required: ['coin', 'walletId'],
    },
  },
  {
    name: 'enable_tokens',
    description:
      'Enable token support on a wallet. Required before the wallet can receive or send specific tokens (e.g., ERC20 tokens on ETH wallets).',
    inputSchema: {
      type: 'object',
      properties: {
        coin: { type: 'string', description: 'Coin ticker (e.g., hteth)' },
        walletId: { type: 'string', description: 'Wallet ID' },
        tokens: {
          type: 'array',
          items: { type: 'string' },
          description: 'Array of token names to enable (e.g., ["hteth:usdc", "hteth:dai"])',
        },
      },
      required: ['coin', 'walletId', 'tokens'],
    },
  },
  {
    name: 'is_wallet_address',
    description:
      'Check if a given address belongs to a specific wallet. Useful for verifying receive addresses before sharing them.',
    inputSchema: {
      type: 'object',
      properties: {
        coin: { type: 'string', description: 'Coin ticker' },
        walletId: { type: 'string', description: 'Wallet ID' },
        address: { type: 'string', description: 'Address to check' },
      },
      required: ['coin', 'walletId', 'address'],
    },
  },
  {
    name: 'get_canonical_address',
    description:
      'Get the canonical (standard/checksum) format of an address for a given coin. Useful for normalizing addresses.',
    inputSchema: {
      type: 'object',
      properties: {
        coin: { type: 'string', description: 'Coin ticker' },
        address: { type: 'string', description: 'Address to canonicalize' },
      },
      required: ['coin', 'address'],
    },
  },
  {
    name: 'prebuild_and_sign_transaction',
    description:
      'Prebuild, sign, and prepare a transaction in one step. Returns a signed transaction ready for submission. Useful when you want a signed transaction without broadcasting it.',
    inputSchema: {
      type: 'object',
      properties: {
        coin: { type: 'string', description: 'Coin ticker' },
        walletId: { type: 'string', description: 'Source wallet ID' },
        recipients: {
          type: 'array',
          items: {
            type: 'object',
            properties: {
              address: { type: 'string' },
              amount: { type: 'string' },
            },
            required: ['address', 'amount'],
          },
          description: 'Array of {address, amount} recipients',
        },
      },
      required: ['coin', 'walletId', 'recipients'],
    },
  },
  {
    name: 'accept_wallet_share',
    description:
      'Accept a wallet share that was sent to you. Requires the share ID from the wallet share invitation.',
    inputSchema: {
      type: 'object',
      properties: {
        coin: { type: 'string', description: 'Coin ticker' },
        shareId: { type: 'string', description: 'Wallet share ID to accept' },
        userPassword: { type: 'string', description: 'Your BitGo password to decrypt the shared key' },
      },
      required: ['coin', 'shareId'],
    },
  },
  {
    name: 'pay_lightning_invoice',
    description:
      'Pay a Lightning Network invoice from a Lightning-enabled wallet. Only works with Lightning coins (lnbtc, tlnbtc).',
    inputSchema: {
      type: 'object',
      properties: {
        coin: { type: 'string', description: 'Lightning coin ticker (e.g., tlnbtc)' },
        walletId: { type: 'string', description: 'Lightning wallet ID' },
        invoice: { type: 'string', description: 'Lightning invoice (BOLT11 payment request) to pay' },
      },
      required: ['coin', 'walletId', 'invoice'],
    },
  },
  {
    name: 'lightning_withdraw',
    description:
      'Withdraw funds from a Lightning wallet to an on-chain Bitcoin address. Moves funds from Lightning channel back to base layer.',
    inputSchema: {
      type: 'object',
      properties: {
        coin: { type: 'string', description: 'Lightning coin ticker (e.g., tlnbtc)' },
        walletId: { type: 'string', description: 'Lightning wallet ID' },
        amount: { type: 'string', description: 'Amount in satoshis to withdraw' },
        address: { type: 'string', description: 'On-chain Bitcoin address to withdraw to' },
      },
      required: ['coin', 'walletId', 'amount', 'address'],
    },
  },
  // ── Research & Utility Tools ──
  {
    name: 'search_bitgo_docs',
    description:
      'Search BitGo developer documentation to find information about API errors, features, pricing plans, supported coins, and how-to guides. Use this when you encounter an error from a BitGo API call and need to explain it to the user, or when the user asks about BitGo concepts.',
    inputSchema: {
      type: 'object',
      properties: {
        query: {
          type: 'string',
          description: 'Search query (e.g., "create address pricing plan", "insufficient funds error", "EVM wallet address generation")',
        },
      },
      required: ['query'],
    },
  },
  {
    name: 'web_search',
    description:
      'Search the web for information. Use this to research errors, find cryptocurrency information, look up blockchain concepts, check exchange rates, or find any information to help the user. Returns search results with titles, URLs, and snippets.',
    inputSchema: {
      type: 'object',
      properties: {
        query: {
          type: 'string',
          description: 'Search query (e.g., "BitGo create address pricing plan error", "current bitcoin testnet faucet", "ERC-20 token transfer gas limit")',
        },
      },
      required: ['query'],
    },
  },
  {
    name: 'web_fetch',
    description:
      'Fetch the content of a web page and extract its text. Use this to read documentation pages, blog posts, API references, or any public URL. Useful for following up on search results or reading specific documentation.',
    inputSchema: {
      type: 'object',
      properties: {
        url: {
          type: 'string',
          description: 'The URL to fetch (must be a valid HTTP/HTTPS URL)',
        },
        maxLength: {
          type: 'number',
          description: 'Maximum characters to return (default 5000, max 10000)',
        },
      },
      required: ['url'],
    },
  },
  {
    name: 'calculate',
    description:
      'Perform mathematical calculations. Supports basic arithmetic, unit conversions between crypto denominations (satoshis to BTC, wei to ETH, lamports to SOL), and percentage calculations. Use this for amount conversions, fee calculations, or any math the user needs.',
    inputSchema: {
      type: 'object',
      properties: {
        expression: {
          type: 'string',
          description: 'Math expression to evaluate (e.g., "0.5 * 100000000" for BTC to satoshis, "1000000000000000000 / 1e18" for wei to ETH)',
        },
      },
      required: ['expression'],
    },
  },
  {
    name: 'get_crypto_price',
    description:
      'Get the current price of a cryptocurrency in USD. Useful for estimating transaction values, checking if amounts are reasonable, and informing the user about the USD value of their transactions.',
    inputSchema: {
      type: 'object',
      properties: {
        coin: {
          type: 'string',
          description: 'Cryptocurrency symbol (e.g., "bitcoin", "ethereum", "solana", "litecoin")',
        },
      },
      required: ['coin'],
    },
  },
  {
    name: 'get_current_time',
    description:
      'Get the current date and time. Useful for logging, timestamping operations, or answering time-related questions.',
    inputSchema: {
      type: 'object',
      properties: {},
      required: [],
    },
  },
];
