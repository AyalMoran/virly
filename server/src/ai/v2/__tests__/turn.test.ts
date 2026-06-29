import {
  detectLocale,
  buildKnownCounterparties,
  pendingFromConfirmation,
  collectCalledToolNames,
  mapReadToolNames,
  deriveIntent
} from "../turn.js";
import { AIMessage, HumanMessage } from "@langchain/core/messages";
import type { CounterpartyMemory, TransferConfirmation } from "../../state.js";
import type { V2TurnOutcome } from "../toolContext.js";

// ---------------------------------------------------------------------------
// detectLocale
// ---------------------------------------------------------------------------

describe("detectLocale", () => {
  test("returns 'he' for pure Hebrew text", () => {
    expect(detectLocale("שלום")).toBe("he");
    expect(detectLocale("כמה כסף יש לי בחשבון")).toBe("he");
  });

  test("returns 'en' for pure Latin text", () => {
    expect(detectLocale("Hello world")).toBe("en");
    expect(detectLocale("How much is in my account?")).toBe("en");
  });

  test("returns 'mixed' when both Hebrew and Latin characters are present", () => {
    expect(detectLocale("שלום John")).toBe("mixed");
    expect(detectLocale("send 50 ILS לדן")).toBe("mixed");
  });

  test("returns 'unknown' for strings with neither Hebrew nor Latin characters", () => {
    expect(detectLocale("")).toBe("unknown");
    expect(detectLocale("1234 !@#$")).toBe("unknown");
    expect(detectLocale("   ")).toBe("unknown");
  });

  test("numbers alone are 'unknown'", () => {
    expect(detectLocale("500")).toBe("unknown");
  });
});

// ---------------------------------------------------------------------------
// buildKnownCounterparties
// ---------------------------------------------------------------------------

function makeMemory(
  counterparties: CounterpartyMemory["mentionedCounterparties"]
): CounterpartyMemory {
  return {
    turn: 1,
    mentionedCounterparties: counterparties
  };
}

describe("buildKnownCounterparties", () => {
  test("returns an empty array for empty memory", () => {
    expect(buildKnownCounterparties(makeMemory([]))).toEqual([]);
  });

  test("uses displayName when provided", () => {
    const result = buildKnownCounterparties(
      makeMemory([
        {
          email: "alice@example.com",
          maskedLabel: "a***@example.com",
          displayName: "Alice Smith",
          firstMentionedAtTurn: 1,
          lastReferencedAtTurn: 1
        }
      ])
    );
    expect(result).toHaveLength(1);
    expect(result[0]!.label).toBe("Alice Smith");
    expect(result[0]!.email).toBe("alice@example.com");
  });

  test("falls back to userLabel when it does not contain '@'", () => {
    const result = buildKnownCounterparties(
      makeMemory([
        {
          email: "bob@example.com",
          maskedLabel: "b***@example.com",
          userLabel: "Bob",
          firstMentionedAtTurn: 1,
          lastReferencedAtTurn: 1
        }
      ])
    );
    expect(result[0]!.label).toBe("Bob");
  });

  test("falls back to capitalized localpart when userLabel is an email", () => {
    const result = buildKnownCounterparties(
      makeMemory([
        {
          email: "carol@example.com",
          maskedLabel: "c***@example.com",
          userLabel: "carol@example.com",
          firstMentionedAtTurn: 1,
          lastReferencedAtTurn: 1
        }
      ])
    );
    expect(result[0]!.label).toBe("Carol");
  });

  test("deduplicates aliases and excludes the label itself", () => {
    const result = buildKnownCounterparties(
      makeMemory([
        {
          email: "dave@example.com",
          maskedLabel: "d***@example.com",
          displayName: "Dave",
          aliases: ["dave", "Dave", "david"],
          firstMentionedAtTurn: 1,
          lastReferencedAtTurn: 1
        }
      ])
    );
    // aliases should not include "Dave" (the label itself) and no duplicates
    expect(result[0]!.aliases).not.toContain("Dave");
    expect(result[0]!.aliases).toContain("dave");
    expect(result[0]!.aliases).toContain("david");
    const seen = new Set(result[0]!.aliases);
    expect(seen.size).toBe(result[0]!.aliases.length);
  });

  test("handles multiple counterparties", () => {
    const result = buildKnownCounterparties(
      makeMemory([
        {
          email: "a@example.com",
          maskedLabel: "a***@example.com",
          firstMentionedAtTurn: 1,
          lastReferencedAtTurn: 1
        },
        {
          email: "b@example.com",
          maskedLabel: "b***@example.com",
          firstMentionedAtTurn: 1,
          lastReferencedAtTurn: 1
        }
      ])
    );
    expect(result).toHaveLength(2);
    expect(result.map((r) => r.email)).toEqual(["a@example.com", "b@example.com"]);
  });
});

// ---------------------------------------------------------------------------
// pendingFromConfirmation
// ---------------------------------------------------------------------------

function makeConfirmation(overrides: Partial<TransferConfirmation> = {}): TransferConfirmation {
  return {
    id: "conf-1",
    version: 1,
    type: "transfer",
    status: "pending",
    recipientEmail: "recipient@example.com",
    recipientFirstName: "Alice",
    recipientLastName: "Smith",
    amount: 500,
    currency: "ILS",
    recipient: {
      email: "recipient@example.com",
      firstName: "Alice",
      lastName: "Smith",
      displayName: "Alice Smith",
      verified: true
    },
    amountDetails: { value: 500, currency: "ILS", formatted: "500 ILS" },
    reason: "rent",
    warnings: [],
    expiresAt: "2026-12-31T00:00:00.000Z",
    confirmAction: {
      method: "POST",
      path: "/api/ai/confirmations/conf-1/confirm",
      body: { action: "confirm", version: 1 }
    },
    denyAction: {
      method: "POST",
      path: "/api/ai/confirmations/conf-1/deny",
      body: { action: "deny", version: 1 }
    },
    ...overrides
  };
}

describe("pendingFromConfirmation", () => {
  test("maps card fields into PendingConfirmationMemory at the given turn", () => {
    const card = makeConfirmation();
    const result = pendingFromConfirmation(card, 3);
    expect(result.confirmationId).toBe("conf-1");
    expect(result.type).toBe("transfer");
    expect(result.status).toBe("pending");
    expect(result.recipientEmail).toBe("recipient@example.com");
    expect(result.recipientFirstName).toBe("Alice");
    expect(result.recipientLastName).toBe("Smith");
    expect(result.amount).toBe(500);
    expect(result.currency).toBe("ILS");
    expect(result.reason).toBe("rent");
    expect(result.turnCreated).toBe(3);
    expect(result.version).toBe(1);
    expect(result.expiresAt).toBe("2026-12-31T00:00:00.000Z");
  });

  test("preserves null optional fields", () => {
    const card = makeConfirmation({ recipientFirstName: null, recipientLastName: null, reason: null });
    const result = pendingFromConfirmation(card, 1);
    expect(result.recipientFirstName).toBeNull();
    expect(result.recipientLastName).toBeNull();
    expect(result.reason).toBeNull();
  });

  test("uses the provided turn number, not a constant", () => {
    const card = makeConfirmation();
    expect(pendingFromConfirmation(card, 0).turnCreated).toBe(0);
    expect(pendingFromConfirmation(card, 99).turnCreated).toBe(99);
  });
});

// ---------------------------------------------------------------------------
// collectCalledToolNames
// ---------------------------------------------------------------------------

describe("collectCalledToolNames", () => {
  test("returns empty array for empty message list", () => {
    expect(collectCalledToolNames([])).toEqual([]);
  });

  test("returns empty array when no AI messages contain tool calls", () => {
    const messages = [new HumanMessage("hi")];
    expect(collectCalledToolNames(messages)).toEqual([]);
  });

  test("collects tool call names from AI messages", () => {
    const ai = new AIMessage({
      content: "",
      tool_calls: [
        { id: "tc1", name: "getBalance", args: {} },
        { id: "tc2", name: "searchTransactions", args: {} }
      ]
    });
    expect(collectCalledToolNames([ai])).toEqual(["getBalance", "searchTransactions"]);
  });

  test("collects tool calls from multiple AI messages in order", () => {
    const ai1 = new AIMessage({
      content: "",
      tool_calls: [{ id: "t1", name: "getBalance", args: {} }]
    });
    const ai2 = new AIMessage({
      content: "",
      tool_calls: [{ id: "t2", name: "searchTransactions", args: {} }]
    });
    const result = collectCalledToolNames([ai1, new HumanMessage("ok"), ai2]);
    expect(result).toEqual(["getBalance", "searchTransactions"]);
  });
});

// ---------------------------------------------------------------------------
// mapReadToolNames
// ---------------------------------------------------------------------------

describe("mapReadToolNames", () => {
  test("returns empty array for empty input", () => {
    expect(mapReadToolNames([])).toEqual([]);
  });

  test("maps known v2 tool names to v1 AssistantToolName equivalents", () => {
    expect(mapReadToolNames(["getBalance"])).toEqual(["getAccountBalance"]);
    expect(mapReadToolNames(["getAccounts"])).toEqual(["getUserAccounts"]);
    expect(mapReadToolNames(["findCounterparty"])).toEqual(["resolveCounterpartyCandidates"]);
  });

  test("omits unknown tool names that have no mapping", () => {
    expect(mapReadToolNames(["prepareTransfer", "unknownTool"])).toEqual([]);
  });

  test("maps multiple names in order, skipping unmapped entries", () => {
    const result = mapReadToolNames(["getBalance", "unknownTool", "searchTransactions"]);
    expect(result).toEqual(["getAccountBalance", "searchTransactions"]);
  });

  test("maps all known tool names without error", () => {
    const knownV2Names = [
      "getAccounts",
      "getBalance",
      "searchTransactions",
      "getTransactionReceipt",
      "findCounterparty",
      "getCounterpartySummary",
      "getCounterpartyTransactions",
      "getTotals",
      "getRecentSent",
      "getRecentReceived",
      "getLastSent",
      "getVerifiedRecipients",
      "getTransferLimits",
      "checkTransferEligibility",
      "getTransferQuote",
      "getDailyTransferUsage",
      "getPendingTransfers"
    ];
    const result = mapReadToolNames(knownV2Names);
    expect(result.length).toBe(knownV2Names.length);
  });
});

// ---------------------------------------------------------------------------
// deriveIntent
// ---------------------------------------------------------------------------

describe("deriveIntent", () => {
  function outcome(overrides: Partial<V2TurnOutcome> = {}): V2TurnOutcome {
    return { uiBlocks: [], ...overrides };
  }

  test("returns 'general_help' when outcome has no confirmation or clarification", () => {
    expect(deriveIntent(outcome())).toBe("general_help");
  });

  test("returns 'transfer_prepare' when there is a confirmation", () => {
    const card = makeConfirmation();
    expect(deriveIntent(outcome({ confirmation: card }))).toBe("transfer_prepare");
  });

  test("returns 'transfer_modify_pending' when both confirmation and supersededConfirmationId are set", () => {
    const card = makeConfirmation();
    expect(
      deriveIntent(outcome({ confirmation: card, supersededConfirmationId: "old-id" }))
    ).toBe("transfer_modify_pending");
  });

  test("returns 'transfer_prepare' when there is a clarification but no confirmation", () => {
    const clarification = {
      reason: "missing_recipient" as const,
      message: "Who should I send to?",
      expectedReplyType: "recipient" as const
    };
    expect(deriveIntent(outcome({ clarification }))).toBe("transfer_prepare");
  });

  test("confirmation takes precedence over clarification for transfer_prepare", () => {
    const card = makeConfirmation();
    const clarification = {
      reason: "missing_amount" as const,
      message: "How much?",
      expectedReplyType: "amount" as const
    };
    expect(deriveIntent(outcome({ confirmation: card, clarification }))).toBe("transfer_prepare");
  });
});
