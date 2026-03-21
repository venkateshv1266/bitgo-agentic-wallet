# Agentic Wallet

AI-powered BitGo wallet management via natural language. An agent (Claude) interprets your intent, a 3-layer guard gates every operation, and BitGo Express handles TSS signing — all running locally on testnet.

## Quick Start

```bash
npm start
```

That's it. The startup script handles everything:

1. Checks prerequisites (Node.js, Docker)
2. Validates `.env` configuration
3. Starts BitGo Express container on `:3080`
4. Installs dependencies if needed
5. Starts a cloudflared tunnel for webhook callbacks (if available)
6. Launches the server (`:3000`) and UI (`:5173`)

Open **http://localhost:5173** in your browser.

## One-Time Setup

### 1. Prerequisites

- **Node.js** >= 18
- **Docker** or Podman (for BitGo Express signing server)
- **cloudflared** (optional, for webhook confirmations): `brew install cloudflared`

### 2. BitGo Test Account

1. Go to [test.bitgo.com](https://test.bitgo.com) and create an account
2. **Access Token**: Developer Options → Access Tokens (scopes: `wallet_create`, `wallet_spend`, `wallet_view_all`)
3. **Enterprise ID**: Account Settings → Enterprise Info

### 3. Environment File

```bash
cp .env.example .env
```

Fill in:

| Variable | Where to get it |
|---|---|
| `BITGO_ACCESS_TOKEN` | BitGo test dashboard → Developer Options |
| `ENTERPRISE_ID` | BitGo test dashboard → Account Settings |
| `VAULT_MASTER_KEY` | Run: `openssl rand -hex 32` |

## Architecture

```
User (Chat UI :5173)
  │ WebSocket
  ▼
Server (:3000)
  ├── Agent Brain (Claude Code SDK)
  │     └── 44 Tools (wallets, transfers, addresses, policies, webhooks, etc.)
  ├── Agent Guard (3 layers)
  │     ├── Layer 1: Auth & Rate Limiting (30 req/min per session)
  │     ├── Layer 2: Schema Validation (Zod) & Anomaly Detection (burst prevention)
  │     └── Layer 3: Policy Engine (tx limits, velocity, whitelist/blacklist)
  │           → APPROVE / DENY / ESCALATE (human approval)
  ├── Passphrase Vault (AES-256-GCM encrypted)
  ├── Audit Logger (append-only JSONL + real-time broadcast)
  └── Webhook Manager (webhook mode or polling fallback)
  │
  ▼
BitGo Express (:3080, Docker)
  └── Local TSS signing → BitGo Platform → Blockchain
```

### Send Transaction Flow

```
"Send 0.001 tBTC to tb1q..."
  → Agent Brain selects send_transaction tool
    → Guard Layer 1: auth + rate limit ✓
    → Guard Layer 2: schema valid + no burst ✓
    → Guard Layer 3: USD value > $500 soft limit → ESCALATE
      → UI shows Approve/Reject in Approvals panel
        → Human clicks Approve
          → Vault decrypts passphrase
            → BitGo Express signs (TSS)
              → Broadcast to network
                → Webhook/polling tracks confirmation
                  → UI shows "confirmed"
```

## What You Can Do

Talk to the agent in natural language:

- *"Create a new testnet Bitcoin wallet called my-savings"*
- *"List my wallets"* / *"What's my balance?"*
- *"Send 0.001 hteth from wallet X to 0xABC..."*
- *"Show transfers for wallet X"*
- *"Set a $100 transaction limit on this wallet"*
- *"Add 0xABC to the address whitelist"*
- *"Freeze wallet X"*
- *"Search BitGo docs for multi-sig setup"*

### 44 Agent Tools

| Category | Tools |
|---|---|
| **Wallet Management** | `list_wallets`, `get_wallet`, `get_max_spendable`, `update_wallet`, `generate_wallet`, `freeze_wallet`, `share_wallet` |
| **Addresses** | `create_address`, `list_addresses`, `verify_address`, `is_wallet_address`, `get_canonical_address` |
| **Transactions** | `send_transaction`, `send_many`, `sweep_wallet`, `accelerate_transaction`, `change_fee`, `list_transfers`, `get_transfer`, `build_transaction`, `prebuild_and_sign_transaction` |
| **Lightning** | `pay_lightning_invoice`, `lightning_withdraw` |
| **UTXO** | `consolidate_utxos`, `fanout_utxos`, `list_unspents` |
| **Policies & Approvals** | `add_policy_rule`, `delete_policy_rule`, `list_pending_approvals`, `update_pending_approval` |
| **Token & Account** | `enable_tokens`, `recover_token`, `consolidate_account`, `accept_wallet_share` |
| **Webhooks** | `manage_webhook`, `list_webhooks`, `remove_webhook` |
| **Research & Utility** | `search_bitgo_docs`, `web_search`, `web_fetch`, `calculate`, `get_crypto_price`, `get_current_time` |

### Guard Decisions

| Decision | What happens |
|---|---|
| **Approve** | Tool executes immediately |
| **Deny** | Blocked — agent explains why |
| **Escalate** | Paused — UI shows Approve/Reject buttons, waits for human |

### Default Policy Rules

| Rule | Behavior |
|---|---|
| **Transaction Limit** | Soft limit ($500) → escalate for approval. Hard limit ($1000) → deny. |
| **Velocity Limit** | Max $5000 total sent per hour across all wallets |
| **Address Whitelist** | If enabled, only listed addresses can receive funds |
| **Address Blacklist** | If enabled, listed addresses are blocked from receiving |

Policies apply per-wallet (`walletId`) or globally (`*`). Manage via the agent, REST API, or directly in `guard-policies.json`.

## Project Structure

```
agentic-wallet/
├── scripts/start.sh              # One-command startup orchestrator
├── docker-compose.yml            # BitGo Express container
├── guard-policies.json           # Policy rules (mutable at runtime)
├── vault.enc.json                # Encrypted wallet passphrases
├── audit-trail.jsonl             # Append-only audit log
├── .env                          # Credentials (not committed)
├── packages/
│   ├── server/src/
│   │   ├── index.ts              # Entry: Express + WebSocket server
│   │   ├── config.ts             # Environment config loader
│   │   ├── agent/
│   │   │   ├── brain.ts          # AgentBrain: Claude SDK + MCP server + sessions
│   │   │   ├── tools.ts          # 44 tool definitions (schemas)
│   │   │   ├── toolHandlers.ts   # Tool execution → BitGo APIs
│   │   │   └── prompts.ts        # System prompt (scope + safety rules)
│   │   ├── guard/
│   │   │   ├── index.ts          # AgentGuard: chains 3 layers
│   │   │   ├── layer1-auth.ts    # Auth + rate limiting
│   │   │   ├── layer2-intent.ts  # Zod validation + anomaly detection
│   │   │   ├── layer3-policy.ts  # PolicyEngine: limits, velocity, whitelists
│   │   │   ├── prices.ts         # USD price lookup for policy evaluation
│   │   │   └── types.ts          # Guard types and interfaces
│   │   ├── bitgo/
│   │   │   ├── client.ts         # BitGoClient: SDK wrapper (read ops)
│   │   │   ├── express.ts        # BitGoExpressClient: HTTP to Express (write/sign ops)
│   │   │   └── vault.ts          # PassphraseVault: AES-256-GCM encrypt/decrypt
│   │   ├── webhooks/
│   │   │   └── manager.ts        # Webhook registration + polling fallback
│   │   ├── audit/
│   │   │   ├── logger.ts         # AuditLogger: log + broadcast + pending approvals
│   │   │   └── types.ts          # Audit entry types
│   │   ├── routes/api.ts         # REST endpoints
│   │   └── ws/handler.ts         # WebSocket message handler
│   └── ui/src/
│       ├── App.tsx               # 4-panel layout (chat + dashboard + audit + approvals)
│       ├── components/
│       │   ├── ChatPanel.tsx     # Message history + input + tool call cards
│       │   ├── WalletDashboard.tsx
│       │   ├── RecentTransactions.tsx
│       │   ├── ApprovalsPanel.tsx # Pending approvals: approve/reject buttons
│       │   └── AuditTrail.tsx    # Live audit feed
│       ├── hooks/
│       │   └── useWebSocket.ts   # WS connection + event handlers
│       └── store/
│           └── index.ts          # Zustand store (connection, chat, wallets, etc.)
```

## API Reference

Base: `http://localhost:3000/api`

| Method | Path | Purpose |
|---|---|---|
| GET | `/health` | Health check (Express status, vault wallets, policy count) |
| GET | `/wallets` | All BitGo wallets (annotated with `isAgentic` flag) |
| GET | `/vault/wallets` | Agentic wallet IDs only |
| GET | `/transfers?limit=20&prevId=X` | Transfers from agentic wallets (paginated) |
| GET | `/audit?tool=X&status=Y&limit=50` | Audit trail (filterable) |
| GET | `/policies?walletId=X` | Policy rules (optional wallet filter) |
| POST | `/policies` | Add a policy rule |
| DELETE | `/policies/:id` | Remove a policy rule |
| PATCH | `/policies/:id/toggle` | Enable/disable a rule |
| GET | `/approvals` | Pending human approvals |
| POST | `/approvals/:id/resolve` | Approve or reject `{decision: "approved"\|"rejected"}` |
| POST | `/webhook` | BitGo webhook receiver |

### WebSocket Protocol

Connect: `ws://localhost:3000/ws`

**Client → Server:** `chat_message`, `stop`, `approval_decision`

**Server → Client:** `connected`, `agent_text`, `tool_call`, `guard_result`, `tool_result`, `approval_required`, `approval_resolved`, `transfer_update`, `audit_entry`, `agent_done`, `error`

## Environment Variables

| Variable | Required | Default | Purpose |
|---|---|---|---|
| `BITGO_ACCESS_TOKEN` | Yes | — | BitGo API token (testnet) |
| `ENTERPRISE_ID` | Yes | — | BitGo enterprise UUID |
| `VAULT_MASTER_KEY` | Yes | — | AES-256-GCM key for passphrase vault |
| `BITGO_ENV` | No | `test` | Must be `test` (testnet only) |
| `BITGO_EXPRESS_URL` | No | `http://localhost:3080` | BitGo Express URL |
| `PORT` | No | `3000` | Server port |
| `AGENT_MODEL` | No | `claude-sonnet-4-6` | Claude model for the agent |
| `WEBHOOK_URL` | No | — | Auto-set by start.sh via cloudflared |

## Development

```bash
npm run server   # server only (tsx watch, hot reload)
npm run ui       # UI only (vite dev server)
npm run dev      # both concurrently
```

## How Webhooks Work

**Webhook mode** (automatic with `npm start` if cloudflared is installed):
```
Send tx → register webhook on BitGo for wallet
  → BitGo detects on-chain confirmation
    → POSTs to cloudflared tunnel → /api/webhook
      → Server broadcasts transfer_update via WebSocket
        → UI shows "confirmed"
```

**Polling mode** (fallback, no tunnel needed):
```
Send tx → poll BitGo every 15s for up to 10 minutes
  → Status changes to "confirmed" → broadcast to UI
```

## Troubleshooting

**"BitGo Express not reachable"**
```bash
docker compose up -d
docker compose logs bitgo-express
```

**"No passphrase found in vault"**
Only wallets created by the agent have passphrases in the vault. External wallets are read-only.

**Transfer stuck as "signed"**
Check if webhook tunnel is active. Falls back to polling automatically, but polling caps at 10 minutes.

**Agent not responding**
Verify Claude Code SDK enterprise auth is configured. The agent uses isolated MCP mode — separate from any local MCP servers.

## Tech Stack

| Component | Technology |
|---|---|
| **Server** | Node.js, Express, TypeScript, WebSocket |
| **Agent** | Claude Code SDK (enterprise auth, isolated MCP) |
| **Validation** | Zod (44 tool schemas) |
| **UI** | React 19, Vite, Tailwind CSS, Zustand |
| **Crypto** | BitGo SDK, BitGo Express (Docker, TSS signing) |
| **Security** | AES-256-GCM vault, 3-layer guard, rate limiting |
| **Observability** | Append-only JSONL audit trail, real-time WebSocket broadcast |
