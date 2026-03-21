import { useState, useEffect } from 'react';
import {
  Wallet,
  RefreshCw,
  Copy,
  Check,
  ArrowDownLeft,
  Bot,
  Lock,
  Shield,
  Plus,
  Trash2,
  ToggleLeft,
  ToggleRight,
  ChevronDown,
  ChevronRight,
  Zap,
  Timer,
  List,
  Ban,
} from 'lucide-react';
import { useStore, WalletSummary, PolicyRule } from '../store/index';

const RULE_TYPE_CONFIG: Record<string, { label: string; icon: React.ReactNode; color: string }> = {
  tx_limit: { label: 'Transaction Limit', icon: <Zap className="w-3 h-3" />, color: 'text-yellow-400' },
  velocity_limit: { label: 'Velocity Limit', icon: <Timer className="w-3 h-3" />, color: 'text-blue-400' },
  address_whitelist: { label: 'Address Whitelist', icon: <List className="w-3 h-3" />, color: 'text-green-400' },
  address_blacklist: { label: 'Address Blacklist', icon: <Ban className="w-3 h-3" />, color: 'text-red-400' },
};

export function WalletDashboard() {
  const { wallets, agenticWalletIds, recentTransactions } = useStore();
  const [copiedId, setCopiedId] = useState<string | null>(null);
  const [expandedWalletId, setExpandedWalletId] = useState<string | null>(null);

  const copyToClipboard = (text: string, id: string) => {
    navigator.clipboard.writeText(text);
    setCopiedId(id);
    setTimeout(() => setCopiedId(null), 2000);
  };

  // Build a map of walletId → most recent transaction timestamp
  const walletLastActivity = new Map<string, number>();
  for (const tx of recentTransactions) {
    const existing = walletLastActivity.get(tx.walletId) || 0;
    if (tx.timestamp > existing) {
      walletLastActivity.set(tx.walletId, tx.timestamp);
    }
  }

  // Sort wallets by most recent activity, fallback to creation date
  const sortByActivity = (a: WalletSummary, b: WalletSummary) => {
    const aTime = walletLastActivity.get(a.id) || (a.startDate ? new Date(a.startDate).getTime() : 0);
    const bTime = walletLastActivity.get(b.id) || (b.startDate ? new Date(b.startDate).getTime() : 0);
    return bTime - aTime;
  };

  const agenticWallets = wallets.filter((w) => agenticWalletIds.includes(w.id)).sort(sortByActivity);
  const otherWallets = wallets.filter((w) => !agenticWalletIds.includes(w.id)).sort(sortByActivity);

  return (
    <div className="flex flex-col h-full bg-bitgo-dark">
      {/* Header */}
      <div className="flex items-center gap-2 px-4 py-3 border-b border-bitgo-border bg-bitgo-dark-2">
        <div className="w-6 h-6 rounded-md bg-green-500/10 flex items-center justify-center">
          <Wallet className="w-3.5 h-3.5 text-green-400" />
        </div>
        <h2 className="font-semibold text-sm text-white">Wallets</h2>
        {wallets.length > 0 && (
          <span className="text-[10px] text-gray-500 bg-bitgo-card px-1.5 py-0.5 rounded-md">
            {wallets.length}
          </span>
        )}
        <span className="ml-auto text-gray-600 p-1">
          <RefreshCw className="w-3.5 h-3.5" />
        </span>
      </div>

      {/* Content */}
      <div className="flex-1 overflow-y-auto">
        {wallets.length === 0 ? (
          <div className="flex flex-col items-center justify-center h-full text-center px-6">
            <div className="w-12 h-12 rounded-xl bg-bitgo-card border border-bitgo-border flex items-center justify-center mb-4">
              <RefreshCw className="w-6 h-6 text-gray-600 animate-spin" />
            </div>
            <p className="text-sm text-gray-500 font-medium mb-1">Loading wallets...</p>
            <p className="text-xs text-gray-600">Fetching from BitGo</p>
          </div>
        ) : (
          <div className="p-2 space-y-3">
            {/* Agentic Wallets Section */}
            <div>
              <div className="flex items-center gap-2 px-2 py-1.5 mb-1">
                <Bot className="w-3.5 h-3.5 text-green-400" />
                <span className="text-[11px] font-semibold text-green-400 uppercase tracking-wider">
                  Agentic Wallets
                </span>
                <span className="text-[10px] text-gray-500 bg-bitgo-card px-1.5 py-0.5 rounded-md">
                  {agenticWallets.length}
                </span>
              </div>
              {agenticWallets.length === 0 ? (
                <div className="bg-bitgo-card border border-bitgo-border border-dashed rounded-xl px-4 py-3 mx-1">
                  <p className="text-xs text-gray-500 text-center">
                    No agent wallets yet. Ask the agent to create one.
                  </p>
                </div>
              ) : (
                <div className="space-y-1.5">
                  {agenticWallets.map((wallet) => (
                    <AgenticWalletCard
                      key={wallet.id}
                      wallet={wallet}
                      copiedId={copiedId}
                      onCopy={copyToClipboard}
                      expanded={expandedWalletId === wallet.id}
                      onToggleExpand={() =>
                        setExpandedWalletId(expandedWalletId === wallet.id ? null : wallet.id)
                      }
                    />
                  ))}
                </div>
              )}
            </div>

            {/* Other Wallets Section */}
            {otherWallets.length > 0 && (
              <div>
                <div className="flex items-center gap-2 px-2 py-1.5 mb-1">
                  <Lock className="w-3.5 h-3.5 text-gray-500" />
                  <span className="text-[11px] font-semibold text-gray-500 uppercase tracking-wider">
                    Other Wallets
                  </span>
                  <span className="text-[10px] text-gray-500 bg-bitgo-card px-1.5 py-0.5 rounded-md">
                    {otherWallets.length}
                  </span>
                </div>
                <div className="space-y-1.5">
                  {otherWallets.map((wallet) => (
                    <WalletCard
                      key={wallet.id}
                      wallet={wallet}
                      copiedId={copiedId}
                      onCopy={copyToClipboard}
                    />
                  ))}
                </div>
              </div>
            )}
          </div>
        )}
      </div>
    </div>
  );
}

function AgenticWalletCard({
  wallet,
  copiedId,
  onCopy,
  expanded,
  onToggleExpand,
}: {
  wallet: WalletSummary;
  copiedId: string | null;
  onCopy: (text: string, id: string) => void;
  expanded: boolean;
  onToggleExpand: () => void;
}) {
  return (
    <div className="animate-fade-in">
      <div
        onClick={onToggleExpand}
        className={`bg-bitgo-card hover:bg-bitgo-card-hover border rounded-xl p-3 transition-all cursor-pointer group ${
          expanded
            ? 'border-green-500/40 rounded-b-none'
            : 'border-green-500/20 hover:border-green-500/40'
        }`}
      >
        {/* Top: label + coin badge + expand indicator */}
        <div className="flex items-center justify-between mb-2">
          <div className="flex items-center gap-2 min-w-0">
            <span className="font-medium text-sm text-white truncate">{wallet.label}</span>
            <span className="flex items-center gap-1 text-[9px] font-semibold text-green-400 bg-green-500/10 px-1.5 py-0.5 rounded-md flex-shrink-0">
              <Bot className="w-2.5 h-2.5" />
              Agent
            </span>
          </div>
          <div className="flex items-center gap-1.5">
            <span className="text-[10px] font-bold text-bitgo-blue bg-bitgo-blue/10 px-2 py-0.5 rounded-md uppercase tracking-wider">
              {wallet.coin}
            </span>
            {expanded ? (
              <ChevronDown className="w-3.5 h-3.5 text-green-400" />
            ) : (
              <ChevronRight className="w-3.5 h-3.5 text-gray-500 group-hover:text-green-400 transition-colors" />
            )}
          </div>
        </div>

        {/* Balance */}
        <div className="bg-bitgo-dark rounded-lg p-2.5 mb-2">
          <div className="text-[10px] text-gray-500 mb-0.5">Balance</div>
          <div className="flex items-baseline gap-2">
            <span className="text-lg font-semibold font-mono tracking-tight text-green-400">
              {wallet.balance}
            </span>
            <span className="text-[10px] text-gray-500 uppercase">{wallet.coin}</span>
          </div>
          {wallet.spendableBalance !== wallet.balance && (
            <div className="text-[10px] text-gray-500 mt-0.5">
              Spendable: <span className="font-mono text-gray-400">{wallet.spendableBalance}</span>
            </div>
          )}
        </div>

        {/* Receive address */}
        {wallet.receiveAddress && (
          <div
            className="flex items-center gap-1.5 bg-bitgo-dark rounded-lg px-2.5 py-2 mb-2"
            onClick={(e) => e.stopPropagation()}
          >
            <ArrowDownLeft className="w-3 h-3 text-gray-600 flex-shrink-0" />
            <span className="text-[10px] font-mono text-gray-500 truncate flex-1">
              {wallet.receiveAddress}
            </span>
            <button
              onClick={(e) => {
                e.stopPropagation();
                onCopy(wallet.receiveAddress, wallet.id);
              }}
              className="text-gray-600 hover:text-gray-300 flex-shrink-0 p-0.5 rounded hover:bg-bitgo-card transition-colors"
            >
              {copiedId === wallet.id ? (
                <Check className="w-3 h-3 text-green-400" />
              ) : (
                <Copy className="w-3 h-3" />
              )}
            </button>
          </div>
        )}

        {/* Wallet ID */}
        <div className="flex items-center gap-1.5" onClick={(e) => e.stopPropagation()}>
          <span className="text-[9px] font-mono text-gray-600 truncate flex-1">{wallet.id}</span>
          <button
            onClick={(e) => {
              e.stopPropagation();
              onCopy(wallet.id, `id-${wallet.id}`);
            }}
            className="text-gray-600 hover:text-gray-400 flex-shrink-0 opacity-0 group-hover:opacity-100 transition-opacity"
          >
            {copiedId === `id-${wallet.id}` ? (
              <Check className="w-2.5 h-2.5 text-green-400" />
            ) : (
              <Copy className="w-2.5 h-2.5" />
            )}
          </button>
        </div>
      </div>

      {/* Expanded: Policy Panel */}
      {expanded && <WalletPolicyPanel walletId={wallet.id} />}
    </div>
  );
}

function WalletCard({
  wallet,
  copiedId,
  onCopy,
}: {
  wallet: WalletSummary;
  copiedId: string | null;
  onCopy: (text: string, id: string) => void;
}) {
  return (
    <div className="bg-bitgo-card hover:bg-bitgo-card-hover border border-bitgo-border hover:border-bitgo-border-light opacity-75 rounded-xl p-3 transition-all animate-fade-in group">
      <div className="flex items-center justify-between mb-2">
        <div className="flex items-center gap-2 min-w-0">
          <span className="font-medium text-sm text-white truncate">{wallet.label}</span>
          <span className="flex items-center gap-1 text-[9px] font-semibold text-gray-500 bg-gray-500/10 px-1.5 py-0.5 rounded-md flex-shrink-0">
            <Lock className="w-2.5 h-2.5" />
            Read-only
          </span>
        </div>
        <span className="text-[10px] font-bold text-bitgo-blue bg-bitgo-blue/10 px-2 py-0.5 rounded-md uppercase tracking-wider">
          {wallet.coin}
        </span>
      </div>

      <div className="bg-bitgo-dark rounded-lg p-2.5 mb-2">
        <div className="text-[10px] text-gray-500 mb-0.5">Balance</div>
        <div className="flex items-baseline gap-2">
          <span className="text-lg font-semibold font-mono tracking-tight text-gray-400">
            {wallet.balance}
          </span>
          <span className="text-[10px] text-gray-500 uppercase">{wallet.coin}</span>
        </div>
        {wallet.spendableBalance !== wallet.balance && (
          <div className="text-[10px] text-gray-500 mt-0.5">
            Spendable: <span className="font-mono text-gray-400">{wallet.spendableBalance}</span>
          </div>
        )}
      </div>

      {wallet.receiveAddress && (
        <div className="flex items-center gap-1.5 bg-bitgo-dark rounded-lg px-2.5 py-2 mb-2">
          <ArrowDownLeft className="w-3 h-3 text-gray-600 flex-shrink-0" />
          <span className="text-[10px] font-mono text-gray-500 truncate flex-1">
            {wallet.receiveAddress}
          </span>
          <button
            onClick={() => onCopy(wallet.receiveAddress, wallet.id)}
            className="text-gray-600 hover:text-gray-300 flex-shrink-0 p-0.5 rounded hover:bg-bitgo-card transition-colors"
          >
            {copiedId === wallet.id ? (
              <Check className="w-3 h-3 text-green-400" />
            ) : (
              <Copy className="w-3 h-3" />
            )}
          </button>
        </div>
      )}

      <div className="flex items-center gap-1.5">
        <span className="text-[9px] font-mono text-gray-600 truncate flex-1">{wallet.id}</span>
        <button
          onClick={() => onCopy(wallet.id, `id-${wallet.id}`)}
          className="text-gray-600 hover:text-gray-400 flex-shrink-0 opacity-0 group-hover:opacity-100 transition-opacity"
        >
          {copiedId === `id-${wallet.id}` ? (
            <Check className="w-2.5 h-2.5 text-green-400" />
          ) : (
            <Copy className="w-2.5 h-2.5" />
          )}
        </button>
      </div>
    </div>
  );
}

// ── Wallet-specific Policy Panel ──

function WalletPolicyPanel({ walletId }: { walletId: string }) {
  const [rules, setRules] = useState<PolicyRule[]>([]);
  const [showAdd, setShowAdd] = useState(false);
  const [loading, setLoading] = useState(true);

  const fetchPolicies = async () => {
    try {
      const res = await fetch(`/api/policies?walletId=${walletId}`);
      const data = await res.json();
      setRules(data.rules || []);
    } catch {
      // silent
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchPolicies();
  }, [walletId]);

  const toggleRule = async (ruleId: string, enabled: boolean) => {
    await fetch(`/api/policies/${ruleId}/toggle`, {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ enabled }),
    });
    fetchPolicies();
  };

  const deleteRule = async (ruleId: string) => {
    await fetch(`/api/policies/${ruleId}`, { method: 'DELETE' });
    fetchPolicies();
  };

  const addRule = async (rule: PolicyRule) => {
    await fetch('/api/policies', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ ...rule, walletId }),
    });
    fetchPolicies();
    setShowAdd(false);
  };

  const globalRules = rules.filter((r) => r.walletId === '*');
  const walletRules = rules.filter((r) => r.walletId === walletId);

  return (
    <div className="bg-bitgo-card border border-green-500/40 border-t-0 rounded-b-xl overflow-hidden animate-fade-in">
      {/* Policy header */}
      <div className="flex items-center gap-2 px-3 py-2 bg-bitgo-dark-2 border-t border-bitgo-border">
        <Shield className="w-3.5 h-3.5 text-yellow-400" />
        <span className="text-[11px] font-semibold text-yellow-400">Guard Policies</span>
        {rules.length > 0 && (
          <span className="text-[10px] text-gray-500 bg-bitgo-card px-1.5 py-0.5 rounded-md">
            {rules.filter((r) => r.enabled).length}/{rules.length} active
          </span>
        )}
        <button
          onClick={() => setShowAdd(!showAdd)}
          className={`ml-auto p-1 rounded-md transition-all ${
            showAdd
              ? 'bg-bitgo-blue text-white rotate-45'
              : 'text-gray-500 hover:text-gray-300 hover:bg-bitgo-card'
          }`}
        >
          <Plus className="w-3 h-3" />
        </button>
      </div>

      <div className="px-2 py-2 space-y-1.5 max-h-[320px] overflow-y-auto">
        {showAdd && (
          <AddRuleForm onAdd={addRule} onCancel={() => setShowAdd(false)} walletId={walletId} />
        )}

        {loading ? (
          <div className="flex items-center justify-center py-4">
            <RefreshCw className="w-4 h-4 text-gray-600 animate-spin" />
          </div>
        ) : rules.length === 0 ? (
          <div className="text-center py-3">
            <p className="text-[11px] text-gray-500">No policies yet</p>
            <p className="text-[10px] text-gray-600">Click + to add a guard policy</p>
          </div>
        ) : (
          <>
            {/* Wallet-specific rules */}
            {walletRules.length > 0 && (
              <div>
                <div className="text-[9px] text-gray-600 uppercase tracking-wider px-1 py-1 font-semibold">
                  Wallet Rules
                </div>
                {walletRules.map((rule) => (
                  <PolicyRuleCard
                    key={rule.id}
                    rule={rule}
                    onToggle={toggleRule}
                    onDelete={deleteRule}
                  />
                ))}
              </div>
            )}

            {/* Global rules */}
            {globalRules.length > 0 && (
              <div>
                <div className="text-[9px] text-gray-600 uppercase tracking-wider px-1 py-1 font-semibold">
                  Global Rules
                </div>
                {globalRules.map((rule) => (
                  <PolicyRuleCard
                    key={rule.id}
                    rule={rule}
                    onToggle={toggleRule}
                    onDelete={deleteRule}
                  />
                ))}
              </div>
            )}
          </>
        )}
      </div>
    </div>
  );
}

function PolicyRuleCard({
  rule,
  onToggle,
  onDelete,
}: {
  rule: PolicyRule;
  onToggle: (id: string, enabled: boolean) => void;
  onDelete: (id: string) => void;
}) {
  const cfg = RULE_TYPE_CONFIG[rule.type] || {
    label: rule.type,
    icon: <Shield className="w-3 h-3" />,
    color: 'text-gray-400',
  };

  return (
    <div
      className={`bg-bitgo-dark border rounded-lg p-2.5 transition-all group mb-1 ${
        rule.enabled ? 'border-bitgo-border' : 'border-bitgo-border/50 opacity-50'
      }`}
    >
      <div className="flex items-center gap-2">
        <span className={cfg.color}>{cfg.icon}</span>
        <span className="font-medium text-[11px] text-gray-200 flex-1">{cfg.label}</span>
        {rule.walletId === '*' && (
          <span className="text-[8px] text-gray-500 bg-bitgo-card px-1 py-0.5 rounded">GLOBAL</span>
        )}
        <button
          onClick={() => onToggle(rule.id, !rule.enabled)}
          className={`transition-colors ${rule.enabled ? 'text-green-400' : 'text-gray-600'}`}
        >
          {rule.enabled ? <ToggleRight className="w-4 h-4" /> : <ToggleLeft className="w-4 h-4" />}
        </button>
        <button
          onClick={() => onDelete(rule.id)}
          className="text-gray-600 hover:text-red-400 transition-colors opacity-0 group-hover:opacity-100"
        >
          <Trash2 className="w-3 h-3" />
        </button>
      </div>
      <div className="text-[9px] text-gray-500 font-mono bg-bitgo-card rounded px-2 py-1 mt-1.5 leading-relaxed">
        {formatParams(rule.type, rule.params)}
      </div>
    </div>
  );
}

function formatWindowSeconds(seconds: number): string {
  if (seconds === 3600) return '1h';
  if (seconds === 86400) return '24h';
  if (seconds === 604800) return '7d';
  return `${seconds}s`;
}

function formatParams(type: string, params: Record<string, any>): React.ReactNode {
  switch (type) {
    case 'tx_limit':
      return `Escalate above: $${params.softLimitUsd} | Block above: $${params.hardLimitUsd}`;
    case 'velocity_limit':
      return `Max: $${params.maxTotalUsd} / ${formatWindowSeconds(params.windowSeconds)}`;
    case 'address_whitelist':
    case 'address_blacklist': {
      const addrs: string[] = params.addresses || [];
      if (addrs.length === 0) return 'No addresses configured';
      return (
        <span className="flex flex-col gap-0.5">
          {addrs.map((addr, i) => (
            <span key={i} className="break-all">
              {addr}
            </span>
          ))}
        </span>
      );
    }
    default:
      return JSON.stringify(params);
  }
}

function AddRuleForm({
  onAdd,
  onCancel,
  walletId,
}: {
  onAdd: (rule: PolicyRule) => void;
  onCancel: () => void;
  walletId: string;
}) {
  const [type, setType] = useState<PolicyRule['type']>('tx_limit');

  // tx_limit fields (USD)
  const [softLimitUsd, setSoftLimitUsd] = useState('500');
  const [hardLimitUsd, setHardLimitUsd] = useState('1000');

  // velocity_limit fields (USD)
  const [maxTotalUsd, setMaxTotalUsd] = useState('5000');
  const [windowSeconds, setWindowSeconds] = useState('3600');

  // address list fields
  const [addresses, setAddresses] = useState('');

  const inputClass =
    'w-full bg-bitgo-card border border-bitgo-border rounded-md px-2.5 py-1.5 text-[11px] text-gray-200 placeholder-gray-600 focus:outline-none focus:border-bitgo-blue';

  const labelClass = 'text-[10px] text-gray-400 mb-0.5 block';

  const buildParams = (): Record<string, any> => {
    switch (type) {
      case 'tx_limit':
        return { softLimitUsd, hardLimitUsd };
      case 'velocity_limit':
        return { maxTotalUsd, windowSeconds: Number(windowSeconds) };
      case 'address_whitelist':
      case 'address_blacklist':
        return {
          addresses: addresses
            .split('\n')
            .map((a) => a.trim())
            .filter(Boolean),
        };
    }
  };

  const handleAdd = () => {
    const generatedId = `${type}-${walletId.slice(0, 8)}-${Date.now()}`;
    onAdd({
      id: generatedId,
      walletId: '', // Will be set by the parent
      type,
      enabled: true,
      params: buildParams(),
    });
  };

  return (
    <div className="bg-bitgo-dark border border-bitgo-blue/20 rounded-lg p-2.5 space-y-2 animate-fade-in mb-1.5">
      <div className="text-[11px] font-semibold text-white">New Policy Rule</div>
      <select
        value={type}
        onChange={(e) => setType(e.target.value as PolicyRule['type'])}
        className={inputClass}
      >
        <option value="tx_limit">Transaction Limit</option>
        <option value="velocity_limit">Velocity Limit</option>
        <option value="address_whitelist">Address Whitelist</option>
        <option value="address_blacklist">Address Blacklist</option>
      </select>

      {type === 'tx_limit' && (
        <div className="space-y-1.5">
          <div>
            <label className={labelClass}>Escalation Threshold (USD)</label>
            <input
              type="number"
              value={softLimitUsd}
              onChange={(e) => setSoftLimitUsd(e.target.value)}
              placeholder="$500"
              className={inputClass}
            />
            <p className="text-[9px] text-gray-500 mt-0.5">Amounts above this require human approval</p>
          </div>
          <div>
            <label className={labelClass}>Maximum Limit (USD)</label>
            <input
              type="number"
              value={hardLimitUsd}
              onChange={(e) => setHardLimitUsd(e.target.value)}
              placeholder="$1000"
              className={inputClass}
            />
            <p className="text-[9px] text-gray-500 mt-0.5">Amounts above this are blocked entirely</p>
          </div>
        </div>
      )}

      {type === 'velocity_limit' && (
        <div className="space-y-1.5">
          <div>
            <label className={labelClass}>Max Total (USD)</label>
            <input
              type="number"
              value={maxTotalUsd}
              onChange={(e) => setMaxTotalUsd(e.target.value)}
              placeholder="$5000"
              className={inputClass}
            />
          </div>
          <div>
            <label className={labelClass}>Time Window</label>
            <select
              value={windowSeconds}
              onChange={(e) => setWindowSeconds(e.target.value)}
              className={inputClass}
            >
              <option value="3600">1 hour</option>
              <option value="86400">24 hours</option>
              <option value="604800">7 days</option>
            </select>
          </div>
        </div>
      )}

      {type === 'address_whitelist' && (
        <div>
          <label className={labelClass}>Allowed Addresses (one per line)</label>
          <textarea
            value={addresses}
            onChange={(e) => setAddresses(e.target.value)}
            rows={3}
            placeholder="Enter addresses, one per line"
            className={`${inputClass} font-mono leading-relaxed`}
          />
          <p className="text-[9px] text-gray-500 mt-0.5">Only these addresses will be allowed</p>
        </div>
      )}

      {type === 'address_blacklist' && (
        <div>
          <label className={labelClass}>Blocked Addresses (one per line)</label>
          <textarea
            value={addresses}
            onChange={(e) => setAddresses(e.target.value)}
            rows={3}
            placeholder="Enter addresses, one per line"
            className={`${inputClass} font-mono leading-relaxed`}
          />
          <p className="text-[9px] text-gray-500 mt-0.5">These addresses will be blocked</p>
        </div>
      )}

      <div className="flex gap-2">
        <button
          onClick={handleAdd}
          className="bg-bitgo-blue hover:bg-blue-500 text-white rounded-md px-3 py-1.5 text-[11px] font-medium transition-colors"
        >
          Add Rule
        </button>
        <button
          onClick={onCancel}
          className="text-gray-500 hover:text-gray-300 text-[11px] px-2 py-1.5 rounded-md hover:bg-bitgo-card transition-colors"
        >
          Cancel
        </button>
      </div>
    </div>
  );
}
