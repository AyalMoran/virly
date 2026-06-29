/**
 * `persist` — turn tail (design §4.1).
 *
 * The checkpointer/`conversationStore` persist the thread (handled by the graph
 * entry, which owns the store I/O). Long-term Store upserts now run in the hitl.ts
 * entry points; rolling-summary management now lives in the summarize node. This
 * node is currently a pass-through that keeps the topology explicit and ready to
 * grow with future tail-of-turn concerns.
 */
import type { LangGraphRunnableConfig } from "@langchain/langgraph";

import type { V2AgentStateType } from "../state.js";

export async function persistNode(
  _state: V2AgentStateType,
  _config: LangGraphRunnableConfig
): Promise<Partial<V2AgentStateType>> {
  return {};
}
