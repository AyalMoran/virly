/**
 * Tests for model.ts — covers isV2ModelConfigured under the test environment's
 * actual env variables. We do not mock config because it is a read-at-import
 * singleton; we assert the observable contract instead.
 *
 * createV2ChatModel is not exercised directly because it would attempt a real
 * OpenAI HTTP connection; testing it is gated by the OPENAI_API_KEY being set.
 */
import { isV2ModelConfigured } from "../model.js";

describe("isV2ModelConfigured", () => {
  test("returns a boolean", () => {
    const result = isV2ModelConfigured();
    expect(typeof result).toBe("boolean");
  });

  test("returns false when OPENAI_API_KEY env var is not set (default empty string)", () => {
    // In CI / unit-test runs the key is not set, so the default '' makes the
    // function return false. This is the intended guard.
    const hasKey = Boolean(process.env["OPENAI_API_KEY"]?.trim());
    const configured = isV2ModelConfigured();
    if (!hasKey) {
      expect(configured).toBe(false);
    } else {
      // Key is set (e.g. integration run): must also have a model name.
      expect(configured).toBe(Boolean(process.env["VIRLY_AI_MODEL"]?.trim() || "gpt-4o-mini"));
    }
  });
});
