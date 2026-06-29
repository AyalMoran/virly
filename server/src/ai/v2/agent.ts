/**
 * The agent node — the brain (design §4.1).
 *
 * A `ChatOpenAI` bound to the full toolbelt with parallel tool calls, invoked
 * with the per-turn system prompt followed by the thread. It returns one
 * `AIMessage` that either carries `tool_calls` (the graph runs them and loops
 * back) or is the final answer.
 */
import { SystemMessage } from "@langchain/core/messages";
import type { LangGraphRunnableConfig } from "@langchain/langgraph";
import type { ChatOpenAI } from "@langchain/openai";

import { buildSystemPrompt } from "./prompt.js";
import { getConfigurable } from "./toolContext.js";
import { allTools } from "./tools/index.js";
import type { V2AgentStateType } from "./state.js";

export function buildAgentNode(model: ChatOpenAI) {
  const boundModel = model.bindTools(allTools, { parallel_tool_calls: true });

  return async function agent(
    state: V2AgentStateType,
    config: LangGraphRunnableConfig
  ): Promise<Partial<V2AgentStateType>> {
    const cfg = getConfigurable(config);
    const system = buildSystemPrompt({
      assistantId: cfg.assistantId,
      locale: cfg.locale,
      knownCounterparties: cfg.knownCounterparties,
      pendingConfirmation: cfg.pendingConfirmation,
      now: cfg.now,
      timezone: cfg.timezone,
      // Phase 6: the summary lives in checkpointed state, maintained by `summarize`.
      runningSummary: state.runningSummary
    });

    // Send only the boundary-safe recent window; older turns are represented by
    // `runningSummary` in the system prompt. The full thread stays in the
    // checkpointer untouched.
    const covered = state.summaryCoveredCount ?? 0;
    const view = state.messages.slice(covered);

    const aiMessage = await boundModel.invoke(
      [new SystemMessage(system), ...view],
      config
    );

    return { messages: [aiMessage] };
  };
}
