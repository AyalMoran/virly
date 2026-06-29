import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";

// Source assertion, NOT a build: buildResumableGraph() calls createV2ChatModel(),
// which constructs a ChatOpenAI and throws without an API key — so we must never
// call it in the no-key unit env. The compiled topology is validated by `tsc`
// (Task 9) and exercised live by the conformance suite (Task 9, Step 5).
describe("unified resumable graph wiring", () => {
  test("buildResumableGraph wires summarize between prepare/tools and agent", () => {
    const path = fileURLToPath(new URL("../hitl.ts", import.meta.url));
    const src = readFileSync(path, "utf8");
    expect(src).toMatch(/\.addNode\("summarize",\s*buildSummarizationNode\(model\)\)/);
    expect(src).toMatch(/\.addEdge\("prepare",\s*"summarize"\)/);
    expect(src).toMatch(/\.addEdge\("summarize",\s*"agent"\)/);
    expect(src).toMatch(/\.addEdge\("tools",\s*"summarize"\)/);
    // The money branch must remain intact.
    expect(src).toMatch(/\.addNode\("transferGate"/);
  });
});
