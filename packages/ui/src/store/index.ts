import { create } from 'zustand';

export interface ChatMessage {
  id: string;
  role: 'user' | 'agent';
  content: string;
  timestamp: number;
  toolCall?: {
    tool: string;
    input: Record<string, any>;
    guardResult?: any;
    result?: any;
  };
}

export interface AuditEntry {
  id: string;
  timestamp: number;
  sessionId: string;
  tool: string;
  input: Record<string, unknown>;
  guardResult: any;
  executionResult?: unknown;
  status: 'allowed' | 'blocked' | 'escalated' | 'executed' | 'failed';
  durationMs: number;
}

export interface PolicyRule {
  id: string;
  walletId: string;  // Which wallet this applies to ('*' = all)
  type: 'tx_limit' | 'velocity_limit' | 'address_whitelist' | 'address_blacklist';
  enabled: boolean;
  params: Record<string, any>;
}

export interface PendingApproval {
  id: string;
  toolName: string;
  toolInput: Record<string, unknown>;
  guardResult: any;
  status: 'pending' | 'approved' | 'rejected' | 'completed' | 'failed';
  createdAt: number;
}

export interface WalletSummary {
  id: string;
  label: string;
  coin: string;
  balance: string;
  confirmedBalance: string;
  spendableBalance: string;
  receiveAddress: string;
  startDate?: string;  // wallet creation date from BitGo
}

export interface RecentTransaction {
  id: string;           // transfer ID from BitGo
  txid: string;         // blockchain tx hash
  coin: string;
  walletId: string;
  walletLabel?: string;
  amount: string;
  address: string;      // destination (legacy)
  fromAddress?: string;
  toAddress?: string;
  type?: string;        // 'send' | 'receive'
  state: 'signed' | 'confirmed' | 'failed';  // updated via webhook
  timestamp: number;
}

export interface SessionMeta {
  id: string;
  title: string;
  createdAt: number;
  updatedAt: number;
}

export type Tab = 'wallets' | 'transactions' | 'approvals';

interface AppState {
  // Connection
  connected: boolean;
  sessionId: string | null;
  setConnected: (connected: boolean, sessionId?: string) => void;

  // Active tab (so hooks can auto-switch)
  activeTab: Tab;
  setActiveTab: (tab: Tab) => void;

  // Chat
  messages: ChatMessage[];
  isAgentTyping: boolean;   // typing indicator only — hides when first text arrives
  isAgentRunning: boolean;  // input lock — stays true until agent_done or error
  addMessage: (msg: ChatMessage) => void;
  clearMessages: () => void;
  setAgentTyping: (typing: boolean) => void;
  setAgentRunning: (running: boolean) => void;
  updateLastAgentMessage: (content: string) => void;

  // Audit Trail
  auditEntries: AuditEntry[];
  addAuditEntry: (entry: AuditEntry) => void;

  // Policies
  policyRules: PolicyRule[];
  setPolicyRules: (rules: PolicyRule[]) => void;

  // Approvals
  pendingApprovals: PendingApproval[];
  addPendingApproval: (approval: PendingApproval) => void;
  resolveApproval: (id: string, decision: string) => void;
  completeApproval: (toolName: string) => void;
  failApproval: (toolName: string) => void;

  // Wallets
  wallets: WalletSummary[];
  setWallets: (wallets: WalletSummary[]) => void;

  // Agentic wallet IDs (wallets with passphrases in the vault)
  agenticWalletIds: string[];
  setAgenticWalletIds: (ids: string[]) => void;

  // Sessions
  sessions: SessionMeta[];
  setSessions: (sessions: SessionMeta[]) => void;

  // Recent Transactions
  recentTransactions: RecentTransaction[];
  transfersNextToken: string | null;
  transfersLoading: boolean;
  addRecentTransaction: (tx: RecentTransaction) => void;
  setRecentTransactions: (txs: RecentTransaction[], nextToken: string | null) => void;
  appendRecentTransactions: (txs: RecentTransaction[], nextToken: string | null) => void;
  setTransfersLoading: (loading: boolean) => void;
  updateTransactionState: (transferIdOrTxid: string, state: string, confirmations?: number) => void;
}

export const useStore = create<AppState>((set) => ({
  // Connection
  connected: false,
  sessionId: null,
  setConnected: (connected, sessionId) => set({ connected, sessionId: sessionId || null }),

  // Active tab
  activeTab: 'wallets',
  setActiveTab: (tab) => set({ activeTab: tab }),

  // Chat
  messages: [],
  isAgentTyping: false,
  isAgentRunning: false,
  addMessage: (msg) => set((s) => ({ messages: [...s.messages, msg] })),
  clearMessages: () => set({ messages: [], isAgentTyping: false, isAgentRunning: false }),
  setAgentTyping: (typing) => set({ isAgentTyping: typing }),
  setAgentRunning: (running) => set({ isAgentRunning: running }),
  updateLastAgentMessage: (content) =>
    set((s) => {
      const msgs = [...s.messages];
      const lastAgent = msgs.filter((m) => m.role === 'agent').pop();
      if (lastAgent) {
        lastAgent.content += content;
      }
      return { messages: msgs };
    }),

  // Audit Trail
  auditEntries: [],
  addAuditEntry: (entry) => set((s) => {
    // Deduplicate by id
    if (s.auditEntries.some((e) => e.id === entry.id)) return s;
    return { auditEntries: [entry, ...s.auditEntries] };
  }),

  // Policies
  policyRules: [],
  setPolicyRules: (rules) => set({ policyRules: rules }),

  // Approvals
  pendingApprovals: [],
  addPendingApproval: (approval) =>
    set((s) => ({ pendingApprovals: [...s.pendingApprovals, approval] })),
  resolveApproval: (id, decision) =>
    set((s) => ({
      pendingApprovals: s.pendingApprovals.map((a) =>
        a.id === id ? { ...a, status: decision as any } : a
      ),
    })),
  completeApproval: (toolName) =>
    set((s) => ({
      pendingApprovals: s.pendingApprovals.map((a) =>
        a.toolName === toolName && a.status === 'approved'
          ? { ...a, status: 'completed' as const }
          : a
      ),
    })),
  failApproval: (toolName) =>
    set((s) => ({
      pendingApprovals: s.pendingApprovals.map((a) =>
        a.toolName === toolName && a.status === 'approved'
          ? { ...a, status: 'failed' as const }
          : a
      ),
    })),

  // Wallets
  wallets: [],
  setWallets: (wallets) => set({ wallets }),

  // Agentic wallet IDs
  agenticWalletIds: [],
  setAgenticWalletIds: (ids) => set({ agenticWalletIds: ids }),

  // Sessions
  sessions: [],
  setSessions: (sessions) => set({ sessions }),

  // Recent Transactions
  recentTransactions: [],
  transfersNextToken: null,
  transfersLoading: false,
  addRecentTransaction: (tx) =>
    set((s) => {
      if (s.recentTransactions.some((t) => t.id === tx.id)) {
        return s;
      }
      return { recentTransactions: [tx, ...s.recentTransactions] };
    }),
  setRecentTransactions: (txs, nextToken) => set({ recentTransactions: txs, transfersNextToken: nextToken }),
  appendRecentTransactions: (txs, nextToken) =>
    set((s) => {
      const existing = new Set(s.recentTransactions.map((t) => t.id));
      const newTxs = txs.filter((t) => !existing.has(t.id));
      return {
        recentTransactions: [...s.recentTransactions, ...newTxs],
        transfersNextToken: nextToken,
      };
    }),
  setTransfersLoading: (loading) => set({ transfersLoading: loading }),
  updateTransactionState: (transferIdOrTxid, state) =>
    set((s) => ({
      recentTransactions: s.recentTransactions.map((tx) =>
        tx.id === transferIdOrTxid || tx.txid === transferIdOrTxid
          ? { ...tx, state: state as RecentTransaction['state'] }
          : tx
      ),
    })),
}));
