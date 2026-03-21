import { useStore, RecentTransaction } from '../store';
import { ArrowUpRight, ArrowDownLeft, Clock, CheckCircle2, XCircle, ChevronDown, Loader2 } from 'lucide-react';

function truncateHash(hash: string): string {
  if (!hash || hash.length <= 16) return hash || '--';
  return `${hash.slice(0, 10)}...${hash.slice(-6)}`;
}

function formatTimestamp(ts: number): string {
  if (!ts) return '--';
  const date = new Date(ts);
  const now = new Date();
  const diffMs = now.getTime() - date.getTime();
  const diffMin = Math.floor(diffMs / 60000);
  if (diffMin < 1) return 'just now';
  if (diffMin < 60) return `${diffMin}m ago`;
  const diffHr = Math.floor(diffMin / 60);
  if (diffHr < 24) return `${diffHr}h ago`;
  return date.toLocaleDateString();
}

function StateBadge({ state }: { state: RecentTransaction['state'] }) {
  switch (state) {
    case 'signed':
      return (
        <span className="inline-flex items-center gap-1 px-1.5 py-0.5 rounded-full text-[9px] font-medium bg-yellow-500/10 text-yellow-400 border border-yellow-500/20 whitespace-nowrap">
          <Clock className="w-2.5 h-2.5 animate-pulse" />
          Pending
        </span>
      );
    case 'confirmed':
      return (
        <span className="inline-flex items-center gap-1 px-1.5 py-0.5 rounded-full text-[9px] font-medium bg-green-500/10 text-green-400 border border-green-500/20 whitespace-nowrap">
          <CheckCircle2 className="w-2.5 h-2.5" />
          Confirmed
        </span>
      );
    case 'failed':
      return (
        <span className="inline-flex items-center gap-1 px-1.5 py-0.5 rounded-full text-[9px] font-medium bg-red-500/10 text-red-400 border border-red-500/20 whitespace-nowrap">
          <XCircle className="w-2.5 h-2.5" />
          Failed
        </span>
      );
    default:
      return null;
  }
}

function TransactionRow({ tx }: { tx: RecentTransaction }) {
  const isSend = tx.type === 'send';
  return (
    <details className="border-b border-bitgo-border group">
      <summary className="flex items-start gap-2 px-3 py-2.5 cursor-pointer hover:bg-bitgo-card-hover transition-colors list-none">
        {/* Icon */}
        <div className={`w-7 h-7 rounded-lg flex items-center justify-center flex-shrink-0 mt-0.5 ${
          isSend ? 'bg-bitgo-blue/10 border border-bitgo-blue/20' : 'bg-green-500/10 border border-green-500/20'
        }`}>
          {isSend
            ? <ArrowUpRight className="w-3.5 h-3.5 text-bitgo-blue" />
            : <ArrowDownLeft className="w-3.5 h-3.5 text-green-400" />
          }
        </div>

        {/* Details */}
        <div className="flex-1 min-w-0 overflow-hidden">
          <div className="flex items-center gap-1.5 flex-wrap">
            <span className="text-[10px] font-bold text-white uppercase">{tx.coin}</span>
            <span className="text-[10px] text-gray-400 font-mono truncate">{tx.amount}</span>
            <StateBadge state={tx.state} />
          </div>
          {tx.walletLabel && (
            <div className="text-[9px] text-gray-500 truncate mt-0.5">
              Wallet: {tx.walletLabel}
            </div>
          )}
          {tx.txid && (
            <div className="text-[9px] text-gray-600 font-mono truncate mt-0.5" title={tx.txid}>
              Tx: {truncateHash(tx.txid)}
            </div>
          )}
        </div>

        {/* Time */}
        <div className="flex-shrink-0 text-right">
          <span className="text-[9px] text-gray-600 whitespace-nowrap">{formatTimestamp(tx.timestamp)}</span>
        </div>
      </summary>

      {/* Expanded details */}
      <div className="mx-3 mb-3 mt-1 rounded-lg bg-bitgo-dark border border-bitgo-border overflow-hidden">
        <table className="w-full text-[10px]">
          <tbody>
            {tx.fromAddress && (
              <tr className="border-b border-bitgo-border/40">
                <td className="px-3 py-2 text-gray-500 whitespace-nowrap align-top w-20">From</td>
                <td className="px-3 py-2 text-gray-300 font-mono break-all">{tx.fromAddress}</td>
              </tr>
            )}
            {tx.toAddress && (
              <tr className="border-b border-bitgo-border/40">
                <td className="px-3 py-2 text-gray-500 whitespace-nowrap align-top w-20">To</td>
                <td className="px-3 py-2 text-gray-300 font-mono break-all">{tx.toAddress}</td>
              </tr>
            )}
            {tx.txid && (
              <tr className="border-b border-bitgo-border/40">
                <td className="px-3 py-2 text-gray-500 whitespace-nowrap align-top w-20">Tx Hash</td>
                <td className="px-3 py-2 text-gray-300 font-mono break-all">{tx.txid}</td>
              </tr>
            )}
            <tr>
              <td className="px-3 py-2 text-gray-500 whitespace-nowrap align-top w-20">Wallet</td>
              <td className="px-3 py-2 text-gray-300 font-mono break-all">{tx.walletId}</td>
            </tr>
          </tbody>
        </table>
      </div>
    </details>
  );
}

export function RecentTransactions() {
  const recentTransactions = useStore((s) => s.recentTransactions);
  const nextToken = useStore((s) => s.transfersNextToken);
  const loading = useStore((s) => s.transfersLoading);
  const appendRecentTransactions = useStore((s) => s.appendRecentTransactions);
  const setTransfersLoading = useStore((s) => s.setTransfersLoading);

  // Sort descending by timestamp
  const sorted = [...recentTransactions].sort((a, b) => b.timestamp - a.timestamp);

  const loadMore = () => {
    if (!nextToken || loading) return;
    setTransfersLoading(true);
    const params = new URLSearchParams({ limit: '20' });
    try {
      const tokens = JSON.parse(nextToken);
      // Use the first wallet's prevId as a simple pagination token
      const firstPrevId = Object.values(tokens)[0] as string;
      if (firstPrevId) params.set('prevId', firstPrevId);
    } catch {
      // ignore
    }
    fetch(`/api/transfers?${params.toString()}`)
      .then((res) => res.json())
      .then((data) => {
        if (data.transfers && Array.isArray(data.transfers)) {
          const txs = data.transfers.map((t: any) => ({
            id: t.id,
            txid: t.txid || '',
            coin: t.coin || '',
            walletId: t.walletId || '',
            walletLabel: t.walletLabel || '',
            amount: t.value || '0',
            address: t.toAddress || t.fromAddress || '',
            fromAddress: t.fromAddress || '',
            toAddress: t.toAddress || '',
            type: t.type || 'send',
            state: t.state === 'confirmed' ? 'confirmed' : t.state === 'failed' ? 'failed' : 'signed',
            timestamp: new Date(t.date || 0).getTime(),
          }));
          appendRecentTransactions(txs, data.nextBatchToken || null);
        }
      })
      .catch((err) => console.warn('Failed to load more transfers:', err))
      .finally(() => setTransfersLoading(false));
  };

  return (
    <div className="h-full flex flex-col bg-bitgo-dark">
      {/* Header */}
      <div className="px-4 py-3 border-b border-bitgo-border bg-bitgo-dark-2">
        <div className="flex items-center gap-2">
          <ArrowUpRight className="w-4 h-4 text-bitgo-blue" />
          <h2 className="text-sm font-bold text-white">Recent Transactions</h2>
          {sorted.length > 0 && (
            <span className="ml-auto text-[10px] text-gray-500 bg-bitgo-card px-2 py-0.5 rounded-full">
              {sorted.length}
            </span>
          )}
        </div>
      </div>

      {/* List */}
      <div className="flex-1 overflow-y-auto">
        {loading && sorted.length === 0 ? (
          <div className="flex flex-col items-center justify-center h-full text-gray-600 gap-2">
            <Loader2 className="w-6 h-6 animate-spin text-gray-500" />
            <p className="text-xs">Loading transactions...</p>
          </div>
        ) : sorted.length === 0 ? (
          <div className="flex flex-col items-center justify-center h-full text-gray-600 gap-2">
            <ArrowUpRight className="w-8 h-8 text-gray-700" />
            <p className="text-xs">No transactions yet</p>
          </div>
        ) : (
          <>
            {sorted.map((tx) => <TransactionRow key={tx.id} tx={tx} />)}
            {nextToken && (
              <button
                onClick={loadMore}
                disabled={loading}
                className="w-full flex items-center justify-center gap-1.5 py-3 text-xs text-gray-400 hover:text-white hover:bg-bitgo-card-hover transition-colors border-t border-bitgo-border disabled:opacity-50"
              >
                {loading ? (
                  <Loader2 className="w-3.5 h-3.5 animate-spin" />
                ) : (
                  <ChevronDown className="w-3.5 h-3.5" />
                )}
                {loading ? 'Loading...' : 'Load More'}
              </button>
            )}
          </>
        )}
      </div>
    </div>
  );
}
