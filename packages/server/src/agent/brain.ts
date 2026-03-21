import { TOOL_DEFINITIONS } from './tools';
import { ToolHandlers } from './toolHandlers';
import { AgentGuard } from '../guard';
import { AuditLogger } from '../audit/logger';
import { SYSTEM_PROMPT } from './prompts';
import { GuardResult } from '../audit/types';

export interface AgentMessage {
  type: 'agent_text' | 'tool_call' | 'guard_result' | 'tool_result' | 'approval_required' | 'error' | 'agent_done';
  content?: string;
  tool?: string;
  input?: Record<string, unknown>;
  toolCallId?: string;
  result?: unknown;
  approval?: unknown;
}

export interface StoredMessage {
  role: 'user' | 'agent';
  content: string;
  timestamp: number;
}

interface SessionMetaEntry {
  title: string;
  createdAt: number;
  updatedAt: number;
}

export interface SessionListItem {
  id: string;
  title: string;
  createdAt: number;
  updatedAt: number;
}

/**
 * Agent Brain using Claude Code SDK with an in-process MCP server.
 *
 * Creates a custom MCP server containing ONLY the BitGo wallet tools,
 * and passes it as the sole MCP server to the SDK. This ensures Claude
 * never sees or uses local MCPs (Snowflake, Grafana, etc).
 *
 * Tool execution flow:
 *   User message → Claude (via SDK, enterprise auth)
 *     → Claude picks a BitGo tool
 *       → MCP handler runs it through Agent Guard → BitGo Express API
 *         → Result flows back to Claude → Claude responds to user
 */
export class AgentBrain {
  private toolHandlers: ToolHandlers;
  private guard: AgentGuard;
  private auditLogger: AuditLogger;
  private claudeQuery: any = null;
  private createSdkMcpServer: any = null;
  private sdkTool: any = null;
  private zod: any = null;
  // Track SDK session IDs per conversation for conversation continuity
  private sessions: Map<string, string> = new Map();
  // Cache MCP servers per conversation to avoid rebuilding
  private mcpServerCache: Map<string, any> = new Map();
  // Current emitter per conversation — updated on every processMessage call so the
  // cached MCP server always routes events to the active call's queue
  private sessionEmitters: Map<string, (msg: AgentMessage) => void> = new Map();
  // Pending tool executions awaiting human approval, keyed by approvalId
  private pendingApprovalExecutions: Map<string, { toolName: string; toolInput: Record<string, unknown>; sessionId: string }> = new Map();
  // In-memory message history per conversation (persists across WS disconnects)
  private sessionMessages: Map<string, StoredMessage[]> = new Map();
  // Metadata per conversation (title, timestamps)
  private sessionMeta: Map<string, SessionMetaEntry> = new Map();

  constructor(toolHandlers: ToolHandlers, guard: AgentGuard, auditLogger: AuditLogger) {
    this.toolHandlers = toolHandlers;
    this.guard = guard;
    this.auditLogger = auditLogger;
  }

  async init(): Promise<void> {
    try {
      const claudeCode = await import('@anthropic-ai/claude-code');
      this.claudeQuery = claudeCode.query;
      this.createSdkMcpServer = claudeCode.createSdkMcpServer;
      this.sdkTool = claudeCode.tool;
      // Load zod for schema definitions
      const { z } = await import('zod');
      this.zod = z;
      console.log('Claude Code SDK loaded — using enterprise auth (isolated MCP mode)');
    } catch (err: any) {
      console.log('Claude Code SDK not available — using direct tool execution mode');
      console.log(`  Reason: ${err.message}`);
    }
  }

  cleanupSession(conversationId: string): void {
    this.sessions.delete(conversationId);
    this.mcpServerCache.delete(conversationId);
    this.sessionEmitters.delete(conversationId);
    for (const [id, pending] of this.pendingApprovalExecutions) {
      if (pending.sessionId === conversationId) this.pendingApprovalExecutions.delete(id);
    }
    // NOTE: sessionMessages and sessionMeta are intentionally NOT cleaned here.
    // They persist for the server process lifetime so sessions can be resumed.
  }

  ensureSession(conversationId: string): void {
    if (!this.sessionMeta.has(conversationId)) {
      const now = Date.now();
      this.sessionMeta.set(conversationId, { title: 'New conversation', createdAt: now, updatedAt: now });
    }
    if (!this.sessionMessages.has(conversationId)) {
      this.sessionMessages.set(conversationId, []);
    }
  }

  storeMessage(conversationId: string, msg: StoredMessage): void {
    this.ensureSession(conversationId);
    this.sessionMessages.get(conversationId)!.push(msg);
    const meta = this.sessionMeta.get(conversationId)!;
    meta.updatedAt = msg.timestamp;
    // Auto-set title from the first user message (first 60 chars)
    if (msg.role === 'user' && meta.title === 'New conversation') {
      meta.title = msg.content.slice(0, 60);
    }
  }

  getSessionsList(): SessionListItem[] {
    const result: SessionListItem[] = [];
    for (const [id, meta] of this.sessionMeta) {
      // Skip sessions with no messages
      const msgs = this.sessionMessages.get(id);
      if (!msgs || msgs.length === 0) continue;
      result.push({ id, ...meta });
    }
    return result.sort((a, b) => b.updatedAt - a.updatedAt);
  }

  getSessionMessages(conversationId: string): StoredMessage[] {
    return this.sessionMessages.get(conversationId) ?? [];
  }

  isConversationActive(conversationId: string): boolean {
    return this.sessionEmitters.has(conversationId);
  }

  /**
   * Resets the conversation history for a session without tearing down the
   * MCP server. The next processMessage call will start a fresh Claude turn.
   */
  resetConversation(sessionId: string): void {
    this.sessions.delete(sessionId);
  }

  /**
   * Called by the WS handler when the user approves a pending transaction.
   * Executes the tool directly (bypassing the Claude SDK) and sends events
   * back to the client via the provided send callback.
   */
  async executeApprovedTool(
    approvalId: string,
    sessionId: string,
    send: (event: AgentMessage) => void
  ): Promise<void> {
    const pending = this.pendingApprovalExecutions.get(approvalId);
    if (!pending) return;
    this.pendingApprovalExecutions.delete(approvalId);

    const { toolName, toolInput } = pending;
    const toolCallId = `approved-${approvalId}`;
    const startTime = Date.now();
    const approvedGuardResult: GuardResult = {
      allowed: true,
      decision: 'approve',
      reason: 'Approved by human',
      layers: [],
    };

    send({ type: 'tool_call', tool: toolName, input: toolInput, toolCallId });

    try {
      const result = await this.toolHandlers.execute(toolName, toolInput);
      this.auditLogger.log({
        sessionId,
        tool: toolName,
        input: toolInput,
        guardResult: approvedGuardResult,
        executionResult: result,
        status: 'executed',
        durationMs: Date.now() - startTime,
      });
      send({ type: 'tool_result', toolCallId, result });
      send({ type: 'agent_text', content: 'Transaction approved and submitted successfully.' });
      this.storeMessage(sessionId, { role: 'agent', content: 'Transaction approved and submitted successfully.', timestamp: Date.now() });
    } catch (err: any) {
      this.auditLogger.log({
        sessionId,
        tool: toolName,
        input: toolInput,
        guardResult: approvedGuardResult,
        executionResult: { error: err.message },
        status: 'failed',
        durationMs: Date.now() - startTime,
      });
      const failMsg = `Approved transaction failed to execute: ${err.message}`;
      send({ type: 'error', content: failMsg });
      this.storeMessage(sessionId, { role: 'agent', content: `Error: ${failMsg}`, timestamp: Date.now() });
    }

    send({ type: 'agent_done' });
  }

  async *processMessage(
    userMessage: string,
    sessionId: string,
    signal?: AbortSignal
  ): AsyncGenerator<AgentMessage> {
    if (this.claudeQuery && this.createSdkMcpServer) {
      yield* this.processWithIsolatedSDK(userMessage, sessionId, signal);
    } else {
      yield* this.processWithDirectMode(userMessage, sessionId);
    }
  }

  /**
   * Build an in-process MCP server with ONLY our BitGo tools.
   * Each tool handler runs through the Agent Guard before calling BitGo APIs.
   */
  private buildMcpServer(sessionId: string) {
    const z = this.zod;
    const self = this;

    // Convert our tool definitions to SDK MCP tools
    const mcpTools = TOOL_DEFINITIONS.map((def) => {
      // Build a zod schema from our JSON Schema properties
      const zodShape: Record<string, any> = {};
      for (const [key, prop] of Object.entries(def.inputSchema.properties)) {
        const p = prop as any;
        let field: any;
        if (p.type === 'number') {
          field = z.number().describe(p.description || key);
          if (!def.inputSchema.required.includes(key)) field = field.optional();
        } else if (p.type === 'array') {
          field = z.array(z.any()).describe(p.description || key);
          if (!def.inputSchema.required.includes(key)) field = field.optional();
        } else if (p.type === 'object') {
          field = z.record(z.any()).describe(p.description || key);
          if (!def.inputSchema.required.includes(key)) field = field.optional();
        } else {
          // Default: string
          field = z.string().describe(p.description || key);
          if (!def.inputSchema.required.includes(key)) field = field.optional();
        }
        zodShape[key] = field;
      }

      return this.sdkTool(
        def.name,
        def.description,
        zodShape,
        async (args: Record<string, unknown>) => {
          const startTime = Date.now();
          const toolName = def.name;

          // Run through Agent Guard
          const guardResult: GuardResult = await self.guard.evaluate(
            toolName,
            args,
            sessionId,
            self.auditLogger
          );

          if (guardResult.decision === 'deny') {
            self.auditLogger.log({
              sessionId,
              tool: toolName,
              input: args,
              guardResult,
              status: 'blocked',
              durationMs: Date.now() - startTime,
            });
            return {
              content: [
                {
                  type: 'text' as const,
                  text: JSON.stringify({
                    error: 'BLOCKED_BY_GUARD',
                    reason: guardResult.reason,
                  }),
                },
              ],
            };
          }

          if (guardResult.decision === 'escalate') {
            self.auditLogger.log({
              sessionId,
              tool: toolName,
              input: args,
              guardResult,
              status: 'escalated',
              durationMs: Date.now() - startTime,
            });

            const { approval } = self.auditLogger.createPendingApproval(
              toolName,
              args,
              guardResult
            );

            // Store pending execution so the WS handler can run it after approval
            self.pendingApprovalExecutions.set(approval.id, { toolName, toolInput: args, sessionId });
            self.sessionEmitters.get(sessionId)?.({ type: 'approval_required', approval });

            // Return immediately — do NOT block waiting for the decision.
            // Blocking causes the Claude SDK's underlying API call to time out (~60s),
            // after which Claude incorrectly assumes the tx failed and starts retrying.
            // executeApprovedTool() will be called by the WS handler once the user decides.
            return {
              content: [
                {
                  type: 'text' as const,
                  text: JSON.stringify({
                    status: 'APPROVAL_PENDING',
                    approvalId: approval.id,
                    message: 'This transaction requires human approval. The request is waiting in the Approvals panel. Do NOT retry or call list_transfers.',
                  }),
                },
              ],
            };
          }

          // Execute the tool via BitGo Express / SDK
          try {
            const result = await self.toolHandlers.execute(toolName, args);
            self.auditLogger.log({
              sessionId,
              tool: toolName,
              input: args,
              guardResult,
              executionResult: result,
              status: 'executed',
              durationMs: Date.now() - startTime,
            });
            return {
              content: [
                {
                  type: 'text' as const,
                  text: JSON.stringify(result),
                },
              ],
            };
          } catch (err: any) {
            self.auditLogger.log({
              sessionId,
              tool: toolName,
              input: args,
              guardResult,
              executionResult: { error: err.message },
              status: 'failed',
              durationMs: Date.now() - startTime,
            });
            return {
              content: [
                {
                  type: 'text' as const,
                  text: JSON.stringify({ error: err.message }),
                },
              ],
            };
          }
        }
      );
    });

    return this.createSdkMcpServer({
      name: 'bitgo-wallet-tools',
      version: '1.0.0',
      tools: mcpTools,
    });
  }

  /**
   * Mode 1: Claude Code SDK with isolated in-process MCP server.
   * Only our BitGo tools are visible to Claude — no local MCPs.
   */
  private async *processWithIsolatedSDK(
    userMessage: string,
    sessionId: string,
    signal?: AbortSignal
  ): AsyncGenerator<AgentMessage> {
    try {
      // Async queue for merging SDK messages and side-channel messages (approvals).
      // This ensures approvals are yielded immediately even when the SDK is blocked
      // waiting for an approval decision.
      const queue: AgentMessage[] = [];
      let queueResolve: (() => void) | null = null;
      let done = false;

      const enqueue = (msg: AgentMessage) => {
        queue.push(msg);
        if (queueResolve) {
          queueResolve();
          queueResolve = null;
        }
      };

      const emitter = (msg: AgentMessage) => enqueue(msg);
      // Always update the session emitter so the cached MCP server routes
      // approval_required events to the current call's queue, not a stale one.
      this.sessionEmitters.set(sessionId, emitter);

      // Reuse cached MCP server for this session, or build a new one
      if (!this.mcpServerCache.has(sessionId)) {
        this.mcpServerCache.set(sessionId, this.buildMcpServer(sessionId));
      }
      const mcpServer = this.mcpServerCache.get(sessionId);

      const mcpToolNames = TOOL_DEFINITIONS.map((t) => `mcp__bitgo-wallet-tools__${t.name}`);

      const abortController = new AbortController();
      if (signal) {
        signal.addEventListener('abort', () => abortController.abort(), { once: true });
      }

      // Check if we have an existing session to resume
      const existingSessionId = this.sessions.get(sessionId);

      const queryOptions: any = {
        systemPrompt: SYSTEM_PROMPT,
        model: 'claude-sonnet-4-6',
        maxTurns: 10,
        abortController,
        mcpServers: {
          'bitgo-wallet-tools': mcpServer,
        },
        allowedTools: mcpToolNames,
        permissionMode: 'bypassPermissions' as any,
      };

      // Resume previous session for conversation continuity
      if (existingSessionId) {
        queryOptions.resume = existingSessionId;
        queryOptions.continue = true;
      }

      const conversation = this.claudeQuery({
        prompt: userMessage,
        options: queryOptions,
      });

      // Run the SDK conversation in background, pushing messages to the queue
      const sdkPromise = (async () => {
        try {
          for await (const message of conversation) {
            if (signal?.aborted) break;

            if (message.session_id) {
              this.sessions.set(sessionId, message.session_id);
            }

            if (message.type === 'assistant' && message.message?.content) {
              for (const block of message.message.content) {
                if (block.type === 'text' && block.text) {
                  enqueue({ type: 'agent_text', content: block.text });
                } else if (block.type === 'tool_use') {
                  const toolName = block.name.replace('mcp__bitgo-wallet-tools__', '');
                  enqueue({
                    type: 'tool_call',
                    tool: toolName,
                    input: block.input as Record<string, unknown>,
                    toolCallId: block.id,
                  });
                }
              }
            } else if (message.type === 'result') {
              if ((message as any).session_id) {
                this.sessions.set(sessionId, (message as any).session_id);
              }
              // Extract text from result — could be a string or contain content blocks
              const resultData = message as any;
              if (resultData.result) {
                enqueue({ type: 'agent_text', content: String(resultData.result) });
              } else if (resultData.content) {
                const content = Array.isArray(resultData.content) ? resultData.content : [resultData.content];
                for (const block of content) {
                  if (typeof block === 'string') {
                    enqueue({ type: 'agent_text', content: block });
                  } else if (block?.text) {
                    enqueue({ type: 'agent_text', content: block.text });
                  }
                }
              }
            } else {
              // Log unhandled message types for debugging
              console.log(`SDK message type: ${message.type}`, JSON.stringify(message).slice(0, 200));
            }
          }
        } catch (err: any) {
          if (err.name !== 'AbortError' && !signal?.aborted) {
            enqueue({ type: 'error', content: `Agent error: ${err.message}` });
          }
        } finally {
          done = true;
          if (queueResolve) {
            queueResolve();
            queueResolve = null;
          }
        }
      })();

      // Yield messages from the queue as they arrive
      while (true) {
        while (queue.length > 0) {
          yield queue.shift()!;
        }
        if (done) break;
        // Wait for new messages
        await new Promise<void>((resolve) => {
          queueResolve = resolve;
          // In case something was enqueued between the while check and here
          if (queue.length > 0 || done) resolve();
        });
      }

      await sdkPromise;
    } catch (err: any) {
      console.error('Agent SDK error:', err);
      yield { type: 'error', content: `Agent error: ${err.message}` };
    }
  }

  /**
   * Mode 2: Direct tool execution (fallback when SDK not available).
   * Simple intent matching + direct tool execution without LLM.
   */
  private async *processWithDirectMode(
    userMessage: string,
    sessionId: string
  ): AsyncGenerator<AgentMessage> {
    const lower = userMessage.toLowerCase();

    if (lower.includes('list') && lower.includes('wallet')) {
      const coin = this.extractCoin(lower);
      const params: Record<string, unknown> = {};
      if (coin) params.coin = coin;
      yield { type: 'agent_text', content: coin ? `Listing ${coin} wallets...` : 'Listing all wallets...' };
      yield* this.handleToolCallDirect('direct-1', 'list_wallets', params, sessionId);
    } else if (lower.includes('balance') || lower.includes('get wallet')) {
      yield {
        type: 'agent_text',
        content: 'Please specify the coin and wallet ID. Example: "Get balance of wallet <walletId> on tbtc"',
      };
    } else if (lower.includes('create') && lower.includes('wallet')) {
      const coin = this.extractCoin(lower) || 'tbtc';
      const label = this.extractLabel(lower) || 'Agent Wallet';
      yield { type: 'agent_text', content: `Creating ${coin} wallet "${label}"...` };
      yield* this.handleToolCallDirect('direct-2', 'generate_wallet', { coin, label }, sessionId);
    } else if (lower.includes('send')) {
      yield {
        type: 'agent_text',
        content: 'To send a transaction, I need: coin, walletId, destination address, and amount.',
      };
    } else {
      yield {
        type: 'agent_text',
        content: `I understand you said: "${userMessage}"\n\nAvailable commands:\n- List wallets for [coin]\n- Create wallet [label] on [coin]\n- Get balance of wallet [id] on [coin]\n- Send [amount] from wallet [id] to [address] on [coin]\n- Show transfers for wallet [id] on [coin]\n\n**Note:** Running in direct mode (Claude Code SDK not loaded).`,
      };
    }
  }

  /**
   * Direct mode tool execution through Agent Guard.
   */
  private async *handleToolCallDirect(
    toolCallId: string,
    toolName: string,
    toolInput: Record<string, unknown>,
    sessionId: string
  ): AsyncGenerator<AgentMessage> {
    const startTime = Date.now();

    yield { type: 'tool_call', tool: toolName, input: toolInput, toolCallId };

    const guardResult: GuardResult = await this.guard.evaluate(toolName, toolInput, sessionId, this.auditLogger);
    yield { type: 'guard_result', toolCallId, result: guardResult };

    if (guardResult.decision === 'deny') {
      this.auditLogger.log({
        sessionId,
        tool: toolName,
        input: toolInput,
        guardResult,
        status: 'blocked',
        durationMs: Date.now() - startTime,
      });
      yield { type: 'tool_result', toolCallId, result: { error: 'BLOCKED', reason: guardResult.reason } };
      yield { type: 'agent_text', content: `Blocked by Agent Guard: ${guardResult.reason}` };
      return;
    }

    if (guardResult.decision === 'escalate') {
      this.auditLogger.log({
        sessionId,
        tool: toolName,
        input: toolInput,
        guardResult,
        status: 'escalated',
        durationMs: Date.now() - startTime,
      });
      const { approval, waitForDecision } = this.auditLogger.createPendingApproval(toolName, toolInput, guardResult);
      yield { type: 'approval_required', approval };
      yield { type: 'agent_text', content: `Awaiting human approval: ${guardResult.reason}` };
      const decision = await waitForDecision;
      if (decision === 'rejected') {
        yield { type: 'tool_result', toolCallId, result: { error: 'REJECTED_BY_HUMAN' } };
        yield { type: 'agent_text', content: 'Rejected by human reviewer.' };
        return;
      }
      yield { type: 'agent_text', content: 'Approved. Executing...' };
    }

    try {
      const result = await this.toolHandlers.execute(toolName, toolInput);
      this.auditLogger.log({
        sessionId,
        tool: toolName,
        input: toolInput,
        guardResult,
        executionResult: result,
        status: 'executed',
        durationMs: Date.now() - startTime,
      });
      yield { type: 'tool_result', toolCallId, result };
    } catch (err: any) {
      this.auditLogger.log({
        sessionId,
        tool: toolName,
        input: toolInput,
        guardResult,
        executionResult: { error: err.message },
        status: 'failed',
        durationMs: Date.now() - startTime,
      });
      yield { type: 'tool_result', toolCallId, result: { error: err.message } };
      yield { type: 'agent_text', content: `Error: ${err.message}` };
    }
  }

  private extractCoin(text: string): string | null {
    const coins = ['tbtc', 'teth', 'btc', 'eth', 'ltc', 'txrp', 'tsol'];
    return coins.find((c) => text.includes(c)) || null;
  }

  private extractLabel(text: string): string | null {
    const match = text.match(/(?:called|named|label)\s+"?([^"]+)"?/i);
    return match ? match[1].trim() : null;
  }
}
