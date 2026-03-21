import { Shield, CheckCircle, XCircle, AlertTriangle, Loader2 } from 'lucide-react';
import { useStore, PendingApproval } from '../store/index';

export function ApprovalsPanel({ onApprovalDecision }: { onApprovalDecision: (approvalId: string, decision: 'approved' | 'rejected') => void }) {
  const { pendingApprovals } = useStore();

  const sorted = [...pendingApprovals].sort((a, b) => b.createdAt - a.createdAt);
  const pendingCount = sorted.filter((a) => a.status === 'pending').length;

  return (
    <div className="flex flex-col h-full bg-bitgo-dark">
      {/* Header */}
      <div className="px-4 py-3 border-b border-bitgo-border bg-bitgo-dark-2">
        <div className="flex items-center gap-2">
          <Shield className="w-4 h-4 text-yellow-400" />
          <h2 className="text-sm font-semibold text-white">Pending Approvals</h2>
          {pendingCount > 0 && (
            <span className="ml-auto bg-yellow-500/20 text-yellow-400 text-[10px] font-bold px-2 py-0.5 rounded-full">
              {pendingCount}
            </span>
          )}
        </div>
      </div>

      {/* Approvals list */}
      <div className="flex-1 overflow-y-auto p-2 space-y-2">
        {sorted.length === 0 ? (
          <div className="flex flex-col items-center justify-center h-full text-center">
            <Shield className="w-8 h-8 text-gray-600 mb-3" />
            <p className="text-sm text-gray-500">No approvals yet</p>
            <p className="text-xs text-gray-600 mt-1">
              Approvals appear here when transactions require human review.
            </p>
          </div>
        ) : (
          sorted.map((approval) => (
            <PanelApprovalCard key={approval.id} approval={approval} onDecision={onApprovalDecision} />
          ))
        )}
      </div>
    </div>
  );
}

function PanelApprovalCard({
  approval,
  onDecision,
}: {
  approval: PendingApproval;
  onDecision: (approvalId: string, decision: 'approved' | 'rejected') => void;
}) {
  const isPending = approval.status === 'pending';
  const isApproved = approval.status === 'approved';
  const isRejected = approval.status === 'rejected';
  const isCompleted = approval.status === 'completed';
  const isFailed = approval.status === 'failed';

  const borderColor = isCompleted
    ? 'border-green-500/30'
    : isApproved
    ? 'border-blue-500/30'
    : (isRejected || isFailed)
    ? 'border-red-500/30'
    : 'border-yellow-500/20';

  const bgColor = isCompleted
    ? 'bg-green-500/5'
    : isApproved
    ? 'bg-blue-500/5'
    : (isRejected || isFailed)
    ? 'bg-red-500/5'
    : 'bg-yellow-500/5';

  return (
    <div className={`${bgColor} border ${borderColor} rounded-xl p-3 animate-fade-in`}>
      {/* Status header */}
      <div className="flex items-center gap-2 mb-2">
        {isPending && <AlertTriangle className="w-3.5 h-3.5 text-yellow-400 flex-shrink-0" />}
        {(isApproved || isCompleted) && <CheckCircle className="w-3.5 h-3.5 text-green-400 flex-shrink-0" />}
        {(isRejected || isFailed) && <XCircle className="w-3.5 h-3.5 text-red-400 flex-shrink-0" />}
        <span className={`text-xs font-semibold truncate ${
          isPending ? 'text-yellow-400' : isCompleted ? 'text-green-400' : isApproved ? 'text-blue-400' : 'text-red-400'
        }`}>
          {isPending ? 'Approval Required' : isCompleted ? 'Transaction Sent' : isApproved ? 'Approved' : isFailed ? 'Execution Failed' : 'Rejected'}
        </span>
        {isCompleted && (
          <span className="flex items-center gap-1 text-[9px] font-medium text-green-400 bg-green-400/10 px-1.5 py-0.5 rounded-full ml-auto flex-shrink-0">
            <CheckCircle className="w-2.5 h-2.5" /> Sent
          </span>
        )}
        {isRejected && (
          <span className="flex items-center gap-1 text-[9px] font-medium text-red-400 bg-red-400/10 px-1.5 py-0.5 rounded-full ml-auto flex-shrink-0">
            <XCircle className="w-2.5 h-2.5" /> Rejected
          </span>
        )}
        {isFailed && (
          <span className="flex items-center gap-1 text-[9px] font-medium text-red-400 bg-red-400/10 px-1.5 py-0.5 rounded-full ml-auto flex-shrink-0">
            <XCircle className="w-2.5 h-2.5" /> Failed
          </span>
        )}
      </div>

      {/* Reason */}
      {approval.guardResult?.reason && (
        <p className="text-[11px] text-gray-400 mb-2 break-words">{approval.guardResult.reason}</p>
      )}

      {/* Tool input */}
      <div className="bg-bitgo-dark rounded-lg p-2 mb-2 overflow-hidden">
        <span className="text-[9px] font-bold text-yellow-400 uppercase tracking-wider">
          {approval.toolName}
        </span>
        <pre className="text-[10px] text-gray-500 font-mono whitespace-pre-wrap break-all mt-1 leading-relaxed">
          {JSON.stringify(approval.toolInput, null, 2)}
        </pre>
      </div>

      {/* Actions */}
      {isPending && (
        <div className="flex gap-2">
          <button
            onClick={() => onDecision(approval.id, 'approved')}
            className="flex items-center gap-1 px-3 py-1.5 bg-green-500/20 hover:bg-green-500/30 border border-green-500/30 text-green-400 rounded-lg text-[11px] font-medium transition-all active:scale-95"
          >
            <CheckCircle className="w-3 h-3" />
            Approve
          </button>
          <button
            onClick={() => onDecision(approval.id, 'rejected')}
            className="flex items-center gap-1 px-3 py-1.5 bg-red-500/20 hover:bg-red-500/30 border border-red-500/30 text-red-400 rounded-lg text-[11px] font-medium transition-all active:scale-95"
          >
            <XCircle className="w-3 h-3" />
            Reject
          </button>
        </div>
      )}

      {isApproved && !isCompleted && !isFailed && (
        <div className="flex items-center gap-2 text-[11px] text-blue-400/80">
          <Loader2 className="w-3 h-3 animate-spin" />
          <span>Approved — Sending transaction...</span>
        </div>
      )}

      {isFailed && (
        <div className="flex items-center gap-2 text-[11px] text-red-400">
          <XCircle className="w-3 h-3" />
          <span>Approved but rejected by BitGo policy</span>
        </div>
      )}

      {isCompleted && (
        <div className="flex items-center gap-2 text-[11px] text-green-400">
          <CheckCircle className="w-3 h-3" />
          <span>Signed — Sent to network</span>
        </div>
      )}
    </div>
  );
}
