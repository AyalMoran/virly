import assert from "node:assert/strict";
import { describe, test } from "node:test";

import { HumanMessage } from "@langchain/core/messages";

import { V2AgentState } from "../state.js";

describe("v2 state summary channels", () => {
  // Note: assert channel PRESENCE on `.spec` (stable), not `.default()` (the
  // Annotation channel internals are version-specific). The default value (0) is
  // exercised behaviorally by the summarize/agent tests via `?? 0`.
  test("runningSummary and summaryCoveredCount channels exist on the root", () => {
    assert.ok(V2AgentState.spec.runningSummary, "runningSummary channel missing");
    assert.ok(
      V2AgentState.spec.summaryCoveredCount,
      "summaryCoveredCount channel missing"
    );
    // messages channel still present (appending reducer untouched)
    assert.ok(V2AgentState.spec.messages, "messages channel missing");
    void new HumanMessage("smoke");
  });
});
