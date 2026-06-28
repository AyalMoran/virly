/**
 * Live, opt-in persona-tone guardrail: one serious (security-sensitive) turn per
 * assistant, asserting NO personality phrasing leaks. Mirrors the gating of
 * v2-conformance.test.ts. Run with:
 *
 *   VIRLY_AI_V2_EVAL=1 VIRLY_AI_GRAPH_VERSION=v2 LANGSMITH_TRACING=false \
 *     npx tsx --test src/ai/evals/v2/persona-tone.test.ts
 *
 * (server/.env is auto-loaded, so usually just: VIRLY_AI_V2_EVAL=1 ...)
 *
 * Note: PERSONA_SERIOUS_TURN is English, so replies come back in English where
 * the (Hebrew) phrase packs cannot surface — this asserts the model does not
 * switch into persona register on a serious turn. A Hebrew-stimulus variant that
 * exercises in-language phrase suppression is a possible future addition.
 */
import assert from "node:assert/strict";
import { before, describe, test } from "node:test";

import { config } from "../../../../config.js";
import { assistantIds } from "../../../assistants.js";
import { createConfiguredAssistantLlmProvider } from "../../../llm.js";
import type { AssistantLlmProvider } from "../../../state.js";

import { runScenarioLive } from "../harness.js";
import { collectPersonaLeakFailures, PERSONA_SERIOUS_TURN } from "../personaTone.js";

const enabled = ["1", "true", "yes"].includes(
  (process.env.VIRLY_AI_V2_EVAL ?? "").trim().toLowerCase()
);
const liveReady = Boolean(config.ai.openAIApiKey.trim() && config.ai.model.trim());
const skip = !enabled
  ? "set VIRLY_AI_V2_EVAL=1 to run the live persona-tone eval"
  : !liveReady
    ? "set OPENAI_API_KEY and VIRLY_AI_MODEL to run the live persona-tone eval"
    : false;

describe("V2 persona tone (LLM)", { skip }, () => {
  let provider: AssistantLlmProvider;
  before(() => {
    const configured = createConfiguredAssistantLlmProvider();
    assert.ok(configured, "Live LLM provider could not be constructed.");
    provider = configured;
  });

  for (const assistantId of assistantIds) {
    test(`${assistantId}: no personality leak on a serious (security-sensitive) turn`, { timeout: 120_000 }, async () => {
      const runs = await runScenarioLive(
        {
          id: `persona-serious-${assistantId}`,
          title: "serious tone — no persona leak",
          language: "en",
          tags: ["persona", "serious"],
          turns: [{ userMessage: PERSONA_SERIOUS_TURN, probes: "security-sensitive -> no persona phrases" }]
        },
        assistantId,
        provider
      );
      const failures = collectPersonaLeakFailures(assistantId, runs[0]!.result);
      assert.strictEqual(failures.length, 0, `\n  - ${failures.join("\n  - ")}\n`);
    });
  }
});
