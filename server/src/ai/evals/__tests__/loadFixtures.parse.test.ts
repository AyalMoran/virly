/**
 * Unit tests for evals/loadFixtures.ts — parsing against real fixture files on disk.
 *
 * jest.unstable_mockModule is NOT available in native-ESM VM-modules mode.
 * We therefore test the exported loadAiEvalFixtureFiles() against the real fixture
 * JSON files that ship with the codebase, and we replicate the private
 * assertObject/assertString helpers inline to test parse guard logic.
 */

import { loadAiEvalFixtureFiles } from "../loadFixtures.js";

// ---------------------------------------------------------------------------
// Replicated parse guards (private in source; tested inline here)
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

// ---------------------------------------------------------------------------
// Tests: loadAiEvalFixtureFiles against real fixture files
// ---------------------------------------------------------------------------
describe("loadAiEvalFixtureFiles — real fixture files", () => {
  it("loads exactly 4 fixture files (one per hard-coded fixture name)", () => {
    const files = loadAiEvalFixtureFiles();
    expect(files).toHaveLength(4);
  });

  it("every fixture file has a non-empty suiteName", () => {
    const files = loadAiEvalFixtureFiles();
    for (const file of files) {
      expect(typeof file.suiteName).toBe("string");
      expect(file.suiteName.trim().length).toBeGreaterThan(0);
    }
  });

  it("every fixture file has at least one scenario", () => {
    const files = loadAiEvalFixtureFiles();
    for (const file of files) {
      expect(file.scenarios.length).toBeGreaterThan(0);
    }
  });

  it("every scenario has an id, description, and toolPreset", () => {
    const files = loadAiEvalFixtureFiles();
    for (const file of files) {
      for (const scenario of file.scenarios) {
        expect(typeof scenario.id).toBe("string");
        expect(typeof scenario.description).toBe("string");
        expect(["default", "phase_two_counterparty", "phase_three_transactions"]).toContain(
          scenario.toolPreset
        );
      }
    }
  });

  it("every scenario has at least one turn", () => {
    const files = loadAiEvalFixtureFiles();
    for (const file of files) {
      for (const scenario of file.scenarios) {
        expect(scenario.turns.length).toBeGreaterThan(0);
      }
    }
  });

  it("every turn has a non-empty userMessage string", () => {
    const files = loadAiEvalFixtureFiles();
    for (const file of files) {
      for (const scenario of file.scenarios) {
        for (const turn of scenario.turns) {
          expect(typeof turn.userMessage).toBe("string");
          expect(turn.userMessage.trim().length).toBeGreaterThan(0);
        }
      }
    }
  });

  it("expectedResponseLanguage, when present, is always 'hebrew'", () => {
    const files = loadAiEvalFixtureFiles();
    for (const file of files) {
      for (const scenario of file.scenarios) {
        for (const turn of scenario.turns) {
          if (turn.expectedResponseLanguage !== undefined) {
            expect(turn.expectedResponseLanguage).toBe("hebrew");
          }
        }
      }
    }
  });

  it("expectedToolCalls, when present, is an array whose items are strings", () => {
    const files = loadAiEvalFixtureFiles();
    for (const file of files) {
      for (const scenario of file.scenarios) {
        for (const turn of scenario.turns) {
          if (turn.expectedToolCalls !== undefined) {
            expect(Array.isArray(turn.expectedToolCalls)).toBe(true);
            for (const name of turn.expectedToolCalls) {
              expect(typeof name).toBe("string");
            }
          }
        }
      }
    }
  });

  it("counterpartyResolver, when present, has a valid status", () => {
    const files = loadAiEvalFixtureFiles();
    for (const file of files) {
      for (const scenario of file.scenarios) {
        const resolver = scenario.setup?.counterpartyResolver;
        if (resolver !== undefined) {
          expect(["resolved", "ambiguous"]).toContain(resolver.status);
        }
      }
    }
  });

  it("is idempotent — calling twice returns equivalent fixture data", () => {
    const first = loadAiEvalFixtureFiles();
    const second = loadAiEvalFixtureFiles();
    expect(first.length).toBe(second.length);
    expect(first.map((f) => f.suiteName)).toEqual(second.map((f) => f.suiteName));
    expect(first.map((f) => f.scenarios.length)).toEqual(
      second.map((f) => f.scenarios.length)
    );
  });
});

// ---------------------------------------------------------------------------
// Tests: private parse guard helpers (replicated inline)
// ---------------------------------------------------------------------------
describe("assertObject (parse guard)", () => {
  it("returns the object when value is a plain object", () => {
    const obj = { key: "value" };
    expect(assertObject(obj, "test")).toBe(obj);
  });

  it("throws for an array", () => {
    expect(() => assertObject([], "label")).toThrow("label must be an object");
  });

  it("throws for null", () => {
    expect(() => assertObject(null, "label")).toThrow("label must be an object");
  });

  it("throws for a string", () => {
    expect(() => assertObject("str", "label")).toThrow("label must be an object");
  });

  it("throws for a number", () => {
    expect(() => assertObject(42, "label")).toThrow("label must be an object");
  });

  it("throws for undefined", () => {
    expect(() => assertObject(undefined, "label")).toThrow("label must be an object");
  });

  it("includes the label in the error message", () => {
    expect(() => assertObject([], "my-label")).toThrow("my-label");
  });
});

describe("assertString (parse guard)", () => {
  it("returns the string when value is non-empty", () => {
    expect(assertString("hello", "label")).toBe("hello");
  });

  it("throws for an empty string", () => {
    expect(() => assertString("", "label")).toThrow("label must be a non-empty string");
  });

  it("throws for a whitespace-only string", () => {
    expect(() => assertString("   ", "label")).toThrow("label must be a non-empty string");
  });

  it("throws for a number", () => {
    expect(() => assertString(42, "label")).toThrow("label must be a non-empty string");
  });

  it("throws for null", () => {
    expect(() => assertString(null, "label")).toThrow("label must be a non-empty string");
  });

  it("throws for undefined", () => {
    expect(() => assertString(undefined, "label")).toThrow("label must be a non-empty string");
  });

  it("throws for an array", () => {
    expect(() => assertString([], "label")).toThrow("label must be a non-empty string");
  });

  it("includes the label in the error message", () => {
    expect(() => assertString("", "my-label")).toThrow("my-label");
  });
});
