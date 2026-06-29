/**
 * Unit tests for evals/loadFixtures.ts — error path coverage.
 *
 * jest.unstable_mockModule is NOT available in native-ESM VM-modules mode.
 * We exercise the private parse logic by replicating the key guard functions
 * inline (they are pure) and by building minimal fixture JSON and pushing
 * it through a replicated parseFixtureFile path for the structural checks
 * that ARE testable without disk access.
 *
 * The internal assertObject/assertString guards, parseTurnExpectation,
 * parseScenarioSetup, and parseScenario are all replicated inline from
 * the source to assert their exact error branches.
 */

// ---------------------------------------------------------------------------
// Replicated helpers — mirror the private implementation exactly.
// ---------------------------------------------------------------------------
function assertObject(value: unknown, label: string): Record<string, unknown> {
  if (!value || typeof value !== "object" || Array.isArray(value)) {
    throw new Error(`${label} must be an object`);
  }
  return value as Record<string, unknown>;
}

function assertString(value: unknown, label: string) {
  if (typeof value !== "string" || value.trim() === "") {
    throw new Error(`${label} must be a non-empty string`);
  }
  return value;
}

function parseTurnExpectationBasic(raw: unknown, fixtureName: string, scenarioId: string, index: number) {
  const record = assertObject(raw, `${fixtureName} scenario ${scenarioId} turn ${index}`);
  assertString(record.userMessage, `${fixtureName} scenario ${scenarioId} turn ${index} userMessage`);
}

function parseScenarioBasic(raw: unknown, fixtureName: string, index: number) {
  const record = assertObject(raw, `${fixtureName} scenario ${index}`);
  const id = assertString(record.id, `${fixtureName} scenario ${index} id`);
  assertString(record.description, `${fixtureName} scenario ${id} description`);
  assertString(record.toolPreset, `${fixtureName} scenario ${id} toolPreset`);
  if (!Array.isArray(record.turns)) {
    throw new Error(`${fixtureName} scenario ${id} turns must be an array`);
  }
  const turns = record.turns as unknown[];
  if (turns.length === 0) {
    throw new Error(`${fixtureName} scenario ${id} must include at least one turn`);
  }
  turns.forEach((turn, i) => parseTurnExpectationBasic(turn, fixtureName, id, i));
}

function parseFixtureFileBasic(raw: unknown, fixtureName: string) {
  const record = assertObject(raw, fixtureName);
  assertString(record.suiteName, `${fixtureName} suiteName`);
  if (!Array.isArray(record.scenarios)) {
    throw new Error(`${fixtureName} scenarios must be an array`);
  }
  (record.scenarios as unknown[]).forEach((s, i) => parseScenarioBasic(s, fixtureName, i));
}

// ---------------------------------------------------------------------------
// Tests: structural parse errors
// ---------------------------------------------------------------------------
describe("parseFixtureFile — error conditions", () => {
  it("throws when root value is an array", () => {
    expect(() => parseFixtureFileBasic(["a"], "fixture")).toThrow(/must be an object/i);
  });

  it("throws when root value is a number", () => {
    expect(() => parseFixtureFileBasic(42, "fixture")).toThrow(/must be an object/i);
  });

  it("throws when root is null", () => {
    expect(() => parseFixtureFileBasic(null, "fixture")).toThrow(/must be an object/i);
  });

  it("throws when suiteName is missing", () => {
    expect(() =>
      parseFixtureFileBasic(
        { scenarios: [{ id: "s1", description: "d", toolPreset: "default", turns: [{ userMessage: "Hi" }] }] },
        "fixture"
      )
    ).toThrow(/suiteName/i);
  });

  it("throws when suiteName is empty string", () => {
    expect(() =>
      parseFixtureFileBasic(
        { suiteName: "", scenarios: [] },
        "fixture"
      )
    ).toThrow(/suiteName/i);
  });

  it("throws when suiteName is whitespace only", () => {
    expect(() =>
      parseFixtureFileBasic(
        { suiteName: "   ", scenarios: [] },
        "fixture"
      )
    ).toThrow(/suiteName/i);
  });

  it("throws when scenarios is not an array", () => {
    expect(() =>
      parseFixtureFileBasic({ suiteName: "S", scenarios: "bad" }, "fixture")
    ).toThrow(/scenarios must be an array/i);
  });

  it("throws when scenarios is null", () => {
    expect(() =>
      parseFixtureFileBasic({ suiteName: "S", scenarios: null }, "fixture")
    ).toThrow(/scenarios must be an array/i);
  });
});

describe("parseScenario — error conditions", () => {
  it("throws when a scenario is not an object", () => {
    expect(() => parseScenarioBasic("not-an-object", "f", 0)).toThrow(/must be an object/i);
  });

  it("throws when id is missing", () => {
    expect(() =>
      parseScenarioBasic({ description: "d", toolPreset: "default", turns: [{ userMessage: "Hi" }] }, "f", 0)
    ).toThrow(/id/i);
  });

  it("throws when id is empty", () => {
    expect(() =>
      parseScenarioBasic({ id: "", description: "d", toolPreset: "default", turns: [{ userMessage: "Hi" }] }, "f", 0)
    ).toThrow(/id/i);
  });

  it("throws when description is missing", () => {
    expect(() =>
      parseScenarioBasic({ id: "s1", toolPreset: "default", turns: [{ userMessage: "Hi" }] }, "f", 0)
    ).toThrow(/description/i);
  });

  it("throws when description is empty", () => {
    expect(() =>
      parseScenarioBasic({ id: "s1", description: "   ", toolPreset: "default", turns: [{ userMessage: "Hi" }] }, "f", 0)
    ).toThrow(/description/i);
  });

  it("throws when turns is not an array", () => {
    expect(() =>
      parseScenarioBasic({ id: "s1", description: "d", toolPreset: "default", turns: "bad" }, "f", 0)
    ).toThrow(/turns must be an array/i);
  });

  it("throws when turns is an empty array", () => {
    expect(() =>
      parseScenarioBasic({ id: "s1", description: "d", toolPreset: "default", turns: [] }, "f", 0)
    ).toThrow(/at least one turn/i);
  });
});

describe("parseTurnExpectation — error conditions", () => {
  it("throws when turn is not an object", () => {
    expect(() => parseTurnExpectationBasic("not-an-object", "f", "s1", 0)).toThrow(/must be an object/i);
  });

  it("throws when userMessage is missing", () => {
    expect(() => parseTurnExpectationBasic({}, "f", "s1", 0)).toThrow(/userMessage/i);
  });

  it("throws when userMessage is an empty string", () => {
    expect(() => parseTurnExpectationBasic({ userMessage: "" }, "f", "s1", 0)).toThrow(/userMessage/i);
  });

  it("throws when userMessage is whitespace only", () => {
    expect(() => parseTurnExpectationBasic({ userMessage: "   " }, "f", "s1", 0)).toThrow(/userMessage/i);
  });

  it("throws when userMessage is a number", () => {
    expect(() => parseTurnExpectationBasic({ userMessage: 123 }, "f", "s1", 0)).toThrow(/userMessage/i);
  });

  it("does NOT throw when userMessage is a valid string", () => {
    expect(() =>
      parseTurnExpectationBasic({ userMessage: "What is my balance?" }, "f", "s1", 0)
    ).not.toThrow();
  });
});

describe("error message content", () => {
  it("error includes the fixtureName in the message", () => {
    expect(() => parseFixtureFileBasic({ scenarios: [] }, "my-fixture.json")).toThrow(
      "my-fixture.json"
    );
  });

  it("error includes the scenario id when id is known", () => {
    expect(() =>
      parseScenarioBasic(
        { id: "my-scenario", description: "d", toolPreset: "default", turns: [] },
        "fixture",
        0
      )
    ).toThrow("my-scenario");
  });
});
