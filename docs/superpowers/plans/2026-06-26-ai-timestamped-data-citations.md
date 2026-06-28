# AI Timestamped Data Citations Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Make the assistant cite the as-of time of the figures it reports — e.g.
"Based on your account as of 26 Jun, 10:00 …" / "נכון ל-26.6 בשעה 10:00 …" — so a
balance or total is never presented as timeless. Leaned into hard for the **Yohai**
persona (precise/analytical, whose guidance already mentions timestamps); used lightly
for the others.

**Architecture:** A `buildFreshnessDirective(assistantId, now, timezone)` helper
produces a per-persona prompt directive telling the agent when and how to attach an
"as of <time>" reference to time-sensitive figures (balances, totals, limits, FX). The
"now" it cites is the request time already present in the prompt's `[CONTEXT]` block
(the figures ARE read at that moment, so that timestamp is truthful). The directive is
inserted into `buildSystemPrompt`. Emphasis is persona-scoped: `yohai` = always;
others = when freshness matters or the user asks.

**Tech Stack:** v2 prompt (`server/src/ai/v2/prompt.ts`, `persona.ts`),
`node:test` + `tsx`.

## Global Constraints

- ESM: relative imports end in `.js`. Server unit tests: `cd server && npm test`.
- The cited timestamp is the **request/read time** (`input.now` + `input.timezone`),
  which the prompt already exposes — no per-tool timestamp plumbing in this plan.
- The directive is advisory tone/framing; it NEVER changes a number, confirmation, or
  warning, and it is suppressed on serious situations (the existing SERIOUS_TONE_RULE
  already strips flourish there — the freshness note stays plain/optional under it).
- Language-mirrored: the as-of phrasing is produced in the user's language by the
  model; the directive does not inject Hebrew on English turns.
- No new dependencies. TDD throughout.

## Approach & rationale

The phrase in the TODO ("Based on x true to timestamp…") is a freshness citation. The
data is fetched live each turn, so the honest "as of" time is the request time, which
`[CONTEXT]` already carries. Two approaches:

1. **Prompt directive citing the existing context time (chosen).** Cheap, accurate,
   persona-tunable, no tool-result schema changes. The model phrases it naturally in
   the user's language.
2. **Thread a real `asOf` per tool result** (e.g. balance read time, FX fetched-at) and
   require the model to cite the specific one. More precise for FX (which has a real
   `exchangeRateFetchedAt`), but a large change across ~20 tools and risks the model
   confusing multiple timestamps. Deferred — noted as a follow-up question; FX already
   surfaces its own fetched-at in its block.

Persona scoping fits the existing persona system: Yohai's `globalGuidance` already says
"timestamps"; this makes that concrete and distinguishing.

## File Structure

| File | Responsibility |
|---|---|
| `src/ai/v2/freshness.ts` (create) | `buildFreshnessDirective(assistantId, now, timezone)`. |
| `src/ai/v2/prompt.ts` (modify) | Insert the freshness directive (uses `now`/`timezone` already in scope). |
| `src/ai/v2/freshness.test.ts` (create) | Persona-scoped emphasis + content assertions. |
| `src/ai/v2/prompt.test.ts` (modify) | Assert the directive appears for Yohai. |
| `src/ai/evals/v2/scenarios.ts` (modify, optional) | Add a live-LLM scenario asserting Yohai cites an as-of reference (skip-gated). |

---

## Task 1: Freshness directive builder (persona-scoped)

**Files:**
- Create: `src/ai/v2/freshness.ts`
- Test: `src/ai/v2/freshness.test.ts`

**Interfaces:**
- Consumes: `AssistantId` (`../assistants.js`).
- Produces: `function buildFreshnessDirective(assistantId: AssistantId, now: Date, timezone: string): string`.

- [ ] **Step 1: Write the failing test**

```ts
// src/ai/v2/freshness.test.ts
import assert from "node:assert/strict";
import test from "node:test";
import { buildFreshnessDirective } from "./freshness.js";

const now = new Date("2026-06-26T10:00:00Z");

test("labels the directive and references the as-of time", () => {
  const d = buildFreshnessDirective("yohai", now, "Asia/Jerusalem");
  assert.match(d, /\[FRESHNESS\]/);
  assert.match(d, /as of/i);
});

test("yohai gets the strong 'always cite' variant", () => {
  const d = buildFreshnessDirective("yohai", now, "Asia/Jerusalem");
  assert.match(d, /always/i);
});

test("non-yohai personas get the soft variant (not 'always')", () => {
  for (const id of ["oshri", "chaya", "yehuda"] as const) {
    const d = buildFreshnessDirective(id, now, "Asia/Jerusalem");
    assert.doesNotMatch(d, /\balways\b/i);
    assert.match(d, /as of/i);
  }
});

test("does not inject a hardcoded Hebrew phrase (language mirroring stays the model's job)", () => {
  const d = buildFreshnessDirective("yohai", now, "Asia/Jerusalem");
  assert.doesNotMatch(d, /נכון ל/); // directive is in English; model renders the phrasing
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `cd server && npx tsx --test src/ai/v2/freshness.test.ts`
Expected: FAIL — module not found.

- [ ] **Step 3: Implement the builder**

```ts
// src/ai/v2/freshness.ts
import type { AssistantId } from "../assistants.js";

/**
 * Persona-scoped directive telling the agent to attach an "as of <request time>"
 * reference to time-sensitive figures. The time it cites is the request time the
 * prompt already exposes in [CONTEXT]; the figures are read at that moment, so the
 * reference is truthful. Phrasing is produced by the model in the user's language —
 * the directive itself injects no Hebrew.
 */
export function buildFreshnessDirective(
  assistantId: AssistantId,
  now: Date,
  timezone: string
): string {
  const stamp = `${now.toISOString()} (${timezone})`;
  const common = [
    "[FRESHNESS] The account figures you report (balance, totals, remaining limits,",
    "FX) are read live at the current request time. When you state such a figure, you",
    `may note it is "as of" that time (the [CONTEXT] time, ${stamp}), phrased naturally`,
    "in the user's language (e.g. English 'as of …', Hebrew 'נכון ל-…'). Never let the",
    "freshness note delay or obscure the number, and never invent a different time."
  ];

  if (assistantId === "yohai") {
    return [
      ...common,
      "As Yohai you ALWAYS attach a concise as-of reference to any reported figure —",
      "precision about WHEN a number is true is part of your voice. Keep it short and",
      "never let it sound like a disclaimer that weakens the figure."
    ].join("\n");
  }

  return [
    ...common,
    "Add the as-of reference when freshness matters (the user asks how current it is,",
    "or the figure could be read as stale) — not on every line."
  ].join("\n");
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `cd server && npx tsx --test src/ai/v2/freshness.test.ts`
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add server/src/ai/v2/freshness.ts server/src/ai/v2/freshness.test.ts
git commit -m "feat(ai): persona-scoped data-freshness directive builder"
```

---

## Task 2: Wire the directive into the system prompt

**Files:**
- Modify: `src/ai/v2/prompt.ts`
- Modify: `src/ai/v2/prompt.test.ts`

**Interfaces:**
- Consumes: `buildFreshnessDirective(input.assistantId, input.now, input.timezone)` (Task 1).
- Produces: `buildSystemPrompt` output contains a `[FRESHNESS]` section.

> Note: the freshness directive references `input.now`, which is per-turn, so it lives
> in the per-turn TAIL (near `[CONTEXT]`), NOT the cacheable prefix. Place it next to
> the `[CONTEXT]` line so the cacheable-prefix test from the few-shot plan still holds.

- [ ] **Step 1: Write the failing test**

Add to `src/ai/v2/prompt.test.ts`:

```ts
test("system prompt carries the freshness directive (strong for Yohai)", () => {
  const now = new Date("2026-06-26T10:00:00Z");
  const prompt = buildSystemPrompt({
    assistantId: "yohai",
    locale: "en",
    knownCounterparties: [],
    now,
    timezone: "Asia/Jerusalem"
  });
  assert.match(prompt, /\[FRESHNESS\]/);
  assert.match(prompt, /always/i);
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `cd server && npx tsx --test src/ai/v2/prompt.test.ts`
Expected: FAIL — `[FRESHNESS]` not present.

- [ ] **Step 3: Insert into the prompt**

In `src/ai/v2/prompt.ts`, import the builder and add the section in the per-turn tail,
right after the `[CONTEXT]` lines:

```ts
import { buildFreshnessDirective } from "./freshness.js";
```

```ts
    // [G. CONTEXT]
    `[CONTEXT] Today is ${input.now.toISOString()} (${input.timezone}). The user is`,
    "authenticated; you only ever see and act on their own account.",
    "",
    buildFreshnessDirective(input.assistantId, input.now, input.timezone),
    "",
    // [H. STYLE]
```

- [ ] **Step 4: Run test to verify it passes**

Run: `cd server && npx tsx --test src/ai/v2/prompt.test.ts`
Expected: PASS.

- [ ] **Step 5: Run prompt + persona suites**

Run: `cd server && npx tsx --test src/ai/v2/prompt.test.ts src/ai/v2/persona.test.ts`
Expected: PASS.

- [ ] **Step 6: Commit**

```bash
git add server/src/ai/v2/prompt.ts server/src/ai/v2/prompt.test.ts
git commit -m "feat(ai): cite as-of timestamp for reported figures (Yohai-forward)"
```

---

## Task 3 (optional): Live-LLM eval scenario

**Files:**
- Modify: `src/ai/evals/v2/scenarios.ts` (or `persona-tone.test.ts` data)

**Interfaces:**
- Consumes: existing `V2Scenario`/`V2TurnExpectation` shapes (`evals/v2/types.ts`).

- [ ] **Step 1: Add a skip-gated scenario**

Add a Yohai balance-inquiry scenario whose expectation asserts the reply contains an
as-of reference (regex like `/as of|נכון ל/i`). This runs only under
`VIRLY_AI_V2_EVAL=1 OPENAI_API_KEY=… VIRLY_AI_MODEL=…` (the suite is `{ skip }`-gated),
so it does not affect the default test run.

- [ ] **Step 2: Run the gated eval locally (manual)**

Run: `cd server && VIRLY_AI_V2_EVAL=1 OPENAI_API_KEY=… VIRLY_AI_MODEL=… npx tsx --test src/ai/evals/v2/persona-tone.test.ts`
Expected: the new Yohai assertion passes (manual, costs tokens — see the
[test-LLM-path plan](2026-06-26-ai-test-llm-path-investigation.md)).

- [ ] **Step 3: Commit**

```bash
git add server/src/ai/evals/v2/scenarios.ts
git commit -m "test(ai): live eval scenario for Yohai as-of citation"
```

---

## Self-Review

- **Spec coverage:** freshness directive (T1) wired into the prompt (T2), persona-scoped
  to Yohai-forward, with an optional live eval (T3). Covers "reply with timestamped
  info, 'Based on x true to timestamp…'".
- **Placeholder scan:** none.
- **Type consistency:** `buildFreshnessDirective(assistantId, now, timezone)` signature
  is identical across `freshness.ts`, its test, and `prompt.ts`.

## Open questions (answer later)

1. **"yohai daniel"** — is "daniel" a second persona to add, a person who asked for
   this, or a typo? This plan scopes the strong behavior to the existing **Yohai**
   persona and treats "daniel" as out of scope until clarified.
2. **Which timestamp** — request/read time (this plan), or the data's own source time
   (e.g. FX `exchangeRateFetchedAt`, last transaction time)? The latter is a larger
   per-tool change (deferred).
3. **All personas or Yohai-only** — should the soft variant be on for everyone, or
   should non-Yohai personas omit freshness entirely unless asked?
