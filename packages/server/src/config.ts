import dotenv from 'dotenv';
import path from 'path';

dotenv.config({ path: path.resolve(__dirname, '../../../.env') });

export const config = {
  port: parseInt(process.env.PORT || '3000', 10),
  bitgo: {
    accessToken: process.env.BITGO_ACCESS_TOKEN || '',
    env: (process.env.BITGO_ENV || 'test') as 'test' | 'prod',
    expressUrl: process.env.BITGO_EXPRESS_URL || 'http://localhost:3080',
    enterpriseId: process.env.ENTERPRISE_ID || '',
  },
  vault: {
    masterKey: process.env.VAULT_MASTER_KEY || '',
  },
  // Public URL for BitGo to send webhook callbacks to.
  // For local dev, use ngrok or similar tunneling service.
  webhookUrl: process.env.WEBHOOK_URL || '',
  // Claude Code SDK model (Anthropic only). Examples: claude-sonnet-4-6, claude-opus-4.
  agentModel: process.env.AGENT_MODEL || 'claude-sonnet-4-6',
};

export function validateConfig(): void {
  if (!config.bitgo.accessToken) {
    throw new Error('BITGO_ACCESS_TOKEN is required in .env');
  }
  if (!config.vault.masterKey || config.vault.masterKey.length < 32) {
    throw new Error('VAULT_MASTER_KEY must be at least 32 hex chars in .env');
  }
}
