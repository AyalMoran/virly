/**
 * Streaming event plumbing (design §7 / Phase 7).
 *
 * Tools emit semantic `custom` events through `config.writer` ("Checking your
 * balance", a balance card the moment its tool returns). The graph is streamed
 * with `streamMode: ["messages", "custom", "updates"]`; {@link mapStreamChunk}
 * turns each chunk into an additive SSE event (`token` / `status` / `block`) on
 * top of the existing accepted/status/result/completed contract.
 */
import type { LangGraphRunnableConfig } from "@langchain/langgraph";

import type { AssistantResponseBlock } from "../responseBlocks.js";

export type V2CustomEvent =
  | { kind: "status"; label: string }
  | { kind: "block"; block: AssistantResponseBlock };

export type V2StreamWriter = (event: V2CustomEvent) => void;

/** The custom-stream writer LangGraph injects on the run config, if streaming. */
export function statusWriter(
  config: LangGraphRunnableConfig
): V2StreamWriter | undefined {
  const writer = (config as { writer?: (chunk: unknown) => void }).writer;
  return writer ? (event: V2CustomEvent) => writer(event) : undefined;
}

export type V2SseEvent =
  | { event: "token"; data: { text: string } }
  | { event: "status"; data: { label: string } }
  | { event: "block"; data: { block: AssistantResponseBlock } };

/** Map one `graph.stream` chunk (mode + payload) to additive SSE events. */
export function mapStreamChunk(mode: string, payload: unknown): V2SseEvent[] {
  if (mode === "messages") {
    const tuple = payload as [{ content?: unknown }, unknown];
    const chunk = Array.isArray(tuple) ? tuple[0] : undefined;
    const text = typeof chunk?.content === "string" ? chunk.content : "";
    return text ? [{ event: "token", data: { text } }] : [];
  }
  if (mode === "custom") {
    const event = payload as V2CustomEvent;
    if (event?.kind === "status") {
      return [{ event: "status", data: { label: event.label } }];
    }
    if (event?.kind === "block") {
      return [{ event: "block", data: { block: event.block } }];
    }
  }
  return [];
}
