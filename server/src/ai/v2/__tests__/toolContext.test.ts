import {
  getConfigurable,
  minimalCounterpartyRef,
  baseToolContext,
  renderToolResult
} from "../toolContext.js";
import type { LangGraphRunnableConfig } from "@langchain/langgraph";
import type { V2Configurable } from "../toolContext.js";
import type { RuntimeToolResult } from "../../state.js";

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function makeConfigurable(overrides: Partial<V2Configurable> = {}): V2Configurable {
  return {
    userId: "user-1",
    conversationId: "conv-1",
    assistantId: "oshri",
    message: "hello",
    now: new Date("2026-01-01T00:00:00.000Z"),
    timezone: "Asia/Jerusalem",
    locale: "en",
    executors: {},
    turnOutcome: { uiBlocks: [] },
    knownCounterparties: [],
    ...overrides
  } as V2Configurable;
}

function makeConfig(configurable?: Partial<V2Configurable>): LangGraphRunnableConfig {
  return {
    configurable: configurable !== undefined ? makeConfigurable(configurable) : undefined
  } as unknown as LangGraphRunnableConfig;
}

function makeToolResult(overrides: Partial<RuntimeToolResult> = {}): RuntimeToolResult {
  return {
    toolName: "getAccountBalance",
    status: "ok",
    data: null,
    displayData: {
      summary: "Balance is 1,000 ILS",
      metadata: {}
    },
    ...overrides
  };
}

// ---------------------------------------------------------------------------
// getConfigurable
// ---------------------------------------------------------------------------

describe("getConfigurable", () => {
  test("returns the configurable when userId and conversationId are present", () => {
    const cfg = makeConfigurable();
    const config = { configurable: cfg } as unknown as LangGraphRunnableConfig;
    const result = getConfigurable(config);
    expect(result.userId).toBe("user-1");
    expect(result.conversationId).toBe("conv-1");
  });

  test("throws when config has no configurable at all", () => {
    const config = {} as LangGraphRunnableConfig;
    expect(() => getConfigurable(config)).toThrow(
      "v2 tool invoked without userId/conversationId in config"
    );
  });

  test("throws when userId is missing", () => {
    const config = makeConfig({ userId: "" as unknown as string });
    // Override userId to empty after makeConfigurable set it
    const raw = config.configurable as Record<string, unknown>;
    raw["userId"] = "";
    expect(() => getConfigurable(config)).toThrow(
      "v2 tool invoked without userId/conversationId in config"
    );
  });

  test("throws when conversationId is missing", () => {
    const cfg = makeConfigurable();
    const config = { configurable: { ...cfg, conversationId: "" } } as unknown as LangGraphRunnableConfig;
    expect(() => getConfigurable(config)).toThrow(
      "v2 tool invoked without userId/conversationId in config"
    );
  });

  test("throws when configurable has no userId property", () => {
    const config = {
      configurable: { conversationId: "conv-1" }
    } as unknown as LangGraphRunnableConfig;
    expect(() => getConfigurable(config)).toThrow();
  });
});

// ---------------------------------------------------------------------------
// minimalCounterpartyRef
// ---------------------------------------------------------------------------

describe("minimalCounterpartyRef", () => {
  test("lowercases and trims the email", () => {
    const ref = minimalCounterpartyRef("  Alice@Example.COM  ");
    expect(ref.email).toBe("alice@example.com");
  });

  test("produces maskedLabel via maskEmail", () => {
    const ref = minimalCounterpartyRef("bob@example.com");
    expect(ref.maskedLabel).toMatch(/^b\*\*\*@example\.com$/);
  });

  test("sets firstMentionedAtTurn and lastReferencedAtTurn to 0", () => {
    const ref = minimalCounterpartyRef("carol@test.com");
    expect(ref.firstMentionedAtTurn).toBe(0);
    expect(ref.lastReferencedAtTurn).toBe(0);
  });

  test("sets userLabel to the original email string (before trimming)", () => {
    const email = "dave@example.com";
    const ref = minimalCounterpartyRef(email);
    expect(ref.userLabel).toBe(email);
  });
});

// ---------------------------------------------------------------------------
// baseToolContext
// ---------------------------------------------------------------------------

describe("baseToolContext", () => {
  test("maps userId, conversationId, and message from configurable", () => {
    const cfg = makeConfigurable({
      userId: "u42",
      conversationId: "c99",
      message: "show my balance"
    });
    const ctx = baseToolContext(cfg);
    expect(ctx.userId).toBe("u42");
    expect(ctx.conversationId).toBe("c99");
    expect(ctx.message).toBe("show my balance");
  });

  test("only includes the three base fields", () => {
    const cfg = makeConfigurable();
    const ctx = baseToolContext(cfg);
    expect(Object.keys(ctx)).toEqual(["userId", "conversationId", "message"]);
  });
});

// ---------------------------------------------------------------------------
// renderToolResult
// ---------------------------------------------------------------------------

describe("renderToolResult", () => {
  test("includes the display summary in the output", () => {
    const result = makeToolResult();
    expect(renderToolResult(result)).toContain("Balance is 1,000 ILS");
  });

  test("appends '(no matching data)' note for empty status", () => {
    const result = makeToolResult({ status: "empty" });
    expect(renderToolResult(result)).toContain("(no matching data)");
  });

  test("appends error note with message for error status", () => {
    const result = makeToolResult({
      status: "error",
      error: { code: "NOT_FOUND", message: "account not found" }
    });
    expect(renderToolResult(result)).toContain("(error: account not found)");
  });

  test("appends generic error note when error has no message", () => {
    const result = makeToolResult({ status: "error" });
    expect(renderToolResult(result)).toContain("(error: tool failed)");
  });

  test("includes relevant metadata fields in [data] section", () => {
    const result = makeToolResult({
      displayData: {
        summary: "Balance is 500 ILS",
        metadata: { amount: 500, recordCount: 1 }
      }
    });
    const text = renderToolResult(result);
    expect(text).toContain("[data]");
    expect(text).toContain("500");
  });

  test("omits [data] section when metadata has no relevant fields and data is null", () => {
    const result = makeToolResult({
      data: null,
      displayData: {
        summary: "Done",
        metadata: { irrelevantKey: "ignored" } as unknown as import("../../state.js").ToolResultMetadata
      }
    });
    const text = renderToolResult(result);
    expect(text).not.toContain("[data]");
  });

  test("includes data object in slim when result.data is a non-null object", () => {
    const result = makeToolResult({
      data: { id: "tx-123", amount: 200 },
      displayData: {
        summary: "Transaction found",
        metadata: {}
      }
    });
    const text = renderToolResult(result);
    expect(text).toContain("[data]");
    expect(text).toContain("tx-123");
  });

  test("includes counterpartyEmail metadata when present", () => {
    const result = makeToolResult({
      displayData: {
        summary: "Found counterparty",
        metadata: { counterpartyEmail: "bob@example.com" }
      }
    });
    const text = renderToolResult(result);
    expect(text).toContain("bob@example.com");
  });
});
