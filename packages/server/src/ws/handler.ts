import { WebSocket } from 'ws';
import { AgentBrain } from '../agent/brain';
import { AuditLogger } from '../audit/logger';
import { v4 as uuid } from 'uuid';

interface WSIncoming {
  type: string;
  content?: string;
  approvalId?: string;
  decision?: 'approved' | 'rejected';
  conversationId?: string;
}

export function handleWebSocketConnection(
  ws: WebSocket,
  brain: AgentBrain,
  auditLogger: AuditLogger
): void {
  const sessionId = uuid(); // stable WS connection ID (per tab/connection)
  let conversationId = uuid(); // current conversation (can switch on new_session or load_session)
  let currentAbort: AbortController | null = null;

  brain.ensureSession(conversationId);

  console.log(`WebSocket connected: session ${sessionId}`);

  ws.send(
    JSON.stringify({
      type: 'connected',
      sessionId,
      message: 'Connected to Agentic Wallet. Type a message to get started.',
    })
  );

  ws.on('message', async (data: Buffer) => {
    try {
      const msg: WSIncoming = JSON.parse(data.toString());

      switch (msg.type) {
        case 'chat_message': {
          if (!msg.content) return;

          // Abort any in-flight request
          if (currentAbort) {
            currentAbort.abort();
          }
          const abort = new AbortController();
          currentAbort = abort;

          // Store user message
          brain.storeMessage(conversationId, { role: 'user', content: msg.content, timestamp: Date.now() });

          let hasText = false;
          try {
            for await (const event of brain.processMessage(msg.content, conversationId, abort.signal)) {
              if (abort.signal.aborted) break;
              if (event.type === 'agent_text') {
                hasText = true;
                // Store agent message as it arrives
                brain.storeMessage(conversationId, { role: 'agent', content: event.content!, timestamp: Date.now() });
              }
              if (ws.readyState === WebSocket.OPEN) {
                ws.send(JSON.stringify(event));
              }
            }
          } catch (err: any) {
            if (err.name !== 'AbortError' && !abort.signal.aborted) {
              if (ws.readyState === WebSocket.OPEN) {
                ws.send(JSON.stringify({ type: 'error', content: err.message }));
              }
            }
          }

          // If the agent completed tool calls but never sent text, send a done notice
          if (!hasText && !abort.signal.aborted && ws.readyState === WebSocket.OPEN) {
            ws.send(JSON.stringify({ type: 'agent_text', content: 'Done.' }));
          }

          // Signal done (only if not aborted)
          if (!abort.signal.aborted && ws.readyState === WebSocket.OPEN) {
            ws.send(JSON.stringify({ type: 'agent_done' }));
          }
          if (currentAbort === abort) {
            currentAbort = null;
          }
          break;
        }

        case 'stop': {
          if (currentAbort) {
            currentAbort.abort();
            currentAbort = null;
          }
          if (ws.readyState === WebSocket.OPEN) {
            ws.send(JSON.stringify({ type: 'agent_done' }));
          }
          break;
        }

        case 'new_session': {
          if (currentAbort) {
            currentAbort.abort();
            currentAbort = null;
          }
          // Keep old conversation data intact — just start a fresh one
          brain.resetConversation(conversationId);
          conversationId = uuid();
          brain.ensureSession(conversationId);
          if (ws.readyState === WebSocket.OPEN) {
            ws.send(JSON.stringify({ type: 'session_reset' }));
          }
          break;
        }

        case 'list_sessions': {
          const sessions = brain.getSessionsList();
          if (ws.readyState === WebSocket.OPEN) {
            ws.send(JSON.stringify({ type: 'sessions_list', sessions }));
          }
          break;
        }

        case 'load_session': {
          if (!msg.conversationId) return;
          if (currentAbort) {
            currentAbort.abort();
            currentAbort = null;
          }
          conversationId = msg.conversationId;
          const messages = brain.getSessionMessages(conversationId);
          const isRunning = brain.isConversationActive(conversationId);
          if (ws.readyState === WebSocket.OPEN) {
            ws.send(JSON.stringify({ type: 'session_loaded', conversationId, messages, isRunning }));
          }
          break;
        }

        case 'approval_decision': {
          if (msg.approvalId && msg.decision) {
            auditLogger.resolveApproval(msg.approvalId, msg.decision);

            if (msg.decision === 'approved') {
              brain.executeApprovedTool(
                msg.approvalId,
                conversationId,
                (event) => {
                  if (ws.readyState === WebSocket.OPEN) {
                    ws.send(JSON.stringify(event));
                  }
                }
              ).catch((err) => {
                if (ws.readyState === WebSocket.OPEN) {
                  ws.send(JSON.stringify({ type: 'error', content: `Execution failed: ${err.message}` }));
                }
              });
            } else {
              // Rejected — inform the user
              if (ws.readyState === WebSocket.OPEN) {
                ws.send(JSON.stringify({ type: 'agent_text', content: 'Transaction rejected. The pending send has been cancelled.' }));
                ws.send(JSON.stringify({ type: 'agent_done' }));
              }
            }
          }
          break;
        }

        default:
          ws.send(JSON.stringify({ type: 'error', content: `Unknown message type: ${msg.type}` }));
      }
    } catch (err: any) {
      ws.send(JSON.stringify({ type: 'error', content: `Parse error: ${err.message}` }));
    }
  });

  ws.on('close', () => {
    if (currentAbort) {
      currentAbort.abort();
      currentAbort = null;
    }
    brain.cleanupSession(conversationId);
    console.log(`WebSocket disconnected: session ${sessionId}`);
  });
}
