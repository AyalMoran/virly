/**
 * `prepare` — runs once per turn before the model (design §4.1).
 *
 * Identity, locale, known counterparties, the active card, and date are resolved
 * by the graph entry and carried in `config.configurable` (the entry owns the
 * `conversationStore`/`Store` I/O). This node is the in-graph seam where the
 * long-term `Store` snapshot is hydrated into the prompt context (Phase 6); for
 * the read-only loop it is a pass-through. It never classifies or extracts.
 */
import type { LangGraphRunnableConfig } from "@langchain/langgraph";

import { getConfigurable } from "../toolContext.js";
import type { V2AgentStateType } from "../state.js";

export async function prepareNode(
  _state: V2AgentStateType,
  config: LangGraphRunnableConfig
): Promise<Partial<V2AgentStateType>> {
  // Validates that identity is present; throws early otherwise.
  getConfigurable(config);
  return {};
}
