/**
 * `summarize` — the token-budgeted context view (design §6.2, langmem-style).
 *
 * Runs before every agent call (entry and after each tool hop). When the thread
 * exceeds `triggerTokens`, it folds the messages between `summaryCoveredCount`
 * and the recent-window boundary into `runningSummary`, then advances the pointer.
 *
 * Three invariants that make this safe and modern:
 *  - OFF-CHANNEL: it never mutates `messages`; compression is expressed only via
 *    `runningSummary` (a string, surfaced in the system prompt) and
 *    `summaryCoveredCount` (a pointer the agent slices on). The checkpointer keeps
 *    the full thread intact.
 *  - INCREMENTAL: it only summarizes messages newer than the existing pointer, so
 *    already-folded turns are never re-summarized (langmem `summarized_message_ids`).
 *  - BOUNDARY-SAFE: the recent window starts on a HumanMessage, so an assistant
 *    tool-call and its ToolMessage replies are never split (OpenAI rejects orphans).
 */
import { HumanMessage } from "@langchain/core/messages";
import type { BaseMessage } from "@langchain/core/messages";
import type { LangGraphRunnableConfig } from "@langchain/langgraph";
import type { ChatOpenAI } from "@langchain/openai";

import { countMessageTokens, messageTokens } from "../memory/tokens.js";
import { isAiMessage } from "../messages.js";
import { messageText } from "./finalize.js";
import type { V2AgentStateType } from "../state.js";

/** Above this many thread tokens, a turn folds older messages into the summary. */
export const SUMMARY_TRIGGER_TOKENS = 3000;
/** Token budget for the verbatim recent window kept in the prompt. */
export const SUMMARY_RECENT_TOKENS = 1500;

function roleOf(message: BaseMessage): string {
  if (message instanceof HumanMessage) return "User";
  if (isAiMessage(message)) return "Assistant";
  return "Tool";
}

/**
 * Index where the recent (verbatim) window starts: walk back from the end until
 * the running token total exceeds `recentTokens`, then snap to the nearest
 * HumanMessage at or before that point so tool groups stay intact.
 */
export function recentBoundaryIndex(
  messages: BaseMessage[],
  recentTokens: number
): number {
  if (messages.length === 0) {
    return 0;
  }
  let tokens = 0;
  let start = messages.length - 1;
  for (let i = messages.length - 1; i >= 0; i -= 1) {
    tokens += messageTokens(messages[i]);
    start = i;
    if (tokens > recentTokens) {
      break;
    }
    // When the whole thread fits within recentTokens, the loop runs to
    // completion with start reaching 0. The caller treats boundary <= covered
    // as a no-op fold, so nothing is summarized in that case.
  }
  let snapped = start;
  while (snapped > 0 && !(messages[snapped] instanceof HumanMessage)) {
    snapped -= 1;
  }
  return snapped;
}

export function buildSummarizationNode(
  model: ChatOpenAI,
  opts: { triggerTokens?: number; recentTokens?: number } = {}
) {
  const triggerTokens = opts.triggerTokens ?? SUMMARY_TRIGGER_TOKENS;
  const recentTokens = opts.recentTokens ?? SUMMARY_RECENT_TOKENS;

  return async function summarize(
    state: V2AgentStateType,
    _config?: LangGraphRunnableConfig
  ): Promise<Partial<V2AgentStateType>> {
    const messages = state.messages ?? [];
    if (countMessageTokens(messages) <= triggerTokens) {
      return {};
    }

    const covered = state.summaryCoveredCount ?? 0;
    const boundary = recentBoundaryIndex(messages, recentTokens);
    if (boundary <= covered) {
      // Nothing new to fold (already summarized up to the window) or no safe
      // boundary exists yet — leave the view as the full slice from `covered`.
      return {};
    }

    const toFold = messages.slice(covered, boundary);
    const transcript = toFold
      .map((message) => `${roleOf(message)}: ${messageText(message)}`)
      .join("\n");
    const previousSummary = state.runningSummary;

    try {
      const result = await model.invoke([
        [
          "system",
          "Summarize this banking-assistant conversation so far in 2-4 sentences: " +
            "who the user has been transferring to / asking about, key amounts and " +
            "totals mentioned, any open thread or stated preference. Be factual and terse."
        ],
        [
          "human",
          `${previousSummary ? `Earlier summary:\n${previousSummary}\n\n` : ""}Conversation:\n${transcript}`
        ]
      ]);
      const summary = messageText(result).trim();
      if (!summary) {
        return {};
      }
      return { runningSummary: summary, summaryCoveredCount: boundary };
    } catch {
      // Degrade: leave the pointer and summary untouched so a later hop/turn
      // retries. The agent still sends the (un-folded) slice from `covered`.
      return {};
    }
  };
}
