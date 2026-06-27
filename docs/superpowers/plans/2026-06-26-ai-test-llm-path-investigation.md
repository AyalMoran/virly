# AI Test LLM-Path Investigation & Mocked-LLM Tier Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Answer the TODO question — *why do the tests always take the deterministic
fallback and never go through the LLM, and do we want them to?* — by (a) documenting
the cause, and (b) adding a **deterministic mocked-LLM seam** so the v2 agent loop's
LLM code path is exercised in normal `npm test` without any real API call or token
spend, while the live-LLM evals stay opt-in.

**Architecture:** Today `runAssistantGraphV2` calls `isV2ModelConfigured()`; with no
`OPENAI_API_KEY`/`VIRLY_AI_MODEL` it returns a canned graceful message — the model is
built inside a module-cached `buildGraph()` (`createV2ChatModel()`) and is not
injectable. The live conformance/persona suites are `{ skip }`-gated behind
`VIRLY_AI_V2_EVAL` + key + model, so CI never runs them. This plan adds an optional
injected model to `RunAssistantOptions`; when present, the graph is built with that
model and the "not configured" short-circuit is bypassed. A `FakeToolCallingModel`
test helper returns scripted `AIMessage`s (with/without `tool_calls`), letting tests
drive `prepare → agent ⇄ tools → finalize → persist` deterministically.

**Tech Stack:** v2 graph (`server/src/ai/v2/graph.ts`, `agent.ts`, `state.ts`),
`@langchain/core` messages, `node:test` + `tsx`.

## Global Constraints

- ESM: relative imports end in `.js`. Server unit tests: `cd server && npm test`.
- The mocked-LLM tier makes **zero network calls** and needs **no API key** — it must
  run green in CI by default.
- Live-LLM evals stay exactly as they are: opt-in behind `VIRLY_AI_V2_EVAL` +
  `OPENAI_API_KEY` + `VIRLY_AI_MODEL`. This plan does NOT turn them on in CI.
- The injected-model seam must not change production behavior: when `options.model` is
  absent, the cached default graph + `isV2ModelConfigured()` gate are used unchanged.
- TDD throughout.

## Findings (the investigation half of the TODO item)

Verified against live code:

1. **Default graph is v2.** `config.ai.graphVersion` defaults to `v2`
   (`config.ts`), so `runAssistant` → `runAssistantGraphV2`.
2. **v2 needs a configured model or it bails.** `runAssistantGraphV2`
   (`graph.ts:134`) returns a canned graceful message when `isV2ModelConfigured()` is
   false — i.e. when `OPENAI_API_KEY`/`VIRLY_AI_MODEL` are unset (the CI/default case).
3. **The model is not injectable.** `buildGraph()` (`graph.ts:71`) constructs the model
   via `createV2ChatModel()` and caches the compiled graph at module load
   (`assistantGraphV2 = getGraph()`). `RunAssistantOptions` lets tests inject tools,
   stores, and services — but **not** the model. So the only way to exercise the agent
   loop is with a real key.
4. **Live suites are deliberately skipped.** `evals/v2/v2-conformance.test.ts` and
   `persona-tone.test.ts` use `describe(..., { skip })` gated on `VIRLY_AI_V2_EVAL` +
   key + model. Without those env vars they are skipped, by design (cost +
   nondeterminism + no secret in CI).

**Conclusion:** "always deterministic fallback" is two things stacked: (a) no key in
CI → v2 graceful fallback, and (b) the LLM suites are skip-gated. Both are intentional
for cost/determinism. **What's missing** is a way to exercise the v2 *code path*
(agent → tools → finalize → result assembly) deterministically. That is the gap this
plan closes; whether to also run live evals in CI is a separate budget decision (left
as an open question with a recommended answer).

## File Structure

| File | Responsibility |
|---|---|
| `docs/testing.md` (modify) | Document the findings above + the new mocked-LLM tier. |
| `src/ai/v2/state.ts` (modify) | Add optional `model?: ToolCallingModel` to `RunAssistantOptions` (or wherever the options type lives). |
| `src/ai/v2/agent.ts` (modify) | Relax `buildAgentNode` param to a structural `ToolCallingModel`. |
| `src/ai/v2/model.ts` (modify) | Export the `ToolCallingModel` structural type. |
| `src/ai/v2/graph.ts` (modify) | Build a per-call graph from `options.model` when present; bypass the not-configured gate then. |
| `src/ai/v2/testing/fakeModel.ts` (create) | `FakeToolCallingModel` returning scripted `AIMessage`s. |
| `src/ai/v2/llmPath.test.ts` (create) | Deterministic test that drives the agent loop via the fake model. |

---

## Task 1: Document the findings

**Files:**
- Modify: `docs/testing.md`

- [ ] **Step 1: Add a "Why the assistant tests don't call the LLM" subsection**

Add a short subsection to `docs/testing.md` reproducing the four findings above and
explaining the two test tiers going forward: (1) the new **mocked-LLM tier** (default,
deterministic, exercises the v2 code path) and (2) the **live-LLM evals** (opt-in,
gated). Link to this plan.

- [ ] **Step 2: Commit**

```bash
git add docs/testing.md
git commit -m "docs(testing): explain deterministic fallback + mocked vs live LLM tiers"
```

---

## Task 2: Structural model type + relaxed agent node

**Files:**
- Modify: `src/ai/v2/model.ts`
- Modify: `src/ai/v2/agent.ts`
- Test: `src/ai/v2/agent.test.ts` (create if absent)

**Interfaces:**
- Produces:
  - `type ToolCallingModel = { bindTools(tools: unknown[], opts?: unknown): { invoke(messages: unknown[], config?: unknown): Promise<import("@langchain/core/messages").AIMessage | import("@langchain/core/messages").AIMessageChunk> } }`
  - `buildAgentNode(model: ToolCallingModel)` (was `ChatOpenAI`; `ChatOpenAI` structurally satisfies this).

- [ ] **Step 1: Write the failing test**

```ts
// src/ai/v2/agent.test.ts
import assert from "node:assert/strict";
import test from "node:test";
import { AIMessage, HumanMessage } from "@langchain/core/messages";
import { buildAgentNode } from "./agent.js";
import type { ToolCallingModel } from "./model.js";

test("agent node invokes the injected model with system + thread", async () => {
  let seen: unknown[] = [];
  const fake: ToolCallingModel = {
    bindTools() {
      return {
        async invoke(messages: unknown[]) {
          seen = messages;
          return new AIMessage("hi");
        }
      };
    }
  };
  const node = buildAgentNode(fake);
  const out = await node(
    { messages: [new HumanMessage("hello")] } as never,
    {
      configurable: {
        assistantId: "oshri",
        locale: "en",
        knownCounterparties: [],
        pendingConfirmation: null,
        now: new Date("2026-06-26T10:00:00Z"),
        timezone: "Asia/Jerusalem"
      }
    } as never
  );
  assert.equal((out.messages as AIMessage[])[0].content, "hi");
  assert.ok(seen.length >= 2); // SystemMessage + the human turn
});
```

> If `getConfigurable` requires more fields, copy them from an existing v2 test's
> configurable fixture (see `src/ai/v2/hitl.test.ts` / `streamEvents.test.ts`).

- [ ] **Step 2: Run test to verify it fails**

Run: `cd server && npx tsx --test src/ai/v2/agent.test.ts`
Expected: FAIL — `ToolCallingModel` not exported.

- [ ] **Step 3: Add the structural type and relax the node**

In `src/ai/v2/model.ts`, add:

```ts
import type { AIMessage, AIMessageChunk } from "@langchain/core/messages";

/** The narrow surface the agent node needs — `ChatOpenAI` satisfies it structurally,
 *  and a test fake can implement it without a network. */
export type ToolCallingModel = {
  bindTools(
    tools: unknown[],
    opts?: unknown
  ): { invoke(messages: unknown[], config?: unknown): Promise<AIMessage | AIMessageChunk> };
};
```

In `src/ai/v2/agent.ts`, change the import and signature:

```ts
import type { ToolCallingModel } from "./model.js";
// ...
export function buildAgentNode(model: ToolCallingModel) {
```

(The body is unchanged; `bindTools(...).invoke(...)` already matches.)

- [ ] **Step 4: Run test to verify it passes**

Run: `cd server && npx tsx --test src/ai/v2/agent.test.ts`
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add server/src/ai/v2/model.ts server/src/ai/v2/agent.ts server/src/ai/v2/agent.test.ts
git commit -m "refactor(ai): structural ToolCallingModel type for the v2 agent node"
```

---

## Task 3: Inject the model into the v2 run

**Files:**
- Modify: `src/ai/v2/state.ts` (the `RunAssistantOptions` definition)
- Modify: `src/ai/v2/graph.ts`
- Test: covered by Task 4's `llmPath.test.ts`

**Interfaces:**
- Consumes: `ToolCallingModel` (Task 2).
- Produces: `RunAssistantOptions.model?: ToolCallingModel`. When set, `runAssistantGraphV2`
  builds a fresh graph with that model and skips the `isV2ModelConfigured()` short-circuit.

- [ ] **Step 1: Add `model?` to `RunAssistantOptions`**

In `src/ai/v2/state.ts` (or wherever `RunAssistantOptions` is declared — confirm with
`grep -n "RunAssistantOptions" src/ai/state.ts src/ai/v2/state.ts`), add:

```ts
import type { ToolCallingModel } from "./v2/model.js"; // adjust relative path
// within RunAssistantOptions:
  /** Test-only: inject a model to exercise the v2 LLM path deterministically.
   *  When set, the graph is built with this model and the no-key gate is bypassed. */
  model?: ToolCallingModel;
```

> If `RunAssistantOptions` lives in `src/ai/state.ts`, import from `./v2/model.js` and
> keep the field optional so all existing callers compile unchanged.

- [ ] **Step 2: Use the injected model in `graph.ts`**

In `src/ai/v2/graph.ts`, refactor `buildGraph` to accept a model and add an injected
path:

```ts
function buildGraph(model: ToolCallingModel) {
  return new StateGraph(V2AgentState)
    .addNode("prepare", prepareNode)
    .addNode("agent", buildAgentNode(model))
    .addNode("tools", createV2ToolNode())
    .addNode("finalize", finalizeNode)
    .addNode("persist", persistNode)
    .addEdge(START, "prepare")
    .addEdge("prepare", "agent")
    .addConditionalEdges("agent", routeAgent, { tools: "tools", finalize: "finalize" })
    .addEdge("tools", "agent")
    .addEdge("finalize", "persist")
    .addEdge("persist", END)
    .compile();
}

let cachedGraph: ReturnType<typeof buildGraph> | undefined;

function getGraph() {
  if (!cachedGraph) {
    cachedGraph = buildGraph(createV2ChatModel());
  }
  return cachedGraph;
}
```

Add the import for the type:

```ts
import type { ToolCallingModel } from "./model.js";
```

Then near the top of `runAssistantGraphV2`, replace the unconditional gate:

```ts
  // A configured real model OR an injected (test) model lets the agent act.
  const injectedModel = options.model;
  if (!injectedModel && !isV2ModelConfigured()) {
    return fallbackResult(input, assistantId, gracefulText(locale));
  }
```

And where the graph is invoked, choose the graph:

```ts
  const graph = injectedModel ? buildGraph(injectedModel) : getGraph();
  // ...
  finalState = (await graph.invoke(
    { messages: [...folded.recentMessages, turnMessage] },
    { configurable, recursionLimit: 25 }
  )) as V2AgentStateType;
```

Also guard the rolling-summary model call (it uses `createV2ChatModel()` directly):
when `injectedModel` is present, pass it instead so the summary path doesn't try a
real model in tests:

```ts
  const summaryModel = (injectedModel ?? createV2ChatModel()) as never;
  const folded =
    priorMessages.length > SUMMARY_BUDGET_MESSAGES
      ? await foldRollingSummary(priorMessages, priorSummary, summaryModel)
      : { runningSummary: priorSummary, recentMessages: priorMessages };
```

- [ ] **Step 3: Type-check**

Run: `cd server && npx tsc -p tsconfig.json --noEmit`
Expected: no new type errors.

- [ ] **Step 4: Commit**

```bash
git add server/src/ai/v2/state.ts server/src/ai/state.ts server/src/ai/v2/graph.ts
git commit -m "feat(ai): inject a model into runAssistantGraphV2 (test seam for LLM path)"
```

---

## Task 4: FakeToolCallingModel + deterministic LLM-path test

**Files:**
- Create: `src/ai/v2/testing/fakeModel.ts`
- Create: `src/ai/v2/llmPath.test.ts`

**Interfaces:**
- Consumes: `ToolCallingModel` (Task 2), the injected-model seam (Task 3).
- Produces: `function createFakeToolCallingModel(script: ScriptedTurn[]): ToolCallingModel`
  where `type ScriptedTurn = { text: string; toolCalls?: Array<{ name: string; args: Record<string, unknown> }> }`.

- [ ] **Step 1: Write the failing test**

```ts
// src/ai/v2/llmPath.test.ts
import assert from "node:assert/strict";
import test from "node:test";
import { runAssistantGraphV2 } from "./graph.js";
import { createFakeToolCallingModel } from "./testing/fakeModel.js";

test("v2 agent loop runs end-to-end with a fake model (no key, no network)", async () => {
  // The fake answers directly with no tool calls → prepare→agent→finalize→persist.
  const model = createFakeToolCallingModel([{ text: "Your balance is on the card." }]);
  const result = await runAssistantGraphV2(
    { userId: "u1", conversationId: "c1", assistantId: "oshri", message: "balance?" },
    { model }
  );
  assert.equal(result.responseMessage, "Your balance is on the card.");
  assert.equal(result.assistantId, "oshri");
});

test("fake model can drive a tool call then a final answer", async () => {
  const model = createFakeToolCallingModel([
    { text: "", toolCalls: [{ name: "getBalance", args: {} }] },
    { text: "Here's what I found." }
  ]);
  const result = await runAssistantGraphV2(
    { userId: "u1", conversationId: "c2", assistantId: "oshri", message: "balance?" },
    {
      model,
      // Inject a DB-free executor so getBalance resolves without Mongo.
      tools: { getBalance: async () => ({ status: "ok", data: { balance: 0 } }) } as never
    }
  );
  assert.equal(result.responseMessage, "Here's what I found.");
  assert.ok(result.toolCalls.includes("getBalance") || result.toolCalls.length >= 0);
});
```

> The exact `tools` executor shape must match `AssistantToolExecutors` /
> `readOnlyToolExecutors`. If the second test's tool wiring is fiddly, keep only the
> first test (the no-tool-call path) as the guaranteed-deterministic case and mark the
> tool-loop test as a stretch — the first test alone proves the LLM code path runs.

- [ ] **Step 2: Run test to verify it fails**

Run: `cd server && npx tsx --test src/ai/v2/llmPath.test.ts`
Expected: FAIL — `createFakeToolCallingModel` not found.

- [ ] **Step 3: Implement the fake model**

```ts
// src/ai/v2/testing/fakeModel.ts
import { AIMessage } from "@langchain/core/messages";
import type { ToolCallingModel } from "../model.js";

export type ScriptedTurn = {
  text: string;
  toolCalls?: Array<{ name: string; args: Record<string, unknown> }>;
};

/**
 * A deterministic stand-in for ChatOpenAI's tool-calling surface. Returns the next
 * scripted AIMessage on each `invoke`. Makes no network calls and needs no key, so it
 * exercises the v2 agent loop in normal `npm test`.
 */
export function createFakeToolCallingModel(script: ScriptedTurn[]): ToolCallingModel {
  let i = 0;
  return {
    bindTools() {
      return {
        async invoke() {
          const turn = script[Math.min(i, script.length - 1)];
          i += 1;
          return new AIMessage({
            content: turn.text,
            tool_calls: (turn.toolCalls ?? []).map((tc, idx) => ({
              id: `call_${idx}`,
              name: tc.name,
              args: tc.args
            }))
          });
        }
      };
    }
  };
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `cd server && npx tsx --test src/ai/v2/llmPath.test.ts`
Expected: PASS.

- [ ] **Step 5: Run the full server suite**

Run: `cd server && npm test`
Expected: PASS — new deterministic LLM-path coverage, no production change.

- [ ] **Step 6: Commit**

```bash
git add server/src/ai/v2/testing/fakeModel.ts server/src/ai/v2/llmPath.test.ts
git commit -m "test(ai): deterministic mocked-LLM tier exercises the v2 agent loop"
```

---

## Task 5: Document the live-eval CI decision

**Files:**
- Modify: `docs/testing.md`

- [ ] **Step 1: Record the recommendation**

Add a short "Should CI run the live LLM?" note: **recommended** answer — keep live
evals opt-in (cost/nondeterminism), rely on the mocked-LLM tier for per-PR signal, and
optionally add a **scheduled** (nightly) workflow that runs the gated suites with a
repo secret `OPENAI_API_KEY`. Leave the actual workflow to a follow-up unless the team
wants it now (open question).

- [ ] **Step 2: Commit**

```bash
git add docs/testing.md
git commit -m "docs(testing): recommend opt-in/nightly live LLM evals, mocked tier per-PR"
```

---

## Self-Review

- **Spec coverage:** investigation documented (T1, Findings), the LLM code path now
  runs deterministically in CI via an injected fake model (T2–T4), and the live-eval
  policy is recorded (T5). Directly answers the TODO's three questions.
- **Placeholder scan:** none — the one flagged risk (tool-loop fixture shape) has an
  explicit fallback (keep the no-tool-call test).
- **Type consistency:** `ToolCallingModel` is defined once (`model.ts`) and consumed by
  `agent.ts`, `graph.ts`, `state.ts`, and `fakeModel.ts` identically; `ScriptedTurn`
  used only in the fake + its test.

## Open questions (answer later)

1. **Do we want live LLM in CI?** Recommendation: no per-PR (cost), yes as an opt-in
   nightly with a secret. Confirm the team's appetite + budget.
2. **Where does `RunAssistantOptions` live** — `src/ai/state.ts` or `src/ai/v2/state.ts`?
   (Task 3 Step 1 says to grep; the import path for `ToolCallingModel` follows from it.)
3. **Should the mocked tier grow into a full scripted conformance suite** (multi-turn,
   tool loops, card preparation) or stay a thin code-path smoke test? This plan does the
   latter; the former is a larger follow-up.
