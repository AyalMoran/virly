import {
  classifyAssistantIntentDeterministic,
  getReadOnlyToolsForIntent,
  isReadOnlyToolName,
  intentToReadOnlyTools
} from "../router.js";
import { assistantIntentValues, assistantToolNames } from "../state.js";

describe("isReadOnlyToolName", () => {
  test("returns true for valid tool names", () => {
    expect(isReadOnlyToolName("getUserAccounts")).toBe(true);
    expect(isReadOnlyToolName("getAccountBalance")).toBe(true);
    expect(isReadOnlyToolName("getRecentTransactions")).toBe(true);
    expect(isReadOnlyToolName("searchTransactions")).toBe(true);
    expect(isReadOnlyToolName("getVerifiedRecipients")).toBe(true);
  });

  test("returns false for unknown tool names", () => {
    expect(isReadOnlyToolName("")).toBe(false);
    expect(isReadOnlyToolName("executeTransfer")).toBe(false);
    expect(isReadOnlyToolName("unknownTool")).toBe(false);
  });

  test("returns true for every value in assistantToolNames", () => {
    for (const name of assistantToolNames) {
      expect(isReadOnlyToolName(name)).toBe(true);
    }
  });
});

describe("getReadOnlyToolsForIntent", () => {
  test("returns tools for balance_inquiry", () => {
    expect(getReadOnlyToolsForIntent("balance_inquiry")).toStrictEqual([
      "getUserAccounts",
      "getAccountBalance"
    ]);
  });

  test("returns tools for recent_transactions", () => {
    expect(getReadOnlyToolsForIntent("recent_transactions")).toStrictEqual([
      "getRecentTransactions"
    ]);
  });

  test("returns empty array for transfer_prepare", () => {
    expect(getReadOnlyToolsForIntent("transfer_prepare")).toStrictEqual([]);
  });

  test("returns empty array for unsafe_request", () => {
    expect(getReadOnlyToolsForIntent("unsafe_request")).toStrictEqual([]);
  });

  test("returns empty array for general_help", () => {
    expect(getReadOnlyToolsForIntent("general_help")).toStrictEqual([]);
  });

  test("intentToReadOnlyTools covers every intent value", () => {
    for (const intent of assistantIntentValues) {
      expect(intentToReadOnlyTools).toHaveProperty(intent);
      expect(Array.isArray(intentToReadOnlyTools[intent])).toBe(true);
    }
  });
});

describe("classifyAssistantIntentDeterministic", () => {
  describe("unsafe request detection", () => {
    test("returns unsafe_request for 'send without confirmation'", () => {
      const result = classifyAssistantIntentDeterministic(
        "send money without confirmation"
      );
      expect(result.intent).toBe("unsafe_request");
      expect(result.refusalReason).toBe("chat_text_is_not_authorization");
    });

    test("returns unsafe_request for 'bypass verification'", () => {
      const result = classifyAssistantIntentDeterministic("bypass verification please");
      expect(result.intent).toBe("unsafe_request");
    });
  });

  describe("balance_inquiry", () => {
    test("detects English 'What is my balance?'", () => {
      expect(classifyAssistantIntentDeterministic("What is my balance?").intent).toBe(
        "balance_inquiry"
      );
    });

    test("detects English 'available funds'", () => {
      expect(
        classifyAssistantIntentDeterministic("How much available funds do I have?").intent
      ).toBe("balance_inquiry");
    });

    test("detects Hebrew 'כמה יש לי'", () => {
      expect(classifyAssistantIntentDeterministic("כמה כסף יש לי?").intent).toBe(
        "balance_inquiry"
      );
    });
  });

  describe("transfer_prepare", () => {
    test("detects 'send 100 ILS to alice'", () => {
      expect(
        classifyAssistantIntentDeterministic("send 100 ILS to alice@example.com").intent
      ).toBe("transfer_prepare");
    });

    test("detects 'transfer money to bob'", () => {
      expect(
        classifyAssistantIntentDeterministic("transfer money to bob@example.com").intent
      ).toBe("transfer_prepare");
    });

    test("detects Hebrew transfer phrasing", () => {
      expect(
        classifyAssistantIntentDeterministic("תעביר 200 שקל לאורי").intent
      ).toBe("transfer_prepare");
    });
  });

  describe("transfer_limits", () => {
    test("detects 'limit' keyword", () => {
      expect(classifyAssistantIntentDeterministic("what is my transfer limit?").intent).toBe(
        "transfer_limits"
      );
    });

    test("detects 'maximum' keyword", () => {
      expect(
        classifyAssistantIntentDeterministic("what is the maximum I can send?").intent
      ).toBe("transfer_limits");
    });
  });

  describe("recent_transactions", () => {
    test("detects 'recent transactions'", () => {
      expect(
        classifyAssistantIntentDeterministic("show my recent transactions").intent
      ).toBe("recent_transactions");
    });

    test("detects 'activity'", () => {
      expect(classifyAssistantIntentDeterministic("show my recent activity").intent).toBe(
        "recent_transactions"
      );
    });
  });

  describe("general_help", () => {
    test("detects 'help'", () => {
      expect(classifyAssistantIntentDeterministic("help me").intent).toBe("general_help");
    });

    test("detects 'what can you do'", () => {
      expect(
        classifyAssistantIntentDeterministic("what can you do?").intent
      ).toBe("general_help");
    });
  });

  describe("unsupported fallback", () => {
    test("returns unsupported for unknown message", () => {
      expect(
        classifyAssistantIntentDeterministic("some totally unrelated message text xyz abc").intent
      ).toBe("unsupported");
    });

    test("returns unsupported for empty string", () => {
      expect(classifyAssistantIntentDeterministic("").intent).toBe("unsupported");
    });
  });

  describe("pending_confirmation_status", () => {
    test("detects 'yes' confirmation", () => {
      expect(classifyAssistantIntentDeterministic("yes").intent).toBe(
        "pending_confirmation_status"
      );
    });

    test("detects 'confirm'", () => {
      expect(classifyAssistantIntentDeterministic("confirm please").intent).toBe(
        "pending_confirmation_status"
      );
    });

    test("detects 'go ahead'", () => {
      expect(classifyAssistantIntentDeterministic("go ahead and send it").intent).toBe(
        "pending_confirmation_status"
      );
    });
  });

  describe("transfer_cancel_pending", () => {
    test("detects 'cancel transfer'", () => {
      expect(
        classifyAssistantIntentDeterministic("cancel transfer please").intent
      ).toBe("transfer_cancel_pending");
    });

    test("detects 'stop payment'", () => {
      expect(
        classifyAssistantIntentDeterministic("stop payment confirmation").intent
      ).toBe("transfer_cancel_pending");
    });
  });

  describe("transfer_modify_pending — active pending context", () => {
    test("detects 'actually send to' when pending confirmation is active", () => {
      const context = {
        counterpartyMemory: {
          turn: 1,
          mentionedCounterparties: [],
          pendingConfirmation: {
            confirmationId: "abc",
            type: "transfer" as const,
            status: "pending" as const,
            createdAt: "2024-01-01T00:00:00Z",
            expiresAt: "2024-01-01T01:00:00Z",
            recipientEmail: "alice@example.com",
            amount: 100,
            currency: "ILS" as const,
            turnCreated: 1,
            version: 1
          }
        }
      };
      const result = classifyAssistantIntentDeterministic(
        "actually send it to bob instead",
        context
      );
      expect(result.intent).toBe("transfer_modify_pending");
    });
  });

  describe("transaction_search", () => {
    test("detects 'find transactions over 500'", () => {
      expect(
        classifyAssistantIntentDeterministic("find transactions over 500").intent
      ).toBe("transaction_search");
    });
  });

  describe("daily_transfer_usage", () => {
    test("detects 'daily limit'", () => {
      expect(
        classifyAssistantIntentDeterministic("what is my daily limit?").intent
      ).toBe("daily_transfer_usage");
    });

    test("detects 'how much can I still send today'", () => {
      expect(
        classifyAssistantIntentDeterministic("how much can I still send today").intent
      ).toBe("daily_transfer_usage");
    });
  });

  describe("transfer_eligibility", () => {
    test("detects 'can I send 500'", () => {
      expect(
        classifyAssistantIntentDeterministic("can I send 500 ILS to someone?").intent
      ).toBe("transfer_eligibility");
    });
  });

  describe("transfer_quote", () => {
    test("detects 'quote send'", () => {
      expect(
        classifyAssistantIntentDeterministic("give me a quote to send 100 USD").intent
      ).toBe("transfer_quote");
    });
  });

  describe("pending_ai_transfers", () => {
    test("detects 'pending transfers'", () => {
      expect(
        classifyAssistantIntentDeterministic("show me my pending transfers").intent
      ).toBe("pending_ai_transfers");
    });

    test("detects 'waiting confirmations'", () => {
      expect(
        classifyAssistantIntentDeterministic("show waiting confirmations").intent
      ).toBe("pending_ai_transfers");
    });
  });

  describe("counterparty intents", () => {
    test("detects 'last sent counterparty' from English", () => {
      expect(
        classifyAssistantIntentDeterministic("who was the last person I sent money to?").intent
      ).toBe("last_sent_counterparty");
    });

    test("detects 'recent sent counterparties'", () => {
      expect(
        classifyAssistantIntentDeterministic("show me the last 5 people I paid").intent
      ).toBe("recent_sent_counterparties");
    });

    test("detects 'counterparty_total_sent' from English", () => {
      expect(
        classifyAssistantIntentDeterministic("how much in total did I send to that person?").intent
      ).toBe("counterparty_total_sent");
    });
  });
});
