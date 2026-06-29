/**
 * Unit tests for v2/assertions.ts — surfacedText and collectTurnFailures.
 * No LLM, no DB, no network calls.
 */
import { surfacedText, collectTurnFailures } from "../assertions.js";
import type { RunAssistantResult } from "../../../state.js";
import type { V2TurnExpectation } from "../types.js";

// ---------------------------------------------------------------------------
// Minimal stub builder for RunAssistantResult
// Casts through unknown because test stubs deliberately omit required fields
// (conversationId, assistantId, responseMessage, etc.) that are irrelevant here.
// ---------------------------------------------------------------------------
function makeResult(
  overrides: Partial<{
    message: string;
    confirmation: { recipientEmail: string; amount: number } | null | undefined;
    clarification: { question: string } | null | undefined;
    responseBlocks: Array<Record<string, unknown>> | undefined;
  }> = {}
): RunAssistantResult {
  return {
    intent: "read_account",
    message: overrides.message ?? "",
    toolCalls: [],
    confirmation: overrides.confirmation as never,
    supersededConfirmationId: undefined,
    clarification: overrides.clarification as never,
    refusalReason: undefined,
    responseBlocks: overrides.responseBlocks as never
  } as unknown as RunAssistantResult;
}

function makeTurn(overrides: Partial<V2TurnExpectation> = {}): V2TurnExpectation {
  return {
    userMessage: "How much is my balance?",
    probes: "test probe",
    ...overrides
  };
}

// ---------------------------------------------------------------------------
// surfacedText
// ---------------------------------------------------------------------------
describe("surfacedText", () => {
  it("returns the message when there are no responseBlocks", () => {
    const result = makeResult({ message: "Your balance is 125.00 ILS." });
    expect(surfacedText(result)).toContain("Your balance is 125.00 ILS.");
  });

  it("concatenates message and JSON-serialised responseBlocks", () => {
    const result = makeResult({
      message: "Intro text.",
      responseBlocks: [{ type: "balance", amount: 125 }]
    });
    const text = surfacedText(result);
    expect(text).toContain("Intro text.");
    expect(text).toContain("125");
  });

  it("handles undefined message gracefully", () => {
    const result = makeResult({ message: undefined as unknown as string });
    expect(() => surfacedText(result)).not.toThrow();
    expect(typeof surfacedText(result)).toBe("string");
  });

  it("returns empty-string content when both message and blocks are absent", () => {
    const result = makeResult({ message: "" });
    const text = surfacedText(result);
    expect(text.trim()).toBe("");
  });
});

// ---------------------------------------------------------------------------
// collectTurnFailures — no failures (happy paths)
// ---------------------------------------------------------------------------
describe("collectTurnFailures — no failures", () => {
  it("returns empty array when no assertions are specified", () => {
    const result = makeResult({ message: "Here is your balance." });
    const failures = collectTurnFailures("s1", 0, makeTurn(), result);
    expect(failures).toHaveLength(0);
  });

  it("passes expectLanguage=en when message has no Hebrew", () => {
    const result = makeResult({ message: "Balance is 125 ILS." });
    const failures = collectTurnFailures("s1", 0, makeTurn({ expectLanguage: "en" }), result);
    expect(failures).toHaveLength(0);
  });

  it("passes expectLanguage=he when message contains Hebrew characters", () => {
    const result = makeResult({ message: "היתרה שלך היא 125 שקל." });
    const failures = collectTurnFailures("s1", 0, makeTurn({ expectLanguage: "he" }), result);
    expect(failures).toHaveLength(0);
  });

  it("passes expectRecipientEmail when confirmation matches", () => {
    const result = makeResult({
      message: "Prepared transfer.",
      confirmation: { recipientEmail: "alice@example.com", amount: 50 } as never
    });
    const failures = collectTurnFailures(
      "s1", 0,
      makeTurn({ expectRecipientEmail: "alice@example.com" }),
      result
    );
    expect(failures).toHaveLength(0);
  });

  it("passes expectAmount when confirmation amount matches", () => {
    const result = makeResult({
      message: "Prepared.",
      confirmation: { recipientEmail: "alice@example.com", amount: 100 } as never
    });
    const failures = collectTurnFailures(
      "s1", 0,
      makeTurn({ expectAmount: 100 }),
      result
    );
    expect(failures).toHaveLength(0);
  });

  it("passes expectClarification when clarification is present", () => {
    const result = makeResult({
      message: "Who do you want to send to?",
      clarification: { question: "Who?" } as never
    });
    const failures = collectTurnFailures(
      "s1", 0,
      makeTurn({ expectClarification: true }),
      result
    );
    expect(failures).toHaveLength(0);
  });

  it("passes expectNoConfirmation when confirmation is null", () => {
    const result = makeResult({ message: "No transfer.", confirmation: null });
    const failures = collectTurnFailures(
      "s1", 0,
      makeTurn({ expectNoConfirmation: true }),
      result
    );
    expect(failures).toHaveLength(0);
  });

  it("passes answerMustContain when all needles are present (case-insensitive)", () => {
    const result = makeResult({ message: "Your balance is 840 ILS and you can send 880 more." });
    const failures = collectTurnFailures(
      "s1", 0,
      makeTurn({ answerMustContain: ["840", "880"] }),
      result
    );
    expect(failures).toHaveLength(0);
  });

  it("passes answerMustNotContain when none of the forbidden strings appear", () => {
    const result = makeResult({ message: "Your balance is 840 ILS." });
    const failures = collectTurnFailures(
      "s1", 0,
      makeTurn({ answerMustNotContain: ["successfully sent", "transfer is complete"] }),
      result
    );
    expect(failures).toHaveLength(0);
  });

  it("passes multiRequestParts when all parts appear in the reply", () => {
    const result = makeResult({ message: "Balance: 840. Remaining limit: 880 ILS today." });
    const failures = collectTurnFailures(
      "s1", 0,
      makeTurn({ multiRequestParts: ["840", "880"] }),
      result
    );
    expect(failures).toHaveLength(0);
  });
});

// ---------------------------------------------------------------------------
// collectTurnFailures — individual failure cases
// ---------------------------------------------------------------------------
describe("collectTurnFailures — language failures", () => {
  it("fails expectLanguage=he when no Hebrew in reply", () => {
    const result = makeResult({ message: "Your balance is 125 ILS." });
    const failures = collectTurnFailures("s1", 0, makeTurn({ expectLanguage: "he" }), result);
    expect(failures).toHaveLength(1);
    expect(failures[0]).toContain("Hebrew");
  });

  it("fails expectLanguage=en when reply contains Hebrew characters", () => {
    const result = makeResult({ message: "היתרה שלך היא 125 שקל." });
    const failures = collectTurnFailures("s1", 0, makeTurn({ expectLanguage: "en" }), result);
    expect(failures).toHaveLength(1);
    expect(failures[0]).toContain("Hebrew");
  });
});

describe("collectTurnFailures — confirmation failures", () => {
  it("fails expectRecipientEmail when confirmation is null", () => {
    const result = makeResult({ message: "Nothing.", confirmation: null });
    const failures = collectTurnFailures(
      "s1", 0,
      makeTurn({ expectRecipientEmail: "alice@example.com" }),
      result
    );
    expect(failures).toHaveLength(1);
    expect(failures[0]).toContain("alice@example.com");
  });

  it("fails expectRecipientEmail when confirmation email differs", () => {
    const result = makeResult({
      message: "Done.",
      confirmation: { recipientEmail: "bob@example.com", amount: 50 } as never
    });
    const failures = collectTurnFailures(
      "s1", 0,
      makeTurn({ expectRecipientEmail: "alice@example.com" }),
      result
    );
    expect(failures).toHaveLength(1);
    expect(failures[0]).toContain("alice@example.com");
  });

  it("fails expectAmount when confirmation amount differs", () => {
    const result = makeResult({
      message: "Done.",
      confirmation: { recipientEmail: "alice@example.com", amount: 99 } as never
    });
    const failures = collectTurnFailures(
      "s1", 0,
      makeTurn({ expectAmount: 100 }),
      result
    );
    expect(failures).toHaveLength(1);
    expect(failures[0]).toContain("100");
  });

  it("fails expectNoConfirmation when a confirmation card exists", () => {
    const result = makeResult({
      message: "Prepared.",
      confirmation: { recipientEmail: "alice@example.com", amount: 50 } as never
    });
    const failures = collectTurnFailures(
      "s1", 0,
      makeTurn({ expectNoConfirmation: true }),
      result
    );
    expect(failures).toHaveLength(1);
    expect(failures[0]).toContain("NO confirmation");
  });
});

describe("collectTurnFailures — clarification failures", () => {
  it("fails expectClarification=true when no clarification is returned", () => {
    const result = makeResult({ message: "Here is the answer.", clarification: null });
    const failures = collectTurnFailures(
      "s1", 0,
      makeTurn({ expectClarification: true }),
      result
    );
    expect(failures).toHaveLength(1);
    expect(failures[0]).toContain("clarifying question");
  });
});

describe("collectTurnFailures — mustContain / mustNotContain", () => {
  it("fails answerMustContain when a required string is missing from message and blocks", () => {
    const result = makeResult({ message: "Balance is 840 ILS." });
    const failures = collectTurnFailures(
      "s1", 0,
      makeTurn({ answerMustContain: ["840", "999"] }),
      result
    );
    expect(failures).toHaveLength(1);
    expect(failures[0]).toContain("999");
  });

  it("finds answerMustContain in responseBlocks JSON even if absent from message prose", () => {
    const result = makeResult({
      message: "Here is your info.",
      responseBlocks: [{ type: "amount", value: 840 }]
    });
    const failures = collectTurnFailures(
      "s1", 0,
      makeTurn({ answerMustContain: ["840"] }),
      result
    );
    expect(failures).toHaveLength(0);
  });

  it("fails answerMustNotContain when a forbidden string appears", () => {
    const result = makeResult({ message: "The transfer is complete." });
    const failures = collectTurnFailures(
      "s1", 0,
      makeTurn({ answerMustNotContain: ["transfer is complete"] }),
      result
    );
    expect(failures).toHaveLength(1);
    expect(failures[0]).toContain("NOT contain");
  });

  it("answerMustNotContain is case-insensitive", () => {
    const result = makeResult({ message: "SUCCESSFULLY SENT the money." });
    const failures = collectTurnFailures(
      "s1", 0,
      makeTurn({ answerMustNotContain: ["successfully sent"] }),
      result
    );
    expect(failures).toHaveLength(1);
  });

  it("answerMustContain is case-insensitive", () => {
    const result = makeResult({ message: "YOUR BALANCE IS 840 ILS." });
    const failures = collectTurnFailures(
      "s1", 0,
      makeTurn({ answerMustContain: ["840"] }),
      result
    );
    expect(failures).toHaveLength(0);
  });
});

describe("collectTurnFailures — multiRequestParts", () => {
  it("fails when a multi-request part is absent", () => {
    const result = makeResult({ message: "Balance: 840 ILS." });
    const failures = collectTurnFailures(
      "s1", 0,
      makeTurn({ multiRequestParts: ["840", "880"] }),
      result
    );
    expect(failures).toHaveLength(1);
    expect(failures[0]).toContain("880");
  });

  it("passes when all multi-request parts are present", () => {
    const result = makeResult({ message: "Balance: 840 ILS; remaining: 880 ILS." });
    const failures = collectTurnFailures(
      "s1", 0,
      makeTurn({ multiRequestParts: ["840", "880"] }),
      result
    );
    expect(failures).toHaveLength(0);
  });
});

describe("collectTurnFailures — failure prefix", () => {
  it("includes the scenarioId and turnIndex in the failure message", () => {
    const result = makeResult({ message: "" });
    const failures = collectTurnFailures(
      "my-scenario", 3,
      makeTurn({ answerMustContain: ["missing-text"] }),
      result
    );
    expect(failures[0]).toContain("my-scenario");
    expect(failures[0]).toContain("3");
  });

  it("includes the probes label in the failure message", () => {
    const result = makeResult({ message: "" });
    const failures = collectTurnFailures(
      "s1", 0,
      makeTurn({ answerMustContain: ["missing"], probes: "my-probe-label" }),
      result
    );
    expect(failures[0]).toContain("my-probe-label");
  });
});
