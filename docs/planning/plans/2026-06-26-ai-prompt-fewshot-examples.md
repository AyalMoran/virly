# AI Prompt Few-Shot Examples Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Add a curated, data-driven `[EXAMPLES]` section to the v2 system prompt that
demonstrates the decision pattern (which tools to call, how to phrase the reply) for
the common intents, improving tool selection and reply quality without inventing
account data — kept in the prompt's cacheable stable prefix.

**Architecture:** A new `examples.ts` holds an array of `PromptExample`s, each a
short *trajectory sketch* — a user message and the ideal behavior expressed as a tool
plan + a phrasing note (NOT fabricated balances/totals, which would teach the model to
invent numbers). `renderExamplesSection()` formats them. `buildSystemPrompt` inserts
the section in the stable prefix (before the per-turn tail), so prompt caching is
preserved. A prompt test asserts the examples render and stay in the cacheable region.

**Tech Stack:** v2 prompt (`server/src/ai/v2/prompt.ts`), `node:test` + `tsx`.

## Global Constraints

- ESM: relative imports end in `.js`. Server unit tests: `cd server && npm test`.
- Examples are **behavioral sketches**, never concrete fabricated figures — they must
  not contradict the prompt's "NEVER answer from memory / NEVER compute totals
  yourself" rule.
- The `[EXAMPLES]` section sits in the STABLE, prompt-cacheable prefix (before
  `[KNOWN COUNTERPARTIES]`, the active card, and the date). Cacheability is a hard
  requirement — assert it in a test.
- No new dependencies. TDD throughout.

## Approach & rationale

The prompt already has three inline one-liner examples under `[CAPABILITIES]`. This
plan extracts examples into structured data and expands coverage to the intents users
hit most (multi-part questions, coreference, totals direction, prepare-then-confirm,
missing-detail clarification). Two options were weighed:

1. **Behavioral trajectory sketches (chosen).** Each example shows the user message,
   the tool plan, and a phrasing note — teaching the *process* without fake outputs.
   Safe against number-invention; compact; easy to extend.
2. **Full message-history few-shot (user/assistant/tool turns with sample outputs).**
   Most faithful to real few-shot prompting but bakes in fabricated tool results the
   model may echo as real data, and balloons the prompt. Rejected for a banking agent.

## File Structure

| File | Responsibility |
|---|---|
| `src/ai/v2/examples.ts` (create) | `PromptExample` type, the curated `PROMPT_EXAMPLES` array, `renderExamplesSection()`. |
| `src/ai/v2/prompt.ts` (modify) | Insert the rendered examples section into the stable prefix. |
| `src/ai/v2/examples.test.ts` (create) | Asserts content + safety (no fabricated ₪ figures in example outputs). |
| `src/ai/v2/prompt.test.ts` (modify) | Assert the examples appear and stay in the cacheable prefix. |

---

## Task 1: Examples data + renderer

**Files:**
- Create: `src/ai/v2/examples.ts`
- Test: `src/ai/v2/examples.test.ts`

**Interfaces:**
- Produces:
  - `type PromptExample = { user: string; toolPlan: string; phrasing: string }`
  - `const PROMPT_EXAMPLES: PromptExample[]`
  - `function renderExamplesSection(): string`

- [ ] **Step 1: Write the failing test**

```ts
// src/ai/v2/examples.test.ts
import assert from "node:assert/strict";
import test from "node:test";
import { PROMPT_EXAMPLES, renderExamplesSection } from "./examples.js";

test("ships a meaningful set of examples", () => {
  assert.ok(PROMPT_EXAMPLES.length >= 6);
});

test("examples never bake in a concrete shekel figure (no invented numbers)", () => {
  for (const ex of PROMPT_EXAMPLES) {
    const blob = `${ex.toolPlan} ${ex.phrasing}`;
    assert.doesNotMatch(blob, /₪\s?\d/, `example for "${ex.user}" hardcodes a ₪ amount`);
  }
});

test("rendered section is labelled and lists each user message", () => {
  const section = renderExamplesSection();
  assert.match(section, /\[EXAMPLES\]/);
  for (const ex of PROMPT_EXAMPLES) {
    assert.ok(section.includes(ex.user), `missing example: ${ex.user}`);
  }
});

test("covers multi-part, coreference, totals-direction, prepare, and clarification", () => {
  const users = PROMPT_EXAMPLES.map((e) => e.user.toLowerCase()).join(" | ");
  assert.match(users, /and/); // a multi-part question
  assert.match(users, /those|that|same|him|her/); // coreference
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `cd server && npx tsx --test src/ai/v2/examples.test.ts`
Expected: FAIL — module not found.

- [ ] **Step 3: Implement examples + renderer**

```ts
// src/ai/v2/examples.ts
/**
 * Few-shot decision sketches for the v2 system prompt. Each example teaches the
 * tool-selection + phrasing PATTERN for an intent. It deliberately carries NO
 * concrete amounts/balances — the model must read those from tools at runtime, and
 * a baked figure here would teach it to invent. Sits in the cacheable prefix.
 */
export type PromptExample = {
  /** A representative user message. */
  user: string;
  /** Which tool(s) to call and in what shape, in prose. */
  toolPlan: string;
  /** How to phrase the reply once the tools return. */
  phrasing: string;
};

export const PROMPT_EXAMPLES: PromptExample[] = [
  {
    user: "what's my balance and who did I pay last?",
    toolPlan: "Call getBalance and getLastSent in parallel (independent).",
    phrasing:
      "Answer BOTH parts in one reply: state the balance the tool returned, then who they last paid."
  },
  {
    user: "how much have I sent Rani in total?",
    toolPlan:
      "Resolve Rani to an email from the known-counterparties list (or findCounterparty), then getTotals(counterpartyEmail, direction:'sent').",
    phrasing:
      "State the direction explicitly: 'You sent Rani <the tool's figure>'. Never compute it yourself."
  },
  {
    user: "show me those",
    toolPlan:
      "Resolve 'those' from the prior turn (e.g. the person just discussed) and call getCounterpartyTransactions for that email.",
    phrasing:
      "A one-line intro; the transaction card renders the rows — don't restate every row."
  },
  {
    user: "send Dan the same amount I sent Rani",
    toolPlan:
      "Compute the contextual amount yourself from what was surfaced earlier, resolve Dan's email, then call prepareTransfer with the final number. The 'Rani' in the amount phrase names the amount's SOURCE, not the recipient.",
    phrasing:
      "Say it is prepared and awaiting their confirmation on the card; do not claim it was sent."
  },
  {
    user: "transfer 200",
    toolPlan:
      "Recipient is missing/ambiguous — call requestClarification(reason, question) FIRST, do not call prepareTransfer.",
    phrasing:
      "Ask the one missing thing plainly (no slang, no jokes): who should receive it?"
  },
  {
    user: "did my transfer to Maya go through?",
    toolPlan:
      "Call the pending/status tool for Maya; report the status from trusted state.",
    phrasing:
      "State the exact status. Pending is not completed; never imply money moved unless a tool confirms execution."
  },
  {
    user: "מה היתרה שלי וכמה שלחתי לדני החודש?",
    toolPlan:
      "getBalance plus getTotals for Dan scoped to this month, in parallel where independent.",
    phrasing:
      "Reply fully in Hebrew, answer both parts, state each figure with its direction."
  }
];

export function renderExamplesSection(): string {
  const lines = PROMPT_EXAMPLES.map(
    (ex) => `- User: "${ex.user}"\n  Plan: ${ex.toolPlan}\n  Reply: ${ex.phrasing}`
  );
  return [
    "[EXAMPLES] How to handle common requests. These show the PROCESS (which tools,",
    "how to phrase) — the real numbers always come from the tools at runtime, never",
    "from these examples:",
    ...lines
  ].join("\n");
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `cd server && npx tsx --test src/ai/v2/examples.test.ts`
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add server/src/ai/v2/examples.ts server/src/ai/v2/examples.test.ts
git commit -m "feat(ai): curated few-shot examples data + renderer"
```

---

## Task 2: Insert examples into the stable prompt prefix

**Files:**
- Modify: `src/ai/v2/prompt.ts`
- Modify: `src/ai/v2/prompt.test.ts`

**Interfaces:**
- Consumes: `renderExamplesSection()` (Task 1).
- Produces: `buildSystemPrompt` output now contains an `[EXAMPLES]` section located
  before the per-turn tail (`[KNOWN COUNTERPARTIES]`, the active-card line, `[CONTEXT]`).

- [ ] **Step 1: Write the failing test**

Add to `src/ai/v2/prompt.test.ts`:

```ts
import { renderExamplesSection } from "./examples.js";

test("system prompt includes the examples section in the cacheable prefix", () => {
  const now = new Date("2026-06-26T10:00:00Z");
  const prompt = buildSystemPrompt({
    assistantId: "oshri",
    locale: "en",
    knownCounterparties: [{ email: "rani@example.com", label: "Rani", aliases: [] }],
    now,
    timezone: "Asia/Jerusalem"
  });
  assert.ok(prompt.includes("[EXAMPLES]"));
  // The examples must come BEFORE the per-turn tail so the cacheable prefix is stable.
  assert.ok(prompt.indexOf("[EXAMPLES]") < prompt.indexOf("[KNOWN COUNTERPARTIES]"));
});

test("examples region is invariant across per-turn changes (cacheability)", () => {
  const base = {
    assistantId: "oshri" as const,
    locale: "en" as const,
    now: new Date("2026-06-26T10:00:00Z"),
    timezone: "Asia/Jerusalem"
  };
  const a = buildSystemPrompt({ ...base, knownCounterparties: [] });
  const b = buildSystemPrompt({
    ...base,
    knownCounterparties: [{ email: "x@y.com", label: "X", aliases: [] }]
  });
  const slice = (p: string) => p.slice(0, p.indexOf("[KNOWN COUNTERPARTIES]"));
  assert.equal(slice(a), slice(b)); // prefix (incl. examples) unchanged by tail
});
```

(If `prompt.test.ts` already imports `buildSystemPrompt` and `assert`/`test`, reuse
those imports; add only `renderExamplesSection` if you reference it.)

- [ ] **Step 2: Run test to verify it fails**

Run: `cd server && npx tsx --test src/ai/v2/prompt.test.ts`
Expected: FAIL — `[EXAMPLES]` not in the prompt.

- [ ] **Step 3: Insert the section**

In `src/ai/v2/prompt.ts`, import the renderer and place the section in the stable
prefix — after the `[CAPABILITIES]`/`[REFERENCES]`/`[MONEY]` blocks but **before** the
`pending` line and `[KNOWN COUNTERPARTIES]` (which are per-turn). Add at the top:

```ts
import { renderExamplesSection } from "./examples.js";
```

Then in the returned array, insert immediately before the `// [E. MONEY]` section (or
right after it, but in all cases before `pending`):

```ts
    "",
    renderExamplesSection(),
    "",
    // [E. MONEY] — the confirmation rule
```

- [ ] **Step 4: Run test to verify it passes**

Run: `cd server && npx tsx --test src/ai/v2/prompt.test.ts`
Expected: PASS.

- [ ] **Step 5: Run the v2 prompt + persona suites**

Run: `cd server && npx tsx --test src/ai/v2/prompt.test.ts src/ai/v2/persona.test.ts`
Expected: PASS.

- [ ] **Step 6: Commit**

```bash
git add server/src/ai/v2/prompt.ts server/src/ai/v2/prompt.test.ts
git commit -m "feat(ai): add few-shot examples section to v2 system prompt prefix"
```

---

## Self-Review

- **Spec coverage:** "more examples for LLM" → curated, extensible examples (T1) wired
  into the prompt's cacheable prefix (T2), with safety against fabricated numbers
  asserted by tests.
- **Placeholder scan:** none.
- **Type consistency:** `PromptExample` and `renderExamplesSection()` used identically
  in `examples.ts`, its test, and `prompt.ts`.

## Open questions (answer later)

1. **Interpretation** — does "more examples for LLM" mean (a) few-shot in the prompt
   (this plan), (b) more eval scenarios in `evals/v2/scenarios.ts`, or (c) more entries
   in the LangSmith dataset? If (b)/(c), say so and I'll write that instead/additionally.
2. **v1 parity** — should v1's deterministic pipeline also gain examples, or is this
   v2-only? (v1 doesn't prompt the model the same way; likely v2-only.)
3. **Coverage priorities** — which real user phrasings have been failing? Those should
   become the next examples.
