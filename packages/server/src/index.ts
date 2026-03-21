import express from 'express';
import cors from 'cors';
import { WebSocketServer, WebSocket } from 'ws';
import http from 'http';
import { config, validateConfig } from './config';
import { BitGoClient } from './bitgo/client';
import { BitGoExpressClient } from './bitgo/express';
import { PassphraseVault } from './bitgo/vault';
import { AuditLogger } from './audit/logger';
import { AgentGuard } from './guard';
import { PolicyEngine } from './guard/layer3-policy';
import { ToolHandlers } from './agent/toolHandlers';
import { AgentBrain } from './agent/brain';
import { createApiRouter } from './routes/api';
import { handleWebSocketConnection } from './ws/handler';
import { WebhookManager } from './webhooks/manager';

async function main() {
  console.log('🚀 Starting Agentic Wallet Server...\n');

  // Validate config
  try {
    validateConfig();
  } catch (err: any) {
    console.warn(`⚠️  Config warning: ${err.message}`);
    console.warn('Some features may not work. Create a .env file from .env.example.\n');
  }

  // --- Initialize components ---

  // WebSocket broadcast function
  const clients = new Set<WebSocket>();
  const broadcast = (event: string, data: unknown) => {
    const msg = JSON.stringify({ type: event, ...(typeof data === 'object' ? data : { data }) });
    for (const ws of clients) {
      if (ws.readyState === WebSocket.OPEN) {
        ws.send(msg);
      }
    }
  };

  // Core services
  const auditLogger = new AuditLogger(broadcast);
  const policyEngine = new PolicyEngine();
  const guard = new AgentGuard(policyEngine);
  const vault = new PassphraseVault();

  // BitGo clients
  const bitgoClient = new BitGoClient();
  const expressClient = new BitGoExpressClient();

  // Pre-init BitGo SDK (avoids lazy import on first request)
  await expressClient.initSdk();

  // Check Express connectivity
  const expressHealthy = await expressClient.healthCheck();
  if (expressHealthy) {
    console.log('✅ BitGo Express (Docker) is reachable at', config.bitgo.expressUrl);
  } else {
    console.warn('⚠️  BitGo Express not reachable at', config.bitgo.expressUrl);
    console.warn('   Run: docker-compose up -d\n');
  }

  // Webhook manager for auto-registering transfer webhooks
  const webhookManager = new WebhookManager(bitgoClient, expressClient, broadcast);

  // Register webhooks for all existing agentic wallets (so incoming deposits are captured)
  const walletEntries = vault.listWalletEntries();
  webhookManager.registerWebhooksForWallets(walletEntries).catch((err) => {
    console.warn('Failed to register webhooks at startup:', err.message);
  });

  // Tool handlers & Agent brain
  const toolHandlers = new ToolHandlers(bitgoClient, expressClient, vault, webhookManager);
  const brain = new AgentBrain(toolHandlers, guard, auditLogger);
  await brain.init();

  // --- Express HTTP Server ---
  const app = express();
  app.use(cors());
  app.use(express.json());

  // Health check
  app.get('/health', (_req, res) => {
    res.json({
      status: 'ok',
      expressConnected: expressHealthy,
      vaultWallets: vault.listWalletIds().length,
      policyRules: policyEngine.getRules().length,
    });
  });

  // API routes
  app.use('/api', createApiRouter(auditLogger, policyEngine, webhookManager, vault, expressClient));

  // --- HTTP + WebSocket Server ---
  const server = http.createServer(app);
  const wss = new WebSocketServer({ server, path: '/ws' });

  wss.on('connection', (ws) => {
    clients.add(ws);
    ws.on('close', () => clients.delete(ws));
    handleWebSocketConnection(ws, brain, auditLogger);
  });

  server.listen(config.port, () => {
    console.log(`\n🌐 Server running at http://localhost:${config.port}`);
    console.log(`🔌 WebSocket at ws://localhost:${config.port}/ws`);
    console.log(`📊 Health check: http://localhost:${config.port}/health`);
    console.log(`📋 Audit trail: http://localhost:${config.port}/api/audit`);
    console.log(`🛡️  Policies: http://localhost:${config.port}/api/policies`);
    if (config.webhookUrl) {
      console.log(`🔔 Webhook mode: BitGo → ${config.webhookUrl}/api/webhook`);
    } else {
      console.log(`🔔 Transfer tracking: polling mode (set WEBHOOK_URL for webhook mode)`);
    }
    console.log(`\n--- Ready for connections ---\n`);
  });
}

main().catch((err) => {
  console.error('Fatal error:', err);
  process.exit(1);
});
