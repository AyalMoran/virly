import type { AssistantGraphState } from "./state.js";

export type AuthRoute = "authenticated" | "unauthenticated";

export type ResumeRoute = "clarification_reply" | "normal_turn";

export type IntentRoute =
  | "read_only"
  | "prepare_transfer"
  | "modify_pending"
  | "pending_status"
  | "unsafe_or_help"
  | "unsupported";

export type ParseRoute = "transfer_related" | "non_transfer";

export type ReferenceRoute = "resolved" | "needs_clarification";

export type TransferPreparationRoute =
  | "continue"
  | "needs_clarification"
  | "ready"
  | "invalid";

export type ResponseRoute = "compose" | "save";

export function getAuthRoute(state: AssistantGraphState): AuthRoute {
  return state.userId ? "authenticated" : "unauthenticated";
}

export function getResumeRoute(state: AssistantGraphState): ResumeRoute {
  return state.counterpartyMemory?.clarification
    ? "clarification_reply"
    : "normal_turn";
}

export function getIntentRoute(state: AssistantGraphState): IntentRoute {
  const intent = state.detectedIntent ?? "unsupported";

  if (
    state.refusalReason ||
    intent === "unsafe_request" ||
    intent === "general_help"
  ) {
    return "unsafe_or_help";
  }

  if (intent === "transfer_prepare") {
    return "prepare_transfer";
  }

  if (intent === "transfer_modify_pending") {
    return "modify_pending";
  }

  if (
    intent === "pending_confirmation_status" ||
    intent === "transfer_cancel_pending" ||
    intent === "pending_ai_transfers"
  ) {
    return "pending_status";
  }

  if (intent === "unsupported") {
    return "unsupported";
  }

  return "read_only";
}

export function getParseRoute(state: AssistantGraphState): ParseRoute {
  return state.detectedIntent === "transfer_prepare" ||
    state.detectedIntent === "transfer_modify_pending"
    ? "transfer_related"
    : "non_transfer";
}

export function hasClarification(state: AssistantGraphState): boolean {
  return Boolean(state.clarificationRequest || state.clarificationMessage);
}
