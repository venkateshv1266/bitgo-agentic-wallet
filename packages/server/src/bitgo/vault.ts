import crypto from 'crypto';
import fs from 'fs';
import path from 'path';
import { config } from '../config';

interface VaultEntry {
  walletId: string;
  coin: string;
  label: string;
  encryptedPassphrase: string;
  iv: string;
  authTag: string;
  backupKeyEncrypted?: string;
  backupIv?: string;
  backupAuthTag?: string;
  createdAt: number;
}

const VAULT_FILE = path.resolve(__dirname, '../../../../vault.enc.json');
const ALGORITHM = 'aes-256-gcm';

function getKey(): Buffer {
  const key = config.vault.masterKey;
  return Buffer.from(key.padEnd(64, '0').slice(0, 64), 'hex');
}

function encrypt(plaintext: string): { encrypted: string; iv: string; authTag: string } {
  const iv = crypto.randomBytes(16);
  const cipher = crypto.createCipheriv(ALGORITHM, getKey(), iv);
  let encrypted = cipher.update(plaintext, 'utf8', 'hex');
  encrypted += cipher.final('hex');
  const authTag = cipher.getAuthTag().toString('hex');
  return { encrypted, iv: iv.toString('hex'), authTag };
}

function decrypt(encrypted: string, ivHex: string, authTagHex: string): string {
  const iv = Buffer.from(ivHex, 'hex');
  const authTag = Buffer.from(authTagHex, 'hex');
  const decipher = crypto.createDecipheriv(ALGORITHM, getKey(), iv);
  decipher.setAuthTag(authTag);
  let decrypted = decipher.update(encrypted, 'hex', 'utf8');
  decrypted += decipher.final('utf8');
  return decrypted;
}

export class PassphraseVault {
  private entries: Map<string, VaultEntry> = new Map();

  constructor() {
    this.load();
  }

  generatePassphrase(): string {
    return crypto.randomBytes(32).toString('hex');
  }

  store(walletId: string, coin: string, label: string, passphrase: string, backupKey?: string): void {
    const { encrypted, iv, authTag } = encrypt(passphrase);
    const entry: VaultEntry = {
      walletId,
      coin,
      label,
      encryptedPassphrase: encrypted,
      iv,
      authTag,
      createdAt: Date.now(),
    };

    if (backupKey) {
      const backup = encrypt(backupKey);
      entry.backupKeyEncrypted = backup.encrypted;
      entry.backupIv = backup.iv;
      entry.backupAuthTag = backup.authTag;
    }

    this.entries.set(walletId, entry);
    this.persist();
  }

  retrieve(walletId: string): string | null {
    const entry = this.entries.get(walletId);
    if (!entry) return null;
    return decrypt(entry.encryptedPassphrase, entry.iv, entry.authTag);
  }

  has(walletId: string): boolean {
    return this.entries.has(walletId);
  }

  listWalletIds(): string[] {
    return Array.from(this.entries.keys());
  }

  listWalletEntries(): Array<{ walletId: string; coin: string; label: string }> {
    return Array.from(this.entries.entries()).map(([walletId, entry]) => ({
      walletId,
      coin: entry.coin,
      label: entry.label,
    }));
  }

  private persist(): void {
    try {
      const data = Object.fromEntries(this.entries);
      fs.writeFileSync(VAULT_FILE, JSON.stringify(data, null, 2));
    } catch (err) {
      console.error('Failed to persist vault:', err);
    }
  }

  private load(): void {
    try {
      if (fs.existsSync(VAULT_FILE)) {
        const data = JSON.parse(fs.readFileSync(VAULT_FILE, 'utf8'));
        for (const [key, value] of Object.entries(data)) {
          this.entries.set(key, value as VaultEntry);
        }
        console.log(`Vault loaded: ${this.entries.size} wallet(s)`);
      }
    } catch (err) {
      console.error('Failed to load vault:', err);
    }
  }
}
