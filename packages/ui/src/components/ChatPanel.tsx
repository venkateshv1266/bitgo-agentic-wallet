import React, { useState, useRef, useEffect } from 'react';
import Markdown from 'react-markdown';
import remarkGfm from 'remark-gfm';
import {
  Send,
  Bot,
  User,
  Shield,
  ShieldCheck,
  ShieldX,
  Clock,
  Sparkles,
  MessageSquare,
  Square,
  AlertTriangle,
  CheckCircle,
  XCircle,
  Loader2,
} from 'lucide-react';
import { useStore, ChatMessage, PendingApproval } from '../store/index';

interface ChatPanelProps {
  onSend: (message: string) => void;
  onStop: () => void;
}

export function ChatPanel({ onSend, onStop }: ChatPanelProps) {
  const [input, setInput] = useState('');
  const messagesEndRef = useRef<HTMLDivElement>(null);
  const inputRef = useRef<HTMLInputElement>(null);
  const { messages, isAgentTyping, isAgentRunning, connected } = useStore();

  useEffect(() => {
    messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' });
  }, [messages, isAgentTyping]);

  // Focus input when agent finishes responding
  useEffect(() => {
    if (!isAgentTyping && inputRef.current) {
      inputRef.current.focus();
    }
  }, [isAgentTyping]);

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (!input.trim() || !connected || isAgentRunning) return;

    useStore.getState().addMessage({
      id: `user-${Date.now()}`,
      role: 'user',
      content: input.trim(),
      timestamp: Date.now(),
    });
    useStore.getState().setAgentTyping(true);
    useStore.getState().setAgentRunning(true);
    onSend(input.trim());
    setInput('');
    // Reset textarea height
    const textarea = (inputRef as any).current;
    if (textarea) textarea.style.height = 'auto';
  };

  const handleStop = () => {
    onStop();
    useStore.getState().setAgentTyping(false);
    useStore.getState().setAgentRunning(false);
    useStore.getState().addMessage({
      id: `system-${Date.now()}`,
      role: 'agent',
      content: '*Stopped by user.*',
      timestamp: Date.now(),
    });
  };

  const canSend = connected && input.trim() && !isAgentRunning;

  return (
    <div className="flex flex-col h-full bg-bitgo-dark">
      {/* Messages area */}
      <div className="flex-1 overflow-y-auto px-6 py-4">
        {messages.length === 0 && <EmptyState onSuggestion={(s) => {
          if (isAgentTyping) return;
          useStore.getState().addMessage({
            id: `user-${Date.now()}`,
            role: 'user',
            content: s,
            timestamp: Date.now(),
          });
          useStore.getState().setAgentTyping(true);
          useStore.getState().setAgentRunning(true);
          onSend(s);
        }} />}
        <div className="max-w-3xl mx-auto space-y-4">
          {messages.map((msg) => (
            <MessageBubble key={msg.id} message={msg} />
          ))}
          {isAgentTyping && <TypingIndicator />}
          <div ref={messagesEndRef} />
        </div>
      </div>

      {/* Input area */}
      <div className="border-t border-bitgo-border bg-bitgo-dark-2 px-6 py-3">
        <form onSubmit={handleSubmit} className="max-w-3xl mx-auto">
          <div className="flex gap-3 items-stretch bg-bitgo-card border border-bitgo-border rounded-xl focus-within:border-bitgo-blue focus-within:ring-1 focus-within:ring-bitgo-blue/30 transition-all">
            <textarea
              ref={inputRef as any}
              value={input}
              onChange={(e) => {
                setInput(e.target.value);
                e.target.style.height = 'auto';
                e.target.style.height = Math.min(e.target.scrollHeight, 150) + 'px';
              }}
              onKeyDown={(e) => {
                if (e.key === 'Enter' && !e.shiftKey) {
                  e.preventDefault();
                  handleSubmit(e as any);
                }
              }}
              placeholder={
                !connected
                  ? 'Connecting...'
                  : isAgentRunning
                  ? 'Agent is working...'
                  : 'Ask the agent to manage your wallets...'
              }
              disabled={!connected || isAgentRunning}
              rows={1}
              className="flex-1 bg-transparent px-4 py-3 text-sm text-white placeholder-gray-500 focus:outline-none disabled:opacity-40 disabled:cursor-not-allowed resize-none overflow-y-auto"
            />
            <div className="flex items-end p-2">
              {isAgentTyping ? (
                <button
                  type="button"
                  onClick={handleStop}
                  className="bg-red-500/20 hover:bg-red-500/30 border border-red-500/30 text-red-400 rounded-lg p-2.5 transition-all active:scale-95"
                  title="Stop generation"
                >
                  <Square className="w-4 h-4" />
                </button>
              ) : (
                <button
                  type="submit"
                  disabled={!canSend}
                  className="bg-bitgo-blue hover:bg-blue-500 disabled:opacity-30 disabled:hover:bg-bitgo-blue text-white rounded-lg p-2.5 transition-all shadow-lg shadow-bitgo-blue/20 hover:shadow-bitgo-blue/30 active:scale-95"
                >
                  <Send className="w-4 h-4" />
                </button>
              )}
            </div>
          </div>
          <div className="flex items-center gap-3 mt-2 text-[10px] text-gray-600">
            <span className="flex items-center gap-1">
              <Shield className="w-2.5 h-2.5" />
              3-layer Agent Guard
            </span>
            <span>|</span>
            <span>All actions are audited</span>
            {isAgentTyping && (
              <>
                <span>|</span>
                <span className="text-yellow-500 flex items-center gap-1 animate-pulse">
                  <div className="w-1.5 h-1.5 rounded-full bg-yellow-500" />
                  Agent working...
                </span>
              </>
            )}
            {!connected && (
              <>
                <span>|</span>
                <span className="text-red-400 flex items-center gap-1">
                  <div className="w-1.5 h-1.5 rounded-full bg-red-400" />
                  Disconnected
                </span>
              </>
            )}
          </div>
        </form>
      </div>
    </div>
  );
}

function EmptyState({ onSuggestion }: { onSuggestion: (s: string) => void }) {
  const suggestions = [
    'List my wallets',
    'Show my tBTC balance',
    'Create a new test wallet',
    'What policies are active?',
  ];

  return (
    <div className="flex flex-col items-center justify-center h-full text-center -mt-8">
      <div className="w-16 h-16 bg-gradient-to-br from-bitgo-blue/20 to-blue-400/10 rounded-2xl flex items-center justify-center mb-6 border border-bitgo-blue/10">
        <Sparkles className="w-8 h-8 text-bitgo-blue" />
      </div>
      <h2 className="text-lg font-semibold text-white mb-2">Agentic Wallet Assistant</h2>
      <p className="text-sm text-gray-500 mb-8 max-w-md">
        Manage your BitGo wallets using natural language. Every action is guarded by policy rules and logged to the audit trail.
      </p>
      <div className="grid grid-cols-2 gap-2 max-w-md w-full">
        {suggestions.map((s) => (
          <button
            key={s}
            onClick={() => onSuggestion(s)}
            className="text-left text-xs text-gray-400 bg-bitgo-card hover:bg-bitgo-card-hover border border-bitgo-border hover:border-bitgo-border-light rounded-lg px-3 py-2.5 transition-all group cursor-pointer"
          >
            <MessageSquare className="w-3 h-3 text-gray-600 group-hover:text-bitgo-blue mb-1 transition-colors" />
            {s}
          </button>
        ))}
      </div>
    </div>
  );
}

function TypingIndicator() {
  return (
    <div className="flex items-start gap-3 animate-fade-in">
      <div className="w-7 h-7 rounded-lg bg-bitgo-card border border-bitgo-border flex items-center justify-center flex-shrink-0">
        <Bot className="w-4 h-4 text-bitgo-blue" />
      </div>
      <div className="bg-bitgo-card border border-bitgo-border rounded-xl rounded-tl-sm px-4 py-3">
        <div className="flex gap-1.5">
          <div className="w-2 h-2 bg-gray-500 rounded-full animate-pulse-dot" style={{ animationDelay: '0ms' }} />
          <div className="w-2 h-2 bg-gray-500 rounded-full animate-pulse-dot" style={{ animationDelay: '200ms' }} />
          <div className="w-2 h-2 bg-gray-500 rounded-full animate-pulse-dot" style={{ animationDelay: '400ms' }} />
        </div>
      </div>
    </div>
  );
}

function MessageBubble({ message }: { message: ChatMessage }) {
  const isUser = message.role === 'user';

  return (
    <div className={`flex items-start gap-3 animate-fade-in ${isUser ? 'flex-row-reverse' : ''}`}>
      {/* Avatar */}
      <div
        className={`w-7 h-7 rounded-lg flex items-center justify-center flex-shrink-0 ${
          isUser
            ? 'bg-bitgo-blue/10 border border-bitgo-blue/20'
            : 'bg-bitgo-card border border-bitgo-border'
        }`}
      >
        {isUser ? (
          <User className="w-4 h-4 text-bitgo-blue" />
        ) : (
          <Bot className="w-4 h-4 text-bitgo-blue" />
        )}
      </div>

      {/* Content */}
      <div className={`max-w-[75%] ${isUser ? 'items-end' : 'items-start'}`}>
        <div
          className={`rounded-xl px-4 py-2.5 text-sm leading-relaxed ${
            isUser
              ? 'bg-bitgo-blue text-white rounded-tr-sm'
              : 'bg-bitgo-card border border-bitgo-border text-gray-200 rounded-tl-sm'
          }`}
        >
          {isUser ? (
            <p className="whitespace-pre-wrap">{message.content}</p>
          ) : (
            <div className="prose prose-invert prose-sm max-w-none
              prose-p:my-1 prose-p:leading-relaxed
              prose-headings:my-2 prose-headings:text-gray-100
              prose-strong:text-white prose-strong:font-semibold
              prose-code:text-yellow-300 prose-code:bg-bitgo-dark prose-code:px-1.5 prose-code:py-0.5 prose-code:rounded prose-code:text-xs prose-code:font-mono prose-code:before:content-none prose-code:after:content-none prose-code:break-all
              prose-pre:bg-bitgo-dark prose-pre:border prose-pre:border-bitgo-border prose-pre:rounded-lg prose-pre:my-2
              prose-ul:my-1 prose-ol:my-1 prose-li:my-0.5
              prose-a:text-bitgo-blue prose-a:no-underline hover:prose-a:underline
              prose-table:w-full prose-table:border-collapse prose-table:my-2
              prose-th:border prose-th:border-bitgo-border prose-th:px-3 prose-th:py-1.5 prose-th:text-left prose-th:text-xs prose-th:font-semibold prose-th:text-gray-300 prose-th:bg-bitgo-dark
              prose-td:border prose-td:border-bitgo-border prose-td:px-3 prose-td:py-1.5 prose-td:text-xs prose-td:text-gray-300
            ">
              <Markdown remarkPlugins={[remarkGfm]}>{message.content}</Markdown>
            </div>
          )}
        </div>

        {/* Tool call card */}
        {message.toolCall && (
          <div className="mt-2 bg-bitgo-dark-2 border border-bitgo-border rounded-xl overflow-hidden">
            <div className="flex items-center gap-2 px-3 py-2 bg-bitgo-card/50 border-b border-bitgo-border">
              <Shield className="w-3 h-3 text-yellow-500" />
              <span className="font-mono text-xs font-semibold text-yellow-400">
                {message.toolCall.tool}
              </span>
              {message.toolCall.guardResult && (
                <div className="ml-auto">
                  <GuardBadge result={message.toolCall.guardResult} />
                </div>
              )}
            </div>
            <div className="px-3 py-2">
              <pre className="text-[11px] text-gray-400 font-mono overflow-x-auto whitespace-pre-wrap leading-relaxed">
                {JSON.stringify(message.toolCall.input, null, 2)}
              </pre>
            </div>
            {message.toolCall.result && (
              <details className="border-t border-bitgo-border">
                <summary className="px-3 py-2 cursor-pointer text-xs text-gray-500 hover:text-gray-300 transition-colors">
                  View Result
                </summary>
                <pre className="px-3 pb-2 text-[11px] text-gray-400 font-mono overflow-x-auto whitespace-pre-wrap">
                  {JSON.stringify(message.toolCall.result, null, 2)}
                </pre>
              </details>
            )}
          </div>
        )}

        <span className="text-[10px] text-gray-600 mt-1.5 block px-1">
          {new Date(message.timestamp).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}
        </span>
      </div>
    </div>
  );
}

export function ApprovalCard({
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

  const borderColor = isCompleted
    ? 'border-green-500/30'
    : isApproved
    ? 'border-blue-500/30'
    : isRejected
    ? 'border-red-500/30'
    : 'border-yellow-500/20';

  const bgColor = isCompleted
    ? 'bg-green-500/5'
    : isApproved
    ? 'bg-blue-500/5'
    : isRejected
    ? 'bg-red-500/5'
    : 'bg-yellow-500/5';

  const iconBorder = isCompleted
    ? 'bg-green-500/10 border-green-500/20'
    : isApproved
    ? 'bg-blue-500/10 border-blue-500/20'
    : isRejected
    ? 'bg-red-500/10 border-red-500/20'
    : 'bg-yellow-500/10 border-yellow-500/20';

  const IconComponent = isCompleted ? CheckCircle : isApproved ? CheckCircle : isRejected ? XCircle : AlertTriangle;
  const iconColor = isCompleted ? 'text-green-400' : isApproved ? 'text-blue-400' : isRejected ? 'text-red-400' : 'text-yellow-400';

  return (
    <div className="flex items-start gap-3 animate-fade-in">
      <div className={`w-7 h-7 rounded-lg border flex items-center justify-center flex-shrink-0 ${iconBorder}`}>
        <IconComponent className={`w-4 h-4 ${iconColor}`} />
      </div>
      <div className="flex-1 max-w-[85%]">
        <div className={`${bgColor} border ${borderColor} rounded-xl p-4`}>
          <div className="flex items-center gap-2 mb-2">
            <Shield className={`w-3.5 h-3.5 ${isPending ? 'text-yellow-400' : isCompleted ? 'text-green-400' : isApproved ? 'text-blue-400' : 'text-red-400'}`} />
            <span className={`text-xs font-semibold ${isPending ? 'text-yellow-400' : isCompleted ? 'text-green-400' : isApproved ? 'text-blue-400' : 'text-red-400'}`}>
              {isPending ? 'Approval Required' : isCompleted ? 'Transaction Sent' : isApproved ? 'Approved' : 'Rejected'}
            </span>
            {isCompleted && (
              <span className="flex items-center gap-1 text-[10px] font-medium text-green-400 bg-green-400/10 px-2 py-0.5 rounded-full ml-auto">
                <CheckCircle className="w-3 h-3" /> Sent
              </span>
            )}
            {isApproved && !isCompleted && (
              <span className="flex items-center gap-1 text-[10px] font-medium text-blue-400 bg-blue-400/10 px-2 py-0.5 rounded-full ml-auto">
                <CheckCircle className="w-3 h-3" /> Approved
              </span>
            )}
            {isRejected && (
              <span className="flex items-center gap-1 text-[10px] font-medium text-red-400 bg-red-400/10 px-2 py-0.5 rounded-full ml-auto">
                <XCircle className="w-3 h-3" /> Rejected
              </span>
            )}
          </div>

          <p className="text-sm text-gray-300 mb-3">
            {approval.guardResult?.reason || 'This action requires human approval to proceed.'}
          </p>

          <div className="bg-bitgo-dark rounded-lg p-3 mb-3">
            <div className="flex items-center gap-2 mb-1.5">
              <span className="text-[10px] font-bold text-yellow-400 uppercase tracking-wider">
                {approval.toolName}
              </span>
            </div>
            <pre className="text-[11px] text-gray-400 font-mono whitespace-pre-wrap">
              {JSON.stringify(approval.toolInput, null, 2)}
            </pre>
          </div>

          {isPending && (
            <div className="flex gap-2">
              <button
                onClick={() => onDecision(approval.id, 'approved')}
                className="flex items-center gap-1.5 px-4 py-2 bg-green-500/20 hover:bg-green-500/30 border border-green-500/30 text-green-400 rounded-lg text-xs font-medium transition-all active:scale-95"
              >
                <CheckCircle className="w-3.5 h-3.5" />
                Approve
              </button>
              <button
                onClick={() => onDecision(approval.id, 'rejected')}
                className="flex items-center gap-1.5 px-4 py-2 bg-red-500/20 hover:bg-red-500/30 border border-red-500/30 text-red-400 rounded-lg text-xs font-medium transition-all active:scale-95"
              >
                <XCircle className="w-3.5 h-3.5" />
                Reject
              </button>
            </div>
          )}

          {isApproved && !isCompleted && (
            <div className="flex items-center gap-2 text-xs text-blue-400/80">
              <Loader2 className="w-3.5 h-3.5 animate-spin" />
              <span>Approved — Sending transaction...</span>
            </div>
          )}

          {isCompleted && (
            <div className="flex items-center gap-2 text-xs text-green-400">
              <CheckCircle className="w-3.5 h-3.5" />
              <span>Signed — Sent to network</span>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}

function GuardBadge({ result }: { result: any }) {
  if (result.decision === 'approve' || result.allowed) {
    return (
      <span className="flex items-center gap-1 text-[10px] font-medium text-green-400 bg-green-400/10 px-2 py-0.5 rounded-full">
        <ShieldCheck className="w-3 h-3" /> Approved
      </span>
    );
  }
  if (result.decision === 'escalate') {
    return (
      <span className="flex items-center gap-1 text-[10px] font-medium text-yellow-400 bg-yellow-400/10 px-2 py-0.5 rounded-full">
        <Clock className="w-3 h-3" /> Escalated
      </span>
    );
  }
  return (
    <span className="flex items-center gap-1 text-[10px] font-medium text-red-400 bg-red-400/10 px-2 py-0.5 rounded-full">
      <ShieldX className="w-3 h-3" /> Blocked
    </span>
  );
}
