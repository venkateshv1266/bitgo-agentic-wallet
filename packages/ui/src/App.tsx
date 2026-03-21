import { useState, useRef, useEffect } from 'react';
import { ChatPanel } from './components/ChatPanel';
import { AuditTrail } from './components/AuditTrail';
import { WalletDashboard } from './components/WalletDashboard';
import { RecentTransactions } from './components/RecentTransactions';
import { ApprovalsPanel } from './components/ApprovalsPanel';
import { SessionsDropdown } from './components/SessionsDropdown';
import { useWebSocket } from './hooks/useWebSocket';
import { useStore, Tab } from './store';
import { Bot, Wallet, ScrollText, ArrowUpRight, AlertTriangle, Shield, SquarePen, History } from 'lucide-react';

export default function App() {
  const { sendMessage, stopAgent, sendApprovalDecision, startNewSession, listSessions, loadSession } = useWebSocket();
  const activeTab = useStore((s) => s.activeTab);
  const setActiveTab = useStore((s) => s.setActiveTab);
  const sessions = useStore((s) => s.sessions);
  const [showAudit, setShowAudit] = useState(true);
  const [showSessions, setShowSessions] = useState(false);
  const sessionsButtonRef = useRef<HTMLDivElement>(null);
  const pendingCount = useStore((s) => s.pendingApprovals.filter((a) => a.status === 'pending').length);

  // Close sessions dropdown when clicking outside
  useEffect(() => {
    if (!showSessions) return;
    const handler = (e: MouseEvent) => {
      if (sessionsButtonRef.current && !sessionsButtonRef.current.contains(e.target as Node)) {
        setShowSessions(false);
      }
    };
    document.addEventListener('mousedown', handler);
    return () => document.removeEventListener('mousedown', handler);
  }, [showSessions]);

  return (
    <div className="h-screen flex flex-col bg-bitgo-dark overflow-hidden">
      {/* Top Bar */}
      <header className="flex items-center gap-3 px-5 py-3 border-b border-bitgo-border bg-bitgo-dark-2">
        <div className="flex items-center gap-3">
          <div className="w-9 h-9 bg-gradient-to-br from-bitgo-blue to-blue-400 rounded-xl flex items-center justify-center shadow-lg shadow-bitgo-blue/20">
            <Bot className="w-5 h-5 text-white" />
          </div>
          <div>
            <h1 className="text-sm font-bold text-white tracking-tight">Agentic Wallet</h1>
            <p className="text-[10px] text-gray-500 font-medium">BitGo AI-Powered Wallet Management</p>
          </div>
        </div>

        {/* Center nav */}
        <nav className="hidden sm:flex items-center gap-1 ml-8 bg-bitgo-card rounded-lg p-1">
          <TabButton
            active={activeTab === 'wallets'}
            onClick={() => setActiveTab('wallets')}
            icon={<Wallet className="w-3.5 h-3.5" />}
            label="Wallets"
          />
          <TabButton
            active={activeTab === 'transactions'}
            onClick={() => setActiveTab('transactions')}
            icon={<ArrowUpRight className="w-3.5 h-3.5" />}
            label="Transactions"
          />
          <TabButton
            active={activeTab === 'approvals'}
            onClick={() => setActiveTab('approvals')}
            icon={<AlertTriangle className="w-3.5 h-3.5" />}
            label="Approvals"
            badge={pendingCount > 0 ? pendingCount : undefined}
          />
        </nav>

        <div className="ml-auto flex items-center gap-3">
          <button
            onClick={startNewSession}
            className="flex items-center gap-1.5 text-xs px-3 py-1.5 rounded-lg text-gray-400 hover:text-gray-200 border border-bitgo-border hover:border-bitgo-border-light hover:bg-bitgo-card transition-all"
            title="Start a new conversation"
          >
            <SquarePen className="w-3.5 h-3.5" />
            <span className="hidden sm:inline">New Chat</span>
          </button>
          <div ref={sessionsButtonRef} className="relative">
            <button
              onClick={() => {
                listSessions();
                setShowSessions((v) => !v);
              }}
              className={`flex items-center gap-1.5 text-xs px-3 py-1.5 rounded-lg transition-all ${
                showSessions
                  ? 'bg-bitgo-blue/10 text-bitgo-blue border border-bitgo-blue/30'
                  : 'text-gray-400 hover:text-gray-200 border border-bitgo-border hover:border-bitgo-border-light hover:bg-bitgo-card'
              }`}
              title="Browse recent sessions"
            >
              <History className="w-3.5 h-3.5" />
              <span className="hidden sm:inline">History</span>
            </button>
            {showSessions && (
              <SessionsDropdown
                sessions={sessions}
                onSelect={loadSession}
                onClose={() => setShowSessions(false)}
              />
            )}
          </div>
          <button
            onClick={() => setShowAudit(!showAudit)}
            className={`flex items-center gap-1.5 text-xs px-3 py-1.5 rounded-lg transition-all ${
              showAudit
                ? 'bg-purple-500/10 text-purple-400 border border-purple-500/20'
                : 'text-gray-500 hover:text-gray-400 border border-transparent'
            }`}
          >
            <ScrollText className="w-3.5 h-3.5" />
            <span className="hidden sm:inline">Audit</span>
          </button>
          <div className="flex items-center gap-2 text-xs text-gray-500 bg-bitgo-card px-3 py-1.5 rounded-lg border border-bitgo-border">
            <div className="w-2 h-2 rounded-full bg-green-500 animate-pulse" />
            <Shield className="w-3 h-3 text-yellow-500" />
            <span className="hidden sm:inline">Guard Active</span>
          </div>
        </div>
      </header>

      {/* Main Layout */}
      <div className="flex-1 flex overflow-hidden">
        {/* Left: Chat */}
        <div className="flex-1 min-w-0 flex flex-col">
          <ChatPanel onSend={sendMessage} onStop={stopAgent} />
        </div>

        {/* Right sidebar: Wallets/Policies + Audit */}
        <div className="hidden md:flex flex-shrink-0" style={{ width: showAudit ? '640px' : '340px' }}>
          {/* Wallets or Policies panel */}
          <div className="w-[340px] border-l border-bitgo-border flex-shrink-0 overflow-hidden">
            {activeTab === 'wallets' && <WalletDashboard />}
            {activeTab === 'transactions' && <RecentTransactions />}
            {activeTab === 'approvals' && <ApprovalsPanel onApprovalDecision={sendApprovalDecision} />}
          </div>

          {/* Audit Trail */}
          {showAudit && (
            <div className="w-[300px] border-l border-bitgo-border flex-shrink-0 overflow-hidden animate-slide-in">
              <AuditTrail />
            </div>
          )}
        </div>

        {/* Mobile bottom nav */}
        <div className="md:hidden fixed bottom-0 left-0 right-0 bg-bitgo-dark-2 border-t border-bitgo-border flex">
          <button
            onClick={() => setActiveTab('wallets')}
            className={`flex-1 py-3 text-center text-xs ${activeTab === 'wallets' ? 'text-bitgo-blue' : 'text-gray-500'}`}
          >
            <Wallet className="w-4 h-4 mx-auto mb-0.5" />
            Wallets
          </button>
          <button
            onClick={() => setActiveTab('transactions')}
            className={`flex-1 py-3 text-center text-xs ${activeTab === 'transactions' ? 'text-bitgo-blue' : 'text-gray-500'}`}
          >
            <ArrowUpRight className="w-4 h-4 mx-auto mb-0.5" />
            Txns
          </button>
          <button
            onClick={() => setActiveTab('approvals')}
            className={`flex-1 py-3 text-center text-xs relative ${activeTab === 'approvals' ? 'text-bitgo-blue' : 'text-gray-500'}`}
          >
            <AlertTriangle className="w-4 h-4 mx-auto mb-0.5" />
            Approvals
            {pendingCount > 0 && (
              <span className="absolute top-1 right-1/4 bg-yellow-500 text-black text-[8px] font-bold w-4 h-4 rounded-full flex items-center justify-center">
                {pendingCount}
              </span>
            )}
          </button>
          <button
            onClick={() => setShowAudit(!showAudit)}
            className={`flex-1 py-3 text-center text-xs ${showAudit ? 'text-purple-400' : 'text-gray-500'}`}
          >
            <ScrollText className="w-4 h-4 mx-auto mb-0.5" />
            Audit
          </button>
        </div>
      </div>
    </div>
  );
}

function TabButton({
  active,
  onClick,
  icon,
  label,
  badge,
}: {
  active: boolean;
  onClick: () => void;
  icon: React.ReactNode;
  label: string;
  badge?: number;
}) {
  return (
    <button
      onClick={onClick}
      className={`flex items-center gap-1.5 px-3 py-1.5 rounded-md text-xs font-medium transition-all relative ${
        active
          ? 'bg-bitgo-blue text-white shadow-sm shadow-bitgo-blue/30'
          : 'text-gray-400 hover:text-gray-200 hover:bg-bitgo-card-hover'
      }`}
    >
      {icon}
      {label}
      {badge !== undefined && badge > 0 && (
        <span className="ml-1 bg-yellow-500 text-black text-[9px] font-bold px-1.5 py-0 rounded-full leading-4">
          {badge}
        </span>
      )}
    </button>
  );
}
