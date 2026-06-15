// Created: 2026-06-15

/**
 * Message-type helpers robust to streaming.
 *
 * When the graph runs under `graph.stream(streamMode: ["messages", ...])`, the
 * model is executed in streaming mode and the agent node's message is an
 * `AIMessageChunk`, NOT an `AIMessage`. `AIMessageChunk` is a separate class —
 * `x instanceof AIMessage` is FALSE for it. Routing and response extraction must
 * therefore test the message *type* ("ai") rather than the concrete class, or the
 * streamed reply is silently dropped (and tool-call chunks are mis-routed).
 */
import { AIMessage, AIMessageChunk } from "@langchain/core/messages";
import type { BaseMessage } from "@langchain/core/messages";
import type { ToolCall } from "@langchain/core/messages/tool";

/** True for both `AIMessage` and the streaming `AIMessageChunk`. */
export function isAiMessage(message: BaseMessage | undefined): boolean {
  if (!message) {
    return false;
  }
  if (message instanceof AIMessage || message instanceof AIMessageChunk) {
    return true;
  }
  const getType = (message as { getType?: () => string }).getType;
  return typeof getType === "function" && getType.call(message) === "ai";
}

/** The tool calls on an AI message/chunk (empty for any non-AI message). */
export function aiToolCalls(message: BaseMessage | undefined): ToolCall[] {
  if (!isAiMessage(message)) {
    return [];
  }
  return (message as AIMessage).tool_calls ?? [];
}
