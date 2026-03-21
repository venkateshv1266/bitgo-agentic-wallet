import { SessionMeta } from '../store';

function relativeTime(ts: number): string {
  const diffMs = Date.now() - ts;
  const secs = Math.floor(diffMs / 1000);
  if (secs < 60) return 'just now';
  const mins = Math.floor(secs / 60);
  if (mins < 60) return `${mins} min${mins !== 1 ? 's' : ''} ago`;
  const hours = Math.floor(mins / 60);
  if (hours < 24) return `${hours} hr${hours !== 1 ? 's' : ''} ago`;
  const days = Math.floor(hours / 24);
  return `${days} day${days !== 1 ? 's' : ''} ago`;
}

interface Props {
  sessions: SessionMeta[];
  currentConversationId?: string;
  onSelect: (id: string) => void;
  onClose: () => void;
}

export function SessionsDropdown({ sessions, onSelect, onClose }: Props) {
  return (
    <div className="absolute right-0 top-full mt-1 w-72 bg-bitgo-card border border-bitgo-border rounded-xl shadow-2xl z-50 overflow-hidden">
      <div className="px-3 py-2 border-b border-bitgo-border">
        <span className="text-xs font-semibold text-gray-400 uppercase tracking-wider">Recent Sessions</span>
      </div>
      {sessions.length === 0 ? (
        <div className="px-3 py-4 text-center text-xs text-gray-500">No other sessions yet</div>
      ) : (
        <ul className="max-h-72 overflow-y-auto">
          {sessions.map((s) => (
            <li key={s.id}>
              <button
                onClick={() => { onSelect(s.id); onClose(); }}
                className="w-full text-left px-3 py-2.5 hover:bg-bitgo-card-hover transition-colors border-b border-bitgo-border last:border-0"
              >
                <p className="text-xs text-gray-200 truncate">{s.title}</p>
                <p className="text-[10px] text-gray-500 mt-0.5">{relativeTime(s.updatedAt)}</p>
              </button>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}
