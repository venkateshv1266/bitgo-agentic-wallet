#!/usr/bin/env bash
set -euo pipefail

ROOT_DIR="$(cd "$(dirname "$0")/.." && pwd)"
cd "$ROOT_DIR"

# Colors
RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
BLUE='\033[0;34m'
CYAN='\033[0;36m'
NC='\033[0m' # No Color
BOLD='\033[1m'

log()  { echo -e "${GREEN}[OK]${NC} $1"; }
warn() { echo -e "${YELLOW}[!!]${NC} $1"; }
err()  { echo -e "${RED}[ERR]${NC} $1"; }
info() { echo -e "${BLUE}[..]${NC} $1"; }
header() { echo -e "\n${BOLD}${CYAN}── $1 ──${NC}\n"; }

TUNNEL_PID=""
cleanup() {
  if [ -n "$TUNNEL_PID" ]; then
    kill "$TUNNEL_PID" 2>/dev/null || true
  fi
}
trap cleanup EXIT

# ─────────────────────────────────────────────
header "Agentic Wallet — Startup"
# ─────────────────────────────────────────────

# 0. Clean up stale processes
header "Step 0/6: Cleanup"

PORT_VAL="${PORT:-3000}"
STALE_PIDS=$(lsof -ti tcp:"$PORT_VAL" 2>/dev/null || true)
if [ -n "$STALE_PIDS" ]; then
  echo "$STALE_PIDS" | xargs kill -9 2>/dev/null || true
  log "Killed stale process(es) on :$PORT_VAL"
else
  log "No stale processes on :$PORT_VAL"
fi

# 1. Check prerequisites
header "Step 1/7: Prerequisites"

if ! command -v node &>/dev/null; then
  err "Node.js is not installed. Install from https://nodejs.org"
  exit 1
fi
NODE_VER=$(node -v)
log "Node.js $NODE_VER"

if command -v docker &>/dev/null; then
  # docker may be aliased to podman — check if the engine is reachable
  if docker info &>/dev/null 2>&1 || podman info &>/dev/null 2>&1; then
    log "Container runtime is running ($(docker --version 2>/dev/null | head -1 || echo 'podman'))"
  else
    err "Container runtime not running. Start Docker Desktop or run: podman machine start"
    exit 1
  fi
elif command -v podman &>/dev/null; then
  if podman info &>/dev/null 2>&1; then
    log "Podman is running"
  else
    err "Podman machine not running. Run: podman machine start"
    exit 1
  fi
else
  err "No container runtime found. Install Docker or Podman."
  exit 1
fi

# 2. Check .env
header "Step 2/7: Environment"

if [ ! -f .env ]; then
  if [ -f .env.example ]; then
    err ".env file not found. Creating from .env.example..."
    cp .env.example .env
    warn "Edit .env and fill in your BitGo credentials:"
    echo "   BITGO_ACCESS_TOKEN  — from test.bitgo.com > Developer Options > Access Tokens"
    echo "   ENTERPRISE_ID       — from test.bitgo.com > Account Settings"
    echo "   VAULT_MASTER_KEY    — run: openssl rand -hex 32"
    exit 1
  else
    err ".env and .env.example not found"
    exit 1
  fi
fi

# Validate required vars
set -a
source .env
set +a
MISSING=""
if [ -z "${BITGO_ACCESS_TOKEN:-}" ] || [[ "${BITGO_ACCESS_TOKEN}" == "v2x...your"* ]]; then
  MISSING="$MISSING BITGO_ACCESS_TOKEN"
fi
if [ -z "${ENTERPRISE_ID:-}" ] || [[ "${ENTERPRISE_ID}" == "your-"* ]]; then
  MISSING="$MISSING ENTERPRISE_ID"
fi
if [ -z "${VAULT_MASTER_KEY:-}" ] || [[ "${VAULT_MASTER_KEY}" == "your-"* ]]; then
  MISSING="$MISSING VAULT_MASTER_KEY"
fi

if [ -n "$MISSING" ]; then
  err "Missing or placeholder values in .env:$MISSING"
  echo "   Edit .env and fill in real values. See .env.example for details."
  exit 1
fi
log ".env configured"

# 3. BitGo Express (Docker)
header "Step 3/7: BitGo Express"

if curl -sf http://localhost:3080/api/v2/ping >/dev/null 2>&1; then
  log "BitGo Express already running on :3080"
else
  info "Starting BitGo Express container..."
  docker compose up -d 2>/dev/null || docker-compose up -d 2>/dev/null || podman compose up -d 2>/dev/null
  # Wait for it to be ready
  for i in {1..30}; do
    if curl -sf http://localhost:3080/api/v2/ping >/dev/null 2>&1; then
      break
    fi
    sleep 1
  done
  if curl -sf http://localhost:3080/api/v2/ping >/dev/null 2>&1; then
    log "BitGo Express started on :3080"
  else
    err "BitGo Express failed to start. Check: docker compose logs bitgo-express"
    exit 1
  fi
fi

# 4. Install dependencies
header "Step 4/7: Dependencies"

if [ ! -d node_modules ]; then
  info "Installing npm dependencies..."
  npm install
  log "Dependencies installed"
else
  log "Dependencies already installed"
fi

# 5. Webhook tunnel (cloudflared)
header "Step 5/7: Webhook Tunnel"

if [ -n "${WEBHOOK_URL:-}" ] && [[ "${WEBHOOK_URL}" != https://*.trycloudflare.com* ]]; then
  # User has a custom webhook URL set — use it as-is
  log "Using custom WEBHOOK_URL: $WEBHOOK_URL"
elif command -v cloudflared &>/dev/null; then
  info "Starting cloudflared tunnel for webhook callbacks..."
  cloudflared tunnel --url http://localhost:${PORT:-3000} > /tmp/agentic-wallet-tunnel.log 2>&1 &
  TUNNEL_PID=$!

  # Wait for tunnel URL (grep may return 1 if no match yet, so || true)
  TUNNEL_URL=""
  for i in {1..20}; do
    TUNNEL_URL=$(grep -o 'https://[^ ]*\.trycloudflare\.com' /tmp/agentic-wallet-tunnel.log 2>/dev/null | head -1 || true)
    if [ -n "$TUNNEL_URL" ]; then break; fi
    sleep 1
  done

  if [ -n "$TUNNEL_URL" ]; then
    # Update .env with the tunnel URL
    if grep -q '^WEBHOOK_URL=' .env; then
      sed -i '' "s|^WEBHOOK_URL=.*|WEBHOOK_URL=$TUNNEL_URL|" .env
    else
      echo "" >> .env
      echo "# Auto-set by start.sh (cloudflared tunnel)" >> .env
      echo "WEBHOOK_URL=$TUNNEL_URL" >> .env
    fi
    # Also update the shell env so the server inherits the new URL
    # (dotenv.config() does not override existing env vars, so without this
    # the server would use the stale value sourced from .env in step 2)
    export WEBHOOK_URL="$TUNNEL_URL"
    log "Tunnel active: $TUNNEL_URL"
    log "BitGo will POST confirmations to: $TUNNEL_URL/api/webhook"
  else
    warn "Tunnel failed to start. Falling back to polling mode."
    warn "Check /tmp/agentic-wallet-tunnel.log for details."
    # Remove WEBHOOK_URL so server uses polling
    sed -i '' '/^WEBHOOK_URL=/d' .env 2>/dev/null || true
    unset WEBHOOK_URL
    TUNNEL_PID=""
  fi
else
  warn "cloudflared not found. Using polling mode for transfer confirmations."
  warn "To enable webhooks: brew install cloudflared"
  # Remove stale WEBHOOK_URL
  sed -i '' '/^WEBHOOK_URL=/d' .env 2>/dev/null || true
fi

# 6. Start the app
header "Step 6/7: Starting App"

info "Starting server + UI..."
echo ""
npm run dev
