/**
 * v2 graph state (design §3): message-centric.
 *
 * `messages` is the conversation (the `add_messages` reducer threads tool calls
 * and results naturally). The remaining channels are the turn's surfaced output,
 * populated by `finalize` from the per-turn outcome the money tools recorded.
 */
import { Annotation, MessagesAnnotation } from "@langchain/langgraph";

import type { ClarificationRequest, TransferConfirmation } from "../state.js";

export const V2AgentState = Annotation.Root({
  ...MessagesAnnotation.spec,

  /** The assistant's final user-facing text (from the last AIMessage). */
  responseMessage: Annotation<string | undefined>(),
  /** A prepared transfer confirmation card, if one was built this turn. */
  confirmation: Annotation<TransferConfirmation | undefined>(),
  /** A clarifying question to surface, if the turn needs more from the user. */
  clarification: Annotation<ClarificationRequest | undefined>(),
  /** The id of a card this turn's modification superseded. */
  supersededConfirmationId: Annotation<string | undefined>(),

  // --- Phase 5: human-in-the-loop transfer execution (resumable graph only) ---
  /** Filled on resume from the confirmation card's Confirm/Deny click. */
  confirmationOutcome: Annotation<"confirmed" | "denied" | undefined>(),
  /** The resume payload (version + idempotency) carried to executeTransfer. */
  resumeMeta: Annotation<
    { version: number; idempotencyKey?: string } | undefined
  >(),
  /** The backend transfer-execution result, surfaced back to the API. */
  transferResult: Annotation<unknown | undefined>()
});

export type V2AgentStateType = typeof V2AgentState.State;
