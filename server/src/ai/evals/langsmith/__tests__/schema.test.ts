/**
 * Unit tests for langsmith/schema.ts — validateAssistantExamples.
 * No LLM, no DB, no network calls.
 */
import { validateAssistantExamples } from "../schema.js";

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------
function minimalExample(overrides?: {
  name?: string;
  exampleId?: string;
  behaviors?: string[];
  tags?: string[];
  turnsCount?: number;
}): Record<string, unknown> {
  const turnsCount = overrides?.turnsCount ?? 1;
  const inputTurns = Array.from({ length: turnsCount }, (_, i) => ({
    conversationId: `conv-${i + 1}`,
    message: "Hello"
  }));
  const outputTurns = Array.from({ length: turnsCount }, () => ({}));

  return {
    name: overrides?.name ?? "Test example",
    metadata: {
      example_id: overrides?.exampleId ?? "ex-001",
      split: "smoke",
      priority: "smoke",
      source: "unit-test",
      behaviors: overrides?.behaviors ?? [
        "balance_inquiry",
        "transaction_detail",
        "transfer_prepare",
        "clarification",
        "no_money_execution",
        "unsafe_request",
        "hebrew",
        "multi_turn"
      ],
      tags: overrides?.tags ?? ["smoke"]
    },
    inputs: {
      kind: "assistant_thread",
      contract: "RunAssistantInputSequence",
      toolPreset: "v2_world",
      turns: inputTurns
    },
    outputs: {
      expectedTurns: outputTurns
    }
  };
}

// Build an array that covers all 8 required behaviors across N examples
function buildCoveringExamples(): unknown[] {
  const required = [
    "balance_inquiry",
    "transaction_detail",
    "transfer_prepare",
    "clarification",
    "no_money_execution",
    "unsafe_request",
    "hebrew",
    "multi_turn"
  ];
  return required.map((behavior, i) =>
    minimalExample({ exampleId: `ex-${i + 1}`, behaviors: [behavior] })
  );
}

// ---------------------------------------------------------------------------
// Happy path
// ---------------------------------------------------------------------------
describe("validateAssistantExamples — happy paths", () => {
  it("returns no errors and no warnings for a minimal valid example with all required behaviors", () => {
    const result = validateAssistantExamples([minimalExample()]);
    expect(result.errors).toHaveLength(0);
    expect(result.warnings).toHaveLength(0);
  });

  it("returns the parsed example in result.examples", () => {
    const example = minimalExample({ name: "My test" });
    const result = validateAssistantExamples([example]);
    expect(result.examples).toHaveLength(1);
    expect((result.examples[0] as { name: string }).name).toBe("My test");
  });

  it("accepts multiple distinct examples with no duplicate ids", () => {
    const examples = buildCoveringExamples();
    const result = validateAssistantExamples(examples);
    expect(result.errors).toHaveLength(0);
    expect(result.examples.length).toBe(examples.length);
  });

  it("produces coverage entries for each declared behavior", () => {
    const result = validateAssistantExamples([minimalExample({ behaviors: ["balance_inquiry"] })]);
    expect(result.coverage.has("balance_inquiry")).toBe(true);
    expect(result.coverage.get("balance_inquiry")).toContain("ex-001");
  });

  it("warns for each required behavior that has no coverage", () => {
    // Only covers one behavior, so 7 others should produce warnings
    const example = minimalExample({ behaviors: ["balance_inquiry"] });
    const result = validateAssistantExamples([example]);
    const missingWarnings = result.warnings.filter((w) => w.includes("No example declares required behavior"));
    expect(missingWarnings.length).toBeGreaterThanOrEqual(7);
  });

  it("accepts a turn with optional assistantId and userId fields", () => {
    const example = minimalExample();
    (example.inputs as Record<string, unknown>).turns = [
      { userId: "user-1", conversationId: "conv-1", requestId: "req-1", assistantId: "oshri", message: "Hi" }
    ];
    (example.outputs as Record<string, unknown>).expectedTurns = [{}];
    const result = validateAssistantExamples([example]);
    expect(result.errors).toHaveLength(0);
  });

  it("accepts expectedTurns with string array fields", () => {
    const example = minimalExample();
    (example.outputs as Record<string, unknown>).expectedTurns = [
      {
        answerMustContain: ["840"],
        answerMustNotContain: ["error"],
        expectedToolCallsInclude: ["getAccountBalance"],
        expectedToolCallsExact: ["getAccountBalance"],
        multiRequestParts: ["balance", "limit"]
      }
    ];
    const result = validateAssistantExamples([example]);
    expect(result.errors).toHaveLength(0);
  });

  it("accepts setup with pendingConfirmation", () => {
    const example = minimalExample();
    (example.inputs as Record<string, unknown>).setup = {
      pendingConfirmation: { recipientEmail: "a@a.com", amount: 50, currency: "ILS" }
    };
    const result = validateAssistantExamples([example]);
    expect(result.errors).toHaveLength(0);
  });
});

// ---------------------------------------------------------------------------
// Error: root not an array
// ---------------------------------------------------------------------------
describe("validateAssistantExamples — root type errors", () => {
  it("returns error when input is not an array", () => {
    const result = validateAssistantExamples({ not: "an array" });
    expect(result.errors).toContain("Examples file must be a JSON array");
  });

  it("returns error when input is null", () => {
    const result = validateAssistantExamples(null);
    expect(result.errors).toContain("Examples file must be a JSON array");
  });

  it("returns error when input is a string", () => {
    const result = validateAssistantExamples("not-an-array");
    expect(result.errors).toContain("Examples file must be a JSON array");
  });
});

// ---------------------------------------------------------------------------
// Error: example-level fields
// ---------------------------------------------------------------------------
describe("validateAssistantExamples — example field errors", () => {
  it("errors when an entry is not an object", () => {
    const result = validateAssistantExamples(["not-an-object"]);
    expect(result.errors.some((e) => e.includes("must be an object"))).toBe(true);
  });

  it("errors when name is missing", () => {
    const example = minimalExample();
    delete (example as Record<string, unknown>).name;
    const result = validateAssistantExamples([example]);
    expect(result.errors.some((e) => e.includes("name"))).toBe(true);
  });

  it("errors when name is empty string", () => {
    const example = minimalExample({ name: "" });
    const result = validateAssistantExamples([example]);
    expect(result.errors.some((e) => e.includes("name"))).toBe(true);
  });

  it("errors when metadata is missing", () => {
    const example = minimalExample();
    delete (example as Record<string, unknown>).metadata;
    const result = validateAssistantExamples([example]);
    expect(result.errors.some((e) => e.includes("metadata"))).toBe(true);
  });

  it("errors when example_id is missing", () => {
    const example = minimalExample();
    delete (example.metadata as Record<string, unknown>).example_id;
    const result = validateAssistantExamples([example]);
    expect(result.errors.some((e) => e.includes("example_id"))).toBe(true);
  });

  it("errors on duplicate example_id", () => {
    const examples = [minimalExample({ exampleId: "dup-id" }), minimalExample({ exampleId: "dup-id" })];
    const result = validateAssistantExamples(examples);
    expect(result.errors.some((e) => e.includes("dup-id"))).toBe(true);
  });

  it("errors when behaviors is empty array", () => {
    const example = minimalExample({ behaviors: [] });
    const result = validateAssistantExamples([example]);
    expect(result.errors.some((e) => e.includes("behaviors"))).toBe(true);
  });

  it("errors when tags is not an array", () => {
    const example = minimalExample();
    (example.metadata as Record<string, unknown>).tags = "not-an-array";
    const result = validateAssistantExamples([example]);
    expect(result.errors.some((e) => e.includes("tags"))).toBe(true);
  });
});

// ---------------------------------------------------------------------------
// Error: inputs field errors
// ---------------------------------------------------------------------------
describe("validateAssistantExamples — inputs errors", () => {
  it("errors when inputs is not an object", () => {
    const example = minimalExample();
    (example as Record<string, unknown>).inputs = "bad";
    const result = validateAssistantExamples([example]);
    expect(result.errors.some((e) => e.includes("inputs"))).toBe(true);
  });

  it("errors when inputs.kind is not 'assistant_thread'", () => {
    const example = minimalExample();
    (example.inputs as Record<string, unknown>).kind = "wrong_kind";
    const result = validateAssistantExamples([example]);
    expect(result.errors.some((e) => e.includes("kind"))).toBe(true);
  });

  it("errors when inputs.contract is not 'RunAssistantInputSequence'", () => {
    const example = minimalExample();
    (example.inputs as Record<string, unknown>).contract = "wrong";
    const result = validateAssistantExamples([example]);
    expect(result.errors.some((e) => e.includes("contract"))).toBe(true);
  });

  it("errors when inputs.toolPreset is not 'v2_world'", () => {
    const example = minimalExample();
    (example.inputs as Record<string, unknown>).toolPreset = "wrong";
    const result = validateAssistantExamples([example]);
    expect(result.errors.some((e) => e.includes("toolPreset"))).toBe(true);
  });

  it("errors when inputs.turns is empty array", () => {
    const example = minimalExample();
    (example.inputs as Record<string, unknown>).turns = [];
    const result = validateAssistantExamples([example]);
    expect(result.errors.some((e) => e.includes("turns"))).toBe(true);
  });

  it("errors when a turn is missing conversationId", () => {
    const example = minimalExample();
    (example.inputs as Record<string, unknown>).turns = [{ message: "Hi" }];
    const result = validateAssistantExamples([example]);
    expect(result.errors.some((e) => e.includes("conversationId"))).toBe(true);
  });

  it("errors when a turn is missing message", () => {
    const example = minimalExample();
    (example.inputs as Record<string, unknown>).turns = [{ conversationId: "conv-1" }];
    const result = validateAssistantExamples([example]);
    expect(result.errors.some((e) => e.includes("message"))).toBe(true);
  });

  it("errors when a turn has an unknown field", () => {
    const example = minimalExample();
    (example.inputs as Record<string, unknown>).turns = [
      { conversationId: "c1", message: "Hi", unknownField: "oops" }
    ];
    const result = validateAssistantExamples([example]);
    expect(result.errors.some((e) => e.includes("unknownField"))).toBe(true);
  });
});

// ---------------------------------------------------------------------------
// Error: outputs field errors
// ---------------------------------------------------------------------------
describe("validateAssistantExamples — outputs errors", () => {
  it("errors when outputs is not an object", () => {
    const example = minimalExample();
    (example as Record<string, unknown>).outputs = "bad";
    const result = validateAssistantExamples([example]);
    expect(result.errors.some((e) => e.includes("outputs"))).toBe(true);
  });

  it("errors when outputs.expectedTurns is not an array", () => {
    const example = minimalExample();
    (example.outputs as Record<string, unknown>).expectedTurns = "not-array";
    const result = validateAssistantExamples([example]);
    expect(result.errors.some((e) => e.includes("expectedTurns"))).toBe(true);
  });

  it("errors when outputs.expectedTurns length differs from inputs.turns length", () => {
    const example = minimalExample({ turnsCount: 2 });
    (example.outputs as Record<string, unknown>).expectedTurns = [{}]; // only 1, but 2 input turns
    const result = validateAssistantExamples([example]);
    expect(result.errors.some((e) => e.includes("length"))).toBe(true);
  });

  it("errors when an expectedTurn has a non-string-array for answerMustContain", () => {
    const example = minimalExample();
    (example.outputs as Record<string, unknown>).expectedTurns = [
      { answerMustContain: [123] }
    ];
    const result = validateAssistantExamples([example]);
    expect(result.errors.some((e) => e.includes("answerMustContain"))).toBe(true);
  });

  it("errors when an expectedTurn has a non-string-array for expectedToolCallsExact", () => {
    const example = minimalExample();
    (example.outputs as Record<string, unknown>).expectedTurns = [
      { expectedToolCallsExact: [true] }
    ];
    const result = validateAssistantExamples([example]);
    expect(result.errors.some((e) => e.includes("expectedToolCallsExact"))).toBe(true);
  });
});
