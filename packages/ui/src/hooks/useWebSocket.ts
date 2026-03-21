import { useEffect, useRef, useCallback } from 'react';
import { useStore } from '../store';


export function useWebSocket() {
  const wsRef = useRef<WebSocket | null>(null);
  const {
    setConnected,
    addMessage,
    clearMessages,
    setAgentTyping,
    setAgentRunning,
    addAuditEntry,
    addPendingApproval,
    resolveApproval,
    setWallets,
    setAgenticWalletIds,
    addRecentTransaction,
    setRecentTransactions,
    setTransfersLoading,
    updateTransactionState,
    completeApproval,
    failApproval,
    setSessions,
  } = useStore();

  const fetchWallets = useCallback(() => {
    // Fetch all wallets from BitGo
    fetch('/api/wallets')
      .then((res) => res.json())
      .then((data) => {
        if (data.wallets && Array.isArray(data.wallets)) {
          setWallets(data.wallets);
        }
      })
      .catch((err) => console.warn('Failed to fetch wallets:', err));

    // Fetch vault wallet IDs (agentic wallets)
    fetch('/api/vault/wallets')
      .then((res) => res.json())
      .then((data) => {
        if (data.walletIds && Array.isArray(data.walletIds)) {
          setAgenticWalletIds(data.walletIds);
        }
      })
      .catch((err) => console.warn('Failed to fetch vault wallet IDs:', err));
  }, [setWallets, setAgenticWalletIds]);

  const fetchTransfers = useCallback(() => {
    setTransfersLoading(true);
    fetch('/api/transfers?limit=20')
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
          setRecentTransactions(txs, data.nextBatchToken || null);
        }
      })
      .catch((err) => console.warn('Failed to fetch transfers:', err))
      .finally(() => setTransfersLoading(false));
  }, [setRecentTransactions, setTransfersLoading]);

  const connect = useCallback(() => {
    const protocol = window.location.protocol === 'https:' ? 'wss:' : 'ws:';
    const wsUrl = `${protocol}//${window.location.host}/ws`;
    const ws = new WebSocket(wsUrl);
    wsRef.current = ws;

    ws.onopen = () => {
      console.log('WebSocket connected');
    };

    ws.onmessage = (event) => {
      const msg = JSON.parse(event.data);

      switch (msg.type) {
        case 'connected':
          setConnected(true, msg.sessionId);
          fetchWallets();
          fetchTransfers();
          break;

        case 'agent_text': {
          setAgentTyping(false); // hide typing indicator when text arrives; isAgentRunning stays true until agent_done
          const currentMessages = useStore.getState().messages;
          const lastMsg = currentMessages[currentMessages.length - 1];
          if (lastMsg && lastMsg.role === 'agent' && lastMsg.content === msg.content) {
            break;
          }
          addMessage({
            id: `agent-${Date.now()}-${Math.random()}`,
            role: 'agent',
            content: msg.content,
            timestamp: Date.now(),
          });
          break;
        }

        case 'tool_call':
          addMessage({
            id: `tool-${msg.toolCallId}`,
            role: 'agent',
            content: `Calling tool: **${msg.tool}**`,
            timestamp: Date.now(),
            toolCall: { tool: msg.tool, input: msg.input },
          });
          break;

        case 'guard_result':
          useStore.setState((s) => ({
            messages: s.messages.map((m) =>
              m.id === `tool-${msg.toolCallId}` && m.toolCall
                ? { ...m, toolCall: { ...m.toolCall, guardResult: msg.result } }
                : m
            ),
          }));
          break;

        case 'tool_result':
          useStore.setState((s) => ({
            messages: s.messages.map((m) =>
              m.id === `tool-${msg.toolCallId}` && m.toolCall
                ? { ...m, toolCall: { ...m.toolCall, result: msg.result } }
                : m
            ),
          }));
          break;

        case 'audit_entry':
          addAuditEntry(msg);
          if (msg.status === 'executed') {
            completeApproval(msg.tool);
          }
          if (msg.status === 'failed') {
            failApproval(msg.tool);
          }
          if ((msg.tool === 'generate_wallet' || msg.tool === 'update_wallet') && msg.status === 'executed') {
            fetchWallets();
          }
          if (msg.tool === 'send_transaction' && msg.status === 'executed') {
            const result = msg.executionResult as any;
            if (result?.transfer) {
              const transfer = result.transfer;
              const entries = transfer.entries || [];
              const fromEntry = entries.find((e: any) => e.value < 0 || e.valueString?.startsWith('-'));
              const toEntry = entries.find((e: any) => e.value > 0 && !e.valueString?.startsWith('-'));
              const coin = transfer.coin || (msg.input?.coin as string) || '';
              addRecentTransaction({
                id: transfer.id || `tx-${Date.now()}`,
                txid: transfer.txid || '',
                coin,
                walletId: transfer.wallet || (msg.input?.walletId as string) || '',
                // displayAmount is pre-formatted by the server using BitGo SDK's
                // getBaseFactor(); fall back to raw value only if unavailable
                amount: transfer.displayAmount || toEntry?.value?.toString() || (msg.input?.amount as string) || '0',
                address: (msg.input?.address as string) || toEntry?.address || '',
                fromAddress: fromEntry?.address || '',
                toAddress: (msg.input?.address as string) || toEntry?.address || '',
                type: 'send',
                state: 'signed',
                timestamp: Date.now(),
              });
              // Auto-switch to Transactions tab to show the new tx
              useStore.getState().setActiveTab('transactions');
            }
          }
          break;

        case 'approval_required':
          addPendingApproval(msg.approval || msg);
          addMessage({
            id: `approval-notice-${Date.now()}`,
            role: 'agent',
            content: 'This transaction requires human approval. Switching to the Approvals tab...',
            timestamp: Date.now(),
          });
          // Auto-switch to Approvals tab
          useStore.getState().setActiveTab('approvals');
          break;

        case 'approval_resolved':
          resolveApproval(msg.approvalId, msg.decision);
          break;

        case 'transfer_update': {
          // Deduplicate: only show one confirmation message per txid
          const msgKey = `transfer-${msg.txid}-${msg.state}`;
          const existing = useStore.getState().messages;
          if (!existing.some((m) => m.id === msgKey)) {
            const stateLabel = msg.state === 'confirmed' ? 'Confirmed on-chain' : `Status: ${msg.state}`;
            const lines = [`### Transfer ${stateLabel}`, ''];
            if (msg.coin) lines.push(`- **Coin:** ${msg.coin}`);
            if (msg.amount) lines.push(`- **Amount:** ${msg.amount} ${msg.coin || ''}`);
            if (msg.fromAddress) lines.push(`- **From:** \`${msg.fromAddress}\``);
            if (msg.toAddress) lines.push(`- **To:** \`${msg.toAddress}\``);
            if (msg.displayFee) lines.push(`- **Fee:** ${msg.displayFee} ${msg.coin || ''}`);
            if (msg.confirmations) lines.push(`- **Confirmations:** ${msg.confirmations}`);
            lines.push(`- **Wallet:** \`${msg.walletId}\``);
            lines.push(`- **Tx:** \`${msg.txid}\``);

            addMessage({
              id: msgKey,
              role: 'agent',
              content: lines.join('\n'),
              timestamp: Date.now(),
            });
          }
          updateTransactionState(msg.txid || msg.transferId, msg.state);
          // If this transfer isn't in recentTransactions yet (e.g. incoming deposit),
          // add it so the wallet's activity timestamp updates for sorting
          const txId = msg.transferId || msg.txid || `tx-${Date.now()}`;
          const currentTxs = useStore.getState().recentTransactions;
          if (!currentTxs.some((t) => t.id === txId || t.txid === msg.txid)) {
            addRecentTransaction({
              id: txId,
              txid: msg.txid || '',
              coin: msg.coin || '',
              walletId: msg.walletId || '',
              amount: msg.amount || '0',
              address: msg.toAddress || msg.fromAddress || '',
              fromAddress: msg.fromAddress || '',
              toAddress: msg.toAddress || '',
              type: msg.fromAddress && msg.toAddress ? 'receive' : 'receive',
              state: (msg.state as 'signed' | 'confirmed' | 'failed') || 'confirmed',
              timestamp: Date.now(),
            });
          }
          fetchWallets();
          break;
        }

        case 'sessions_list':
          setSessions(msg.sessions || []);
          break;

        case 'session_loaded': {
          clearMessages(); // resets isAgentRunning: false
          for (const stored of (msg.messages || [])) {
            addMessage({
              id: `hist-${stored.role}-${stored.timestamp}-${Math.random()}`,
              role: stored.role,
              content: stored.content,
              timestamp: stored.timestamp,
            });
          }
          // Restore running state if the agent is still processing this conversation
          if (msg.isRunning) {
            setAgentRunning(true);
            setAgentTyping(true);
          }
          break;
        }

        case 'session_reset':
          clearMessages();
          break;

        case 'agent_done':
          setAgentTyping(false);
          setAgentRunning(false);
          break;

        case 'error':
          addMessage({
            id: `error-${Date.now()}`,
            role: 'agent',
            content: `Error: ${msg.content}`,
            timestamp: Date.now(),
          });
          setAgentTyping(false);
          setAgentRunning(false);
          break;
      }
    };

    ws.onclose = () => {
      setConnected(false);
      setTimeout(connect, 2000);
    };

    ws.onerror = () => {
      ws.close();
    };
  }, [setConnected, addMessage, clearMessages, setAgentTyping, setAgentRunning, addAuditEntry, addPendingApproval, resolveApproval, setWallets, setAgenticWalletIds, fetchWallets, fetchTransfers, addRecentTransaction, updateTransactionState, completeApproval, failApproval, setSessions]);

  useEffect(() => {
    connect();
    return () => {
      wsRef.current?.close();
    };
  }, [connect]);

  const sendMessage = useCallback((content: string) => {
    if (wsRef.current?.readyState === WebSocket.OPEN) {
      wsRef.current.send(JSON.stringify({ type: 'chat_message', content }));
    }
  }, []);

  const stopAgent = useCallback(() => {
    if (wsRef.current?.readyState === WebSocket.OPEN) {
      wsRef.current.send(JSON.stringify({ type: 'stop' }));
    }
  }, []);

  const sendApprovalDecision = useCallback((approvalId: string, decision: 'approved' | 'rejected') => {
    if (wsRef.current?.readyState === WebSocket.OPEN) {
      wsRef.current.send(JSON.stringify({ type: 'approval_decision', approvalId, decision }));
    }
  }, []);

  const startNewSession = useCallback(() => {
    if (wsRef.current?.readyState === WebSocket.OPEN) {
      wsRef.current.send(JSON.stringify({ type: 'new_session' }));
    }
  }, []);

  const listSessions = useCallback(() => {
    if (wsRef.current?.readyState === WebSocket.OPEN) {
      wsRef.current.send(JSON.stringify({ type: 'list_sessions' }));
    }
  }, []);

  const loadSession = useCallback((conversationId: string) => {
    if (wsRef.current?.readyState === WebSocket.OPEN) {
      wsRef.current.send(JSON.stringify({ type: 'load_session', conversationId }));
    }
  }, []);

  return { sendMessage, stopAgent, sendApprovalDecision, startNewSession, listSessions, loadSession };
}
