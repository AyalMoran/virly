import { HumanMessage } from "@langchain/core/messages";

import { V2AgentState } from "../state.js";

describe("v2 state summary channels", () => {
  // Note: assert channel PRESENCE on `.spec` (stable), not `.default()` (the
  // Annotation channel internals are version-specific). The default value (0) is
  // exercised behaviorally by the summarize/agent tests via `?? 0`.
  test("runningSummary and summaryCoveredCount channels exist on the root", () => {
    expect(V2AgentState.spec.runningSummary).toBeTruthy();
    expect(V2AgentState.spec.summaryCoveredCount).toBeTruthy();
    // messages channel still present (appending reducer untouched)
    expect(V2AgentState.spec.messages).toBeTruthy();
    void new HumanMessage("smoke");
  });
});
