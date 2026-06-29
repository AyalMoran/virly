import {
  getAuthRoute,
  getResumeRoute,
  getIntentRoute,
  getParseRoute,
  hasClarification
} from "../graphRoutes.js";
import type { AssistantGraphState } from "../state.js";

function baseState(overrides: Partial<AssistantGraphState> = {}): AssistantGraphState {
  return {
    conversationId: "test-convo",
    assistantId: "oshri",
    messages: [],
    counterpartyMemory: {
      turn: 0,
      mentionedCounterparties: []
    },
    currentTurn: 1,
    requestedToolNames: [],
    executedToolNames: [],
    toolResults: [],
    ...overrides
  };
}

describe("getAuthRoute", () => {
  test("returns 'authenticated' when userId is present", () => {
    expect(getAuthRoute(baseState({ userId: "507f1f77bcf86cd799439011" }))).toBe("authenticated");
  });

  test("returns 'unauthenticated' when userId is undefined", () => {
    expect(getAuthRoute(baseState({ userId: undefined }))).toBe("unauthenticated");
  });

  test("returns 'unauthenticated' when userId is empty string", () => {
    expect(getAuthRoute(baseState({ userId: "" }))).toBe("unauthenticated");
  });
});

describe("getResumeRoute", () => {
  test("returns 'clarification_reply' when counterpartyMemory has a clarification", () => {
    const state = baseState({
      counterpartyMemory: {
        turn: 1,
        mentionedCounterparties: [],
        clarification: {
          reason: "missing_recipient",
          message: "Who should I send it to?",
          expectedReplyType: "recipient"
        }
      }
    });
    expect(getResumeRoute(state)).toBe("clarification_reply");
  });

  test("returns 'normal_turn' when counterpartyMemory has no clarification", () => {
    expect(getResumeRoute(baseState())).toBe("normal_turn");
  });

  test("returns 'normal_turn' when clarification is null", () => {
    const state = baseState({
      counterpartyMemory: {
        turn: 0,
        mentionedCounterparties: [],
        clarification: null
      }
    });
    expect(getResumeRoute(state)).toBe("normal_turn");
  });
});

describe("getIntentRoute", () => {
  test("returns 'read_only' for balance_inquiry", () => {
    expect(getIntentRoute(baseState({ detectedIntent: "balance_inquiry" }))).toBe("read_only");
  });

  test("returns 'read_only' for recent_transactions", () => {
    expect(getIntentRoute(baseState({ detectedIntent: "recent_transactions" }))).toBe("read_only");
  });

  test("returns 'prepare_transfer' for transfer_prepare", () => {
    expect(getIntentRoute(baseState({ detectedIntent: "transfer_prepare" }))).toBe("prepare_transfer");
  });

  test("returns 'modify_pending' for transfer_modify_pending", () => {
    expect(getIntentRoute(baseState({ detectedIntent: "transfer_modify_pending" }))).toBe("modify_pending");
  });

  test("returns 'pending_status' for pending_confirmation_status", () => {
    expect(getIntentRoute(baseState({ detectedIntent: "pending_confirmation_status" }))).toBe("pending_status");
  });

  test("returns 'pending_status' for transfer_cancel_pending", () => {
    expect(getIntentRoute(baseState({ detectedIntent: "transfer_cancel_pending" }))).toBe("pending_status");
  });

  test("returns 'pending_status' for pending_ai_transfers", () => {
    expect(getIntentRoute(baseState({ detectedIntent: "pending_ai_transfers" }))).toBe("pending_status");
  });

  test("returns 'unsafe_or_help' for unsafe_request", () => {
    expect(getIntentRoute(baseState({ detectedIntent: "unsafe_request" }))).toBe("unsafe_or_help");
  });

  test("returns 'unsafe_or_help' for general_help", () => {
    expect(getIntentRoute(baseState({ detectedIntent: "general_help" }))).toBe("unsafe_or_help");
  });

  test("returns 'unsafe_or_help' when refusalReason is present regardless of intent", () => {
    expect(
      getIntentRoute(baseState({ detectedIntent: "balance_inquiry", refusalReason: "chat_text_is_not_authorization" }))
    ).toBe("unsafe_or_help");
  });

  test("returns 'unsupported' for unsupported intent", () => {
    expect(getIntentRoute(baseState({ detectedIntent: "unsupported" }))).toBe("unsupported");
  });

  test("returns 'unsupported' when detectedIntent is undefined", () => {
    expect(getIntentRoute(baseState({ detectedIntent: undefined }))).toBe("unsupported");
  });

  test("returns 'read_only' for transfer_limits", () => {
    expect(getIntentRoute(baseState({ detectedIntent: "transfer_limits" }))).toBe("read_only");
  });

  test("returns 'read_only' for transaction_stats", () => {
    expect(getIntentRoute(baseState({ detectedIntent: "transaction_stats" }))).toBe("read_only");
  });
});

describe("getParseRoute", () => {
  test("returns 'transfer_related' for transfer_prepare", () => {
    expect(getParseRoute(baseState({ detectedIntent: "transfer_prepare" }))).toBe("transfer_related");
  });

  test("returns 'transfer_related' for transfer_modify_pending", () => {
    expect(getParseRoute(baseState({ detectedIntent: "transfer_modify_pending" }))).toBe("transfer_related");
  });

  test("returns 'non_transfer' for balance_inquiry", () => {
    expect(getParseRoute(baseState({ detectedIntent: "balance_inquiry" }))).toBe("non_transfer");
  });

  test("returns 'non_transfer' for recent_transactions", () => {
    expect(getParseRoute(baseState({ detectedIntent: "recent_transactions" }))).toBe("non_transfer");
  });

  test("returns 'non_transfer' when detectedIntent is undefined", () => {
    expect(getParseRoute(baseState())).toBe("non_transfer");
  });

  test("returns 'non_transfer' for pending_confirmation_status", () => {
    expect(getParseRoute(baseState({ detectedIntent: "pending_confirmation_status" }))).toBe("non_transfer");
  });
});

describe("hasClarification", () => {
  test("returns true when clarificationRequest is present", () => {
    const state = baseState({
      clarificationRequest: {
        reason: "missing_amount",
        message: "How much do you want to send?",
        expectedReplyType: "amount"
      }
    });
    expect(hasClarification(state)).toBe(true);
  });

  test("returns true when clarificationMessage is present", () => {
    expect(hasClarification(baseState({ clarificationMessage: "Please clarify." }))).toBe(true);
  });

  test("returns false when neither clarificationRequest nor clarificationMessage is present", () => {
    expect(hasClarification(baseState())).toBe(false);
  });

  test("returns false when clarificationRequest is undefined and message is empty string", () => {
    expect(hasClarification(baseState({ clarificationMessage: "" }))).toBe(false);
  });
});
