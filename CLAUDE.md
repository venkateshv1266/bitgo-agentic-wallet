# Agentic Wallet — Codebase Map

> Progressive disclosure: start at Level 1, drill down only when relevant.

---

## Level 1 — What Is This?

A **local, single-user agentic crypto wallet** that lets Claude manage BitGo wallets via natural language. Built as a monorepo with two packages:

- **`packages/server`** — Node.js/Express backend. Claude agent + Guard + REST/WebSocket API.
- **`packages/ui`** — React/Vite frontend. Chat UI + wallet dashboard + approvals panel.

Runs entirely locally. Uses BitGo testnet (no real funds). Docker runs BitGo Express for TSS signing.

**Start:** `npm start` → runs `scripts/start.sh` → checks prereqs → starts Docker → starts cloudflared tunnel → starts both packages.

---

## Level 2 — Repository Layout

```
agentic-wallet/
├── scripts/start.sh          # One-command startup orchestrator (6 steps)
├── packages/
│   ├── server/src/           # All server code (see Level 3)
│   └── ui/src/               # All frontend code (see Level 3)
├── docker-compose.yml        # BitGo Express on :3080
├── .env                      # Secrets (never commit)
├── .env.example              # Template
├── guard-policies.json       # Persisted policy rules (mutable at runtime)
├── vault.enc.json            # Encrypted wallet passphrases (AES-256-GCM)
├── audit-trail.jsonl         # Append-only audit log (one JSON per line)
├── package.json              # Monorepo root — workspaces: server + ui
└── tsconfig.base.json        # Shared TS config
```

**Ports:**
- `:3000` — Server (HTTP REST + WebSocket)
- `:3080` — BitGo Express (Docker, TSS signing)
- `:5173` — UI (Vite dev server)

---

## Level 3 — Server Package (`packages/server/src/`)

```
src/
├── index.ts              # Entry: wires everything, starts Express+WS server
├── config.ts             # dotenv loader, exports `config` object
├── agent/
│   ├── brain.ts          # AgentBrain: runs Claude SDK, MCP server, session mgmt
│   ├── tools.ts          # 44 TOOL_DEFINITIONS (schemas for every BitGo action)
│   ├── toolHandlers.ts   # ToolHandlers: routes tool calls to BitGo APIs
│   └── prompts.ts        # SYSTEM_PROMPT: Claude's scope + safety rules
├── guard/
│   ├── index.ts          # AgentGuard: chains all 3 layers
│   ├── layer1-auth.ts    # Auth check + rate limit (30 req/min per session)
│   ├── layer2-intent.ts  # Zod schema validation + anomaly detection
│   ├── layer3-policy.ts  # PolicyEngine: rules from guard-policies.json
│   ├── prices.ts         # getUsdValue(coin, amount) → USD float
│   └── types.ts          # GuardResult, PolicyRule, AuditEntry interfaces
├── bitgo/
│   ├── client.ts         # BitGoClient: READ-ONLY SDK wrapper (listWallets, etc.)
│   └── express.ts        # BitGoExpressClient: HTTP client for signing ops (sendcoins, etc.)
├── bitgo/vault.ts        # PassphraseVault: encrypt/decrypt passphrases per wallet
├── audit/
│   ├── logger.ts         # AuditLogger: log + broadcast + pending approvals manager
│   └── types.ts          # AuditEntry, PendingApproval types
├── routes/api.ts         # Express Router — all REST endpoints
└── ws/handler.ts         # WebSocket message handler (chat + approvals)
```

### Startup Sequence (`index.ts`)
1. `validateConfig()` — abort if missing creds
2. `new PassphraseVault()` — load vault.enc.json
3. `new BitGoClient()` + `new BitGoExpressClient()` — init SDK
4. Pre-init BitGo SDK (avoids lazy-load delay on first request)
5. Check Express reachable on :3080
6. `new AuditLogger(broadcast)` — load audit-trail.jsonl
7. `webhookManager.registerWebhooksForWallets(...)` — register BitGo webhooks for all agentic wallets
8. `new AgentBrain(...)` + `brain.init()` — load Claude SDK
9. Create HTTP + WebSocket server, listen on PORT

---

## Level 3 — UI Package (`packages/ui/src/`)

```
src/
├── main.tsx                       # React entry point
├── App.tsx                        # 4-panel layout (chat + dashboard + audit + approvals)
├── components/
│   ├── ChatPanel.tsx              # Message history, input, tool call cards, approval cards
│   ├── WalletDashboard.tsx        # Lists all wallets, marks agentic vs external
│   ├── RecentTransactions.tsx     # Transfer list with state badges
│   ├── ApprovalsPanel.tsx         # Pending approvals: approve/reject buttons
│   └── AuditTrail.tsx             # Live feed of audit entries
├── hooks/
│   └── useWebSocket.ts            # WS connection, all message handlers, fetchWallets/fetchTransfers
└── store/
    └── index.ts                   # Zustand store: connection, chat, wallets, transfers, approvals, audit
```

**Tab logic (App.tsx):** Header has Wallets / Transactions / Approvals tabs. Right panel switches. `approval_required` WS event auto-switches to Approvals tab.

---

## Level 4 — Key Data Flows

### Send Transfer (full path)

```
User types "Send 0.001 tbtc to <addr>"
  ↓ WS: {type: "chat_message", content: "..."}
  ↓ ws/handler.ts → brain.processMessage()
  ↓ Claude SDK picks tool: send_transaction
  ↓ MCP handler fires → AgentGuard.evaluate()
      Layer 1: auth token OK + rate limit OK
      Layer 2: schema valid + no anomaly burst
      Layer 3: USD > softLimitUsd ($500) → decision: "escalate"
  ↓ auditLogger.createPendingApproval() → returns waitForDecision promise
  ↓ brain yields {type: "approval_required", approval: {...}}
  ↓ WS broadcasts to UI → ApprovalsPanel appears
  ↓ Human clicks Approve
  ↓ WS: {type: "approval_decision", approvalId, decision: "approved"}
  ↓ auditLogger.resolveApproval() → resolves promise → brain continues
  ↓ ToolHandlers.execute("send_transaction", args)
      vault.retrieve(walletId) → decrypted passphrase
      expressClient.sendTransaction(coin, walletId, address, amount, passphrase)
        POST http://localhost:3080/api/v2/{coin}/wallet/{id}/sendcoins
  ↓ Returns {transferId, txid, state: "signed"}
  ↓ auditLogger.log({status: "executed"}) → broadcasts audit_entry
  ↓ webhookManager.trackTransfer(coin, walletId, transferId, txid)
      [webhook mode] — BitGo POSTs to /api/webhook when confirmed
      [polling mode] — GET transfers every 15s for up to 10min
  ↓ On confirmation: broadcast {type: "transfer_update", state: "confirmed"}
```

### Create Wallet (vault enrollment)

```
generate_wallet(coin, label)
  ↓ Guard: not a send op → auto-approve (Layer 3 skips)
  ↓ vault.generatePassphrase() → random 64-char hex
  ↓ expressClient.generateWallet(coin, label, passphrase)
      POST /api/v2/{coin}/wallet
  ↓ vault.store(walletId, coin, label, passphrase)
      AES-256-GCM encrypt → vault.enc.json
  ↓ webhookManager.ensureWebhook(coin, walletId) [if webhook mode]
  ↓ UI: fetchWallets() → new wallet appears with isAgentic: true
```

### Guard Short-Circuit

```
Guard chains: Layer1 → Layer2 → Layer3
  Any layer failure → immediate return (skip remaining layers)

  Decision outcomes:
    "approve"  → tool executes immediately
    "deny"     → tool blocked, logged as "blocked", agent explains
    "escalate" → human approval required, logged as "escalated"
```

---

## Level 5 — Configuration & Environment

### Environment Variables (`.env`)

| Variable | Required | Default | Purpose |
|----------|----------|---------|---------|
| `BITGO_ACCESS_TOKEN` | YES | — | BitGo OAuth token (test.bitgo.com > Developer Options) |
| `ENTERPRISE_ID` | YES | — | BitGo enterprise UUID (Account Settings) |
| `VAULT_MASTER_KEY` | YES | — | 64-hex AES-256-GCM key. Generate: `openssl rand -hex 32` |
| `BITGO_ENV` | NO | `test` | Must be `test` (testnet only) |
| `BITGO_EXPRESS_URL` | NO | `http://localhost:3080` | BitGo Express signing server |
| `PORT` | NO | `3000` | Server listen port |
| `AGENT_MODEL` | NO | `claude-sonnet-4-6` | Claude model for agent brain |
| `WEBHOOK_URL` | NO | — | Public URL for BitGo transfer callbacks. Auto-set by start.sh via cloudflared. If unset → polling mode. |

> **Gotcha:** `start.sh` sources `.env` in Step 2 (exports old `WEBHOOK_URL` to shell env). Step 5 updates `.env` AND re-exports `WEBHOOK_URL` to shell. This is critical — `dotenv.config()` does NOT override existing `process.env` vars.

### Policy Rules (`guard-policies.json`)

```json
{
  "rules": [
    { "id": "...", "walletId": "*",        "type": "tx_limit",        "enabled": true,
      "params": { "softLimitUsd": "500", "hardLimitUsd": "1000" } },
    { "id": "...", "walletId": "*",        "type": "velocity_limit",   "enabled": true,
      "params": { "maxTotalUsd": "5000", "windowSeconds": 3600 } },
    { "id": "...", "walletId": "<id>",     "type": "address_whitelist","enabled": false,
      "params": { "addresses": ["0x..."] } },
    { "id": "...", "walletId": "<id>",     "type": "address_blacklist","enabled": false,
      "params": { "addresses": ["0x..."] } }
  ]
}
```

`walletId: "*"` = applies to all wallets. Rules are mutated via REST API (`POST/DELETE/PATCH /api/policies`).

---

## Level 5 — REST API Reference

Base: `http://localhost:3000/api`

| Method | Path | Purpose |
|--------|------|---------|
| GET | `/health` | `{status, expressConnected, vaultWallets, policyRules}` |
| GET | `/audit?tool=X&status=Y&limit=50` | Audit entries |
| GET | `/policies?walletId=X` | All policy rules (optional wallet filter) |
| POST | `/policies` | Add rule `{id, walletId, type, enabled, params}` |
| DELETE | `/policies/:id` | Remove rule |
| PATCH | `/policies/:id/toggle` | Enable/disable `{enabled: bool}` |
| GET | `/approvals` | Pending approvals |
| POST | `/approvals/:id/resolve` | Resolve `{decision: "approved"\|"rejected"}` |
| GET | `/wallets` | All BitGo wallets (annotated with `isAgentic`) |
| GET | `/vault/wallets` | Agentic wallet IDs only |
| GET | `/transfers?limit=20&prevId=X` | Transfers from all agentic wallets (paginated) |
| POST | `/webhook` | BitGo webhook receiver (transfer confirmations) |

---

## Level 5 — WebSocket Protocol

**Endpoint:** `ws://localhost:3000/ws`

### Client → Server

```
{type: "chat_message", content: "..."}
{type: "stop"}
{type: "approval_decision", approvalId: "uuid", decision: "approved"|"rejected"}
```

### Server → Client

```
{type: "connected",          sessionId, message}
{type: "agent_text",         content}
{type: "tool_call",          tool, input, toolCallId}
{type: "guard_result",       toolCallId, result: {allowed, decision, reason, layers}}
{type: "tool_result",        toolCallId, result}
{type: "audit_entry",        id, timestamp, tool, status, durationMs, ...}
{type: "approval_required",  approval: {id, toolName, toolInput, guardResult, status, createdAt}}
{type: "approval_resolved",  approvalId, decision}
{type: "transfer_update",    transferId, txid, coin, walletId, amount, state, confirmations, ...}
{type: "agent_done"}
{type: "error",              content}
```

---

## Level 5 — The 44 Agent Tools

### Wallet Management
`list_wallets`, `get_wallet`, `get_max_spendable`, `update_wallet`, `generate_wallet`, `freeze_wallet`, `share_wallet`

### Addresses
`create_address`, `list_addresses`, `verify_address`, `is_wallet_address`, `get_canonical_address`

### Transactions (send-like — go through full Guard)
`send_transaction`, `send_many`, `sweep_wallet`, `accelerate_transaction`, `change_fee`

### Transactions (read/build)
`list_transfers`, `get_transfer`, `build_transaction`, `prebuild_and_sign_transaction`

### Lightning
`pay_lightning_invoice`, `lightning_withdraw`

### UTXO
`consolidate_utxos`, `fanout_utxos`, `list_unspents`

### Policies & Approvals
`add_policy_rule`, `delete_policy_rule`, `list_pending_approvals`, `update_pending_approval`

### Token & Account
`enable_tokens`, `recover_token`, `consolidate_account`, `accept_wallet_share`

### Webhooks
`manage_webhook`, `list_webhooks`, `remove_webhook`

### Research & Utility
`search_bitgo_docs`, `web_search`, `web_fetch`, `calculate`, `get_crypto_price`, `get_current_time`

> **Send-like tools** (trigger full Layer 2 anomaly detection + Layer 3 policy): `send_transaction`, `send_many`, `sweep_wallet`, `accelerate_transaction`, `change_fee`

---

## Level 5 — Guard Layers Detail

### Layer 1: Auth & Rate Limit (`layer1-auth.ts`)
- Checks: token configured + session ID exists + ≤30 req/min per session
- State: in-memory `Map<sessionId, {count, windowStart}>`, sliding window
- Fail → `decision: "deny"`

### Layer 2: Intent Verification (`layer2-intent.ts`)
- Checks: Zod schema validation for all 44 tools
- Anomaly: if 3+ send-like ops in 60s → deny (burst prevention)
- Fail → `decision: "deny"`

### Layer 3: Policy Engine (`layer3-policy.ts`)
- Only fires for send-like tools; all others auto-approve
- Rule evaluation (applies if walletId matches and rule enabled):
  - `address_blacklist` → escalate if recipient in list
  - `address_whitelist` → deny if recipient NOT in list
  - `tx_limit` → fetch USD price, compare to soft/hard limit → escalate
  - `velocity_limit` → sum recent USD in window → deny if over max
- State: `guard-policies.json` (disk), loaded at startup
- Fail → `decision: "deny"` or `"escalate"`

---

## Level 5 — Vault & Signing Flow

```
Only agentic wallets (created by agent) can be signed.
External wallets (isAgentic: false) → agent cannot spend.

Signing path:
  1. ToolHandlers.execute("send_transaction", {walletId, ...})
  2. vault.retrieve(walletId) → AES-256-GCM decrypt → plaintext passphrase
  3. expressClient.sendTransaction(..., passphrase)
  4. BitGo Express signs with TSS (local Docker container)
  5. Signed tx broadcast to network

Passphrase storage:
  vault.enc.json — {walletId, encryptedPassphrase, iv, authTag, createdAt}
  Key = VAULT_MASTER_KEY (64-char hex → Buffer)
  Per-passphrase: random 16-byte IV, GCM auth tag
  Passphrase is NEVER logged (redacted in audit trail)
```

---

## Level 5 — Agent Brain Modes

### Mode 1: Isolated SDK (primary)
- Requires `@anthropic-ai/claude-code` package + enterprise auth
- Builds an **in-process MCP server** with ONLY the 44 BitGo tools
- Claude never sees local MCPs (Grafana, Snowflake, Slack, etc.)
- Zod schemas built from `TOOL_DEFINITIONS`
- Streams response back to user as async generator
- Session continuity: `sessions: Map<sessionId, sdkSessionId>`
- MCP server cached per session: `mcpServerCache: Map<sessionId, mcpServer>`

### Mode 2: Direct (fallback)
- No LLM — regex intent matching on user message
- Handles: "list wallets", "create wallet" — hardcoded
- Used when Claude Code SDK unavailable

### Message types yielded by `brain.processMessage()`:
`agent_text`, `tool_call`, `guard_result`, `tool_result`, `approval_required`, `error`

---

## Level 6 — Common Tasks & Where to Look

| Task | Files to read |
|------|--------------|
| Add a new agent tool | `agent/tools.ts` (schema), `agent/toolHandlers.ts` (handler), `guard/layer2-intent.ts` (Zod schema) |
| Change policy logic | `guard/layer3-policy.ts` |
| Add a REST endpoint | `routes/api.ts` |
| Change how approvals work | `audit/logger.ts` (createPendingApproval), `ws/handler.ts` (resolution) |
| Debug webhook vs polling | `webhooks/manager.ts`, `scripts/start.sh` (Step 5) |
| Change Claude model/prompt | `config.ts` (AGENT_MODEL), `agent/prompts.ts` |
| Add a UI component | `packages/ui/src/components/`, wire into `App.tsx`, add state to `store/index.ts` |
| Understand transfer confirmation | `webhooks/manager.ts` → trackTransfer → pollTransferStatus or handleWebhookEvent |
| Debug startup failures | `scripts/start.sh` (6 steps), `index.ts` (startup sequence) |
| Understand why tx was blocked | Check `audit-trail.jsonl`, look at `guardResult.layers` for which layer failed |

---

## Level 6 — Known Gotchas & Non-Obvious Behavior

1. **`WEBHOOK_URL` stale env var:** `start.sh` sources `.env` early (Step 2), then updates it (Step 5). Without `export WEBHOOK_URL="$TUNNEL_URL"` in Step 5, server inherits the OLD URL because `dotenv.config()` doesn't override existing `process.env` vars.

2. **`isAgentic` flag is computed:** `ToolHandlers.execute("list_wallets")` annotates each wallet by checking `vault.has(walletId)`. Not a BitGo field.

3. **Guard only checks send-like tools in Layer 3:** `list_wallets`, `get_wallet`, etc. skip policy evaluation entirely — they auto-approve after Layer 1+2.

4. **Velocity limit uses audit log:** `PolicyEngine` calls `auditLogger.getRecentSends(windowMs)` to sum past USD amounts. The audit log is the source of truth for velocity.

5. **Approval is a promise:** `auditLogger.createPendingApproval()` returns a `waitForDecision: Promise`. The brain awaits it before continuing. Resolution happens when `auditLogger.resolveApproval()` is called from the WS handler.

6. **Claude Code SDK uses enterprise auth:** The agent auth is separate from `BITGO_ACCESS_TOKEN`. Claude SDK uses its own enterprise token via isolated MCP mode.

7. **Polling caps at 10 minutes:** 40 attempts × 15s = 600s. After that, the transfer is no longer tracked (no timeout error sent to UI).

8. **Duplicate transfer broadcast prevention:** `WebhookManager.confirmedTransfers: Set<string>` deduplicates by `${txid}-confirmed`. Prevents double-confirmation from both webhook + polling.

9. **`tsx watch` doesn't watch `.env`:** Server must be restarted to pick up `.env` changes (it's only read once at startup via `dotenv.config()`).

10. **BitGo Express is stateless per request:** Each signing call passes the passphrase in the request body. Express doesn't persist any wallet state.
