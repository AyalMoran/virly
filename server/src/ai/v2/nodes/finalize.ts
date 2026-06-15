/**
 * `finalize` — no model call (design §4.1).
 *
 * Collects the assistant's final text (the last AIMessage) and folds the per-turn
 * outcome the money tools recorded (confirmation card / clarification / superseded
 * id) into state, so the graph entry can assemble the `RunAssistantResult`.
 */
import type { BaseMessage } from "@langchain/core/messages";
import type { LangGraphRunnableConfig } from "@langchain/langgraph";

import { isAiMessage } from "../messages.js";
import { getConfigurable } from "../toolContext.js";
import type { V2AgentStateType } from "../state.js";

/** Extract plain text from a message whose content may be a string or parts. */
export function messageText(message: BaseMessage | undefined): string {
  if (!message) {
    return "";
  }
  const { content } = message;
  if (typeof content === "string") {
    return content;
  }
  return content
    .map((part) =>
      typeof part === "string"
        ? part
        : "text" in part && typeof part.text === "string"
          ? part.text
          : ""
    )
    .join("");
}

export async function finalizeNode(
  state: V2AgentStateType,
  config: LangGraphRunnableConfig
): Promise<Partial<V2AgentStateType>> {
  const cfg = getConfigurable(config);
  // Match AIMessage AND the streaming AIMessageChunk (see ../messages.ts).
  const lastAi = [...state.messages].reverse().find(isAiMessage);

  const outcome = cfg.turnOutcome;
  return {
    responseMessage: messageText(lastAi).trim(),
    confirmation: outcome.confirmation,
    clarification: outcome.clarification,
    supersededConfirmationId: outcome.supersededConfirmationId
  };
}
