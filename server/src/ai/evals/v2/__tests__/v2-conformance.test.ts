

/**
 * V2 live conformance suite (Node test runner).
 *
 * This is the RED suite for the V2 design: it drives long multi-turn
 * conversations through the live LLM and asserts the V2 behavioural contract.
 * Failures are the point — each one localises where the assistant does not yet
 * meet the V2 bar. The suite re-targets V2 automatically once `runAssistantUnderTest`
 * (in harness.ts) switches to the V2 graph.
 *
 * Opt-in (kept out of the default `npm test`):
 *   VIRLY_AI_V2_EVAL=1 OPENAI_API_KEY=... VIRLY_AI_MODEL=... \
 *     npx tsx --test src/ai/evals/v2/v2-conformance.test.ts
 * (server/.env is auto-loaded, so usually just: VIRLY_AI_V2_EVAL=1 ...)
 */
import { config } from "../../../../config.js";
import { assistantIds } from "../../../assistants.js";
import { createConfiguredAssistantLlmProvider } from "../../../llm.js";
import type { AssistantLlmProvider } from "../../../state.js";

import { collectTurnFailures, surfacedText } from "../assertions.js";
import { runScenarioLive } from "../harness.js";
import { judgeAnswer, judgeAvailable } from "../judge.js";
import { v2Scenarios } from "../scenarios.js";
import { WORLD, WORLD_RECENT_TX } from "../world.js";

const v2EvalEnabled = ["1", "true", "yes"].includes(
  (process.env.VIRLY_AI_V2_EVAL ?? "").trim().toLowerCase()
);
const liveReady = Boolean(config.ai.openAIApiKey.trim() && config.ai.model.trim());
const skip = !v2EvalEnabled
  ? "set VIRLY_AI_V2_EVAL=1 to run the live V2 conformance suite"
  : !liveReady
    ? "set OPENAI_API_KEY and VIRLY_AI_MODEL to run the live V2 conformance suite"
    : false;

/** Authoritative ground truth handed to the LLM judge for faithfulness checks. */
const WORLD_FACTS = {
  account: WORLD.account,
  limits: WORLD.limits,
  totals: {
    sentToRani: WORLD.counterparties.rani.totalSent,
    receivedFromRani: WORLD.counterparties.rani.totalReceived,
    sentToDan: WORLD.counterparties.dan.totalSent,
    receivedFromDan: WORLD.counterparties.dan.totalReceived,
    netWithDan: WORLD.counterparties.dan.totalReceived - WORLD.counterparties.dan.totalSent,
    sentToNoa: WORLD.counterparties.noa.totalSent
  },
  recentTransactions: WORLD_RECENT_TX
};

(skip ? describe.skip : describe)("V2 live conformance (LLM)", () => {
  let provider: AssistantLlmProvider;

  beforeAll(() => {
    const configured = createConfiguredAssistantLlmProvider();
    expect(configured).toBeTruthy();
    provider = configured!;
  });

  for (const scenario of v2Scenarios) {
    test(`${scenario.id}: ${scenario.title}`, async () => {
      const runs = await runScenarioLive(scenario, "oshri", provider);
      const failures: string[] = [];

      for (const run of runs) {
        failures.push(
          ...collectTurnFailures(scenario.id, run.index, run.expectation, run.result)
        );

        if (run.expectation.judge && judgeAvailable()) {
          const verdict = await judgeAnswer({
            userMessage: run.expectation.userMessage,
            reply: surfacedText(run.result),
            criteria: run.expectation.judge,
            facts: WORLD_FACTS
          });
          if (!verdict.pass) {
            failures.push(
              `${scenario.id} turn ${run.index} [${run.expectation.probes}]: judge: ${verdict.reason}`
            );
          }
        }
      }

      expect(failures.length).toBe(0);
    }, 240_000);
  }

  test(
    "personality independence: factual outcome identical across all assistants",
    async () => {
      const scenario = v2Scenarios[0]; // ends in: "send him the same I sent Rani" -> Dan, 320
      const outcomes: Record<string, string> = {};

      for (const id of assistantIds) {
        const runs = await runScenarioLive(scenario, id, provider);
        const transferTurn = runs[2]?.result;
        outcomes[id] = `${transferTurn?.confirmation?.recipientEmail ?? "none"}|${transferTurn?.confirmation?.amount ?? "none"}`;
      }

      const distinct = new Set(Object.values(outcomes));
      expect(distinct.size).toBe(1);
      expect([...distinct][0]).toBe("dan@example.com|320");
    },
    360_000
  );
});
