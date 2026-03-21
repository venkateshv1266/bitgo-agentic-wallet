import { Shield, ShieldCheck, ShieldX, Clock, AlertTriangle, Activity } from 'lucide-react';
import { useStore, AuditEntry } from '../store/index';

const STATUS_CONFIG: Record<string, { color: string; bg: string; icon: React.ReactNode; label: string }> = {
  executed: { color: 'text-green-400', bg: 'bg-green-400/10', icon: <ShieldCheck className="w-3.5 h-3.5" />, label: 'Executed' },
  blocked: { color: 'text-red-400', bg: 'bg-red-400/10', icon: <ShieldX className="w-3.5 h-3.5" />, label: 'Blocked' },
  escalated: { color: 'text-yellow-400', bg: 'bg-yellow-400/10', icon: <Clock className="w-3.5 h-3.5" />, label: 'Escalated' },
  failed: { color: 'text-orange-400', bg: 'bg-orange-400/10', icon: <AlertTriangle className="w-3.5 h-3.5" />, label: 'Failed' },
  allowed: { color: 'text-blue-400', bg: 'bg-blue-400/10', icon: <Shield className="w-3.5 h-3.5" />, label: 'Allowed' },
};

export function AuditTrail() {
  const { auditEntries } = useStore();

  return (
    <div className="flex flex-col h-full bg-bitgo-dark">
      {/* Header */}
      <div className="flex items-center gap-2 px-4 py-3 border-b border-bitgo-border bg-bitgo-dark-2">
        <div className="w-6 h-6 rounded-md bg-purple-500/10 flex items-center justify-center">
          <Activity className="w-3.5 h-3.5 text-purple-400" />
        </div>
        <h2 className="font-semibold text-sm text-white">Audit Trail</h2>
        {auditEntries.length > 0 && (
          <span className="ml-auto text-[10px] text-gray-500 bg-bitgo-card px-1.5 py-0.5 rounded-md">
            {auditEntries.length}
          </span>
        )}
      </div>

      {/* Content */}
      <div className="flex-1 overflow-y-auto">
        {auditEntries.length === 0 ? (
          <div className="flex flex-col items-center justify-center h-full text-center px-6">
            <div className="w-12 h-12 rounded-xl bg-bitgo-card border border-bitgo-border flex items-center justify-center mb-4">
              <Shield className="w-6 h-6 text-gray-600" />
            </div>
            <p className="text-sm text-gray-500 font-medium mb-1">No actions yet</p>
            <p className="text-xs text-gray-600">Actions will appear here in real-time</p>
          </div>
        ) : (
          <div className="p-2 space-y-1">
            {[...auditEntries].sort((a, b) => b.timestamp - a.timestamp).map((entry) => (
              <AuditEntryCard key={entry.id} entry={entry} />
            ))}
          </div>
        )}
      </div>
    </div>
  );
}

function AuditEntryCard({ entry }: { entry: AuditEntry }) {
  const config = STATUS_CONFIG[entry.status] || STATUS_CONFIG.allowed;

  return (
    <details className="bg-bitgo-card border border-bitgo-border rounded-lg overflow-hidden animate-fade-in group">
      <summary className="flex items-center gap-2 px-3 py-2.5 cursor-pointer hover:bg-bitgo-card-hover transition-colors text-xs">
        <span className={`${config.bg} ${config.color} p-1 rounded`}>{config.icon}</span>
        <div className="flex-1 min-w-0">
          <span className="font-mono font-medium text-gray-300 truncate block text-[11px]">
            {entry.tool}
          </span>
          <span className="text-[9px] text-gray-600">
            {new Date(entry.timestamp).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit', second: '2-digit' })}
          </span>
        </div>
        <div className="flex flex-col items-end gap-0.5 flex-shrink-0">
          <span className={`text-[9px] font-medium ${config.color} ${config.bg} px-1.5 py-0.5 rounded`}>
            {config.label}
          </span>
          <span className="text-[9px] text-gray-600 font-mono">{entry.durationMs}ms</span>
        </div>
      </summary>

      <div className="px-3 pb-3 border-t border-bitgo-border/50 pt-2 text-[11px] text-gray-400 space-y-2">
        {entry.guardResult?.reason && (
          <div className="flex gap-2">
            <span className="text-gray-600 flex-shrink-0">Reason:</span>
            <span className={config.color}>{entry.guardResult.reason}</span>
          </div>
        )}

        {entry.guardResult?.layers && (
          <div>
            <span className="text-gray-600 text-[10px]">Guard Layers</span>
            <div className="mt-1 space-y-0.5">
              {entry.guardResult.layers.map((l: any, i: number) => (
                <div key={i} className="flex items-center gap-2 text-[10px]">
                  <span className={`w-4 text-center ${l.passed ? 'text-green-500' : 'text-red-500'}`}>
                    {l.passed ? '✓' : '✕'}
                  </span>
                  <span className="text-gray-400">{l.name}</span>
                </div>
              ))}
            </div>
          </div>
        )}

        <details className="mt-1">
          <summary className="cursor-pointer text-[10px] text-gray-600 hover:text-gray-400 transition-colors">
            Show Input
          </summary>
          <pre className="mt-1 font-mono bg-bitgo-dark rounded-md p-2 overflow-x-auto text-[10px] text-gray-500 leading-relaxed">
            {JSON.stringify(entry.input, null, 2)}
          </pre>
        </details>
      </div>
    </details>
  );
}
