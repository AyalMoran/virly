# V2 Assistant Personality Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Make the v2 graph reply *in the voice of the user-selected assistant* (oshri/chaya/yehuda/yohai_daniel), not just under its name.

**Architecture:** Personality is injected into the **agent's system prompt** (single pass, fully streamed) — NOT a new node and NOT `finalize`, both of which would force a second LLM pass that breaks streaming and revives v1's compose+lint loop. We add a `[PERSONA]` section (identity + traits + `globalGuidance` + a hard "be plain on serious situations" rule + a few Hebrew phrases as *spirit* exemplars) and a **non-blocking, eval-only** `lintPersonalityUsage` guardrail proving no persona phrases leak on serious turns.

**Tech Stack:** TypeScript, LangGraph.js, `node:test` (`tsx --test`), existing `server/src/ai/responseStyle.ts` + `server/src/ai/assistants.ts`.

---

## Context

The v2 system prompt ([server/src/ai/v2/prompt.ts](../../../server/src/ai/v2/prompt.ts)) uses only `persona.name` (line 68) and a generic "[STYLE] personality is a light tone layer" line; it ignores each persona's `role`, `traits`, `globalGuidance`, and `phrasePacks` (`server/src/ai/assistants.ts`). So every assistant currently sounds identical. The [agent node](../../../server/src/ai/v2/agent.ts) builds that prompt and generates the streamed reply; [finalize](../../../server/src/ai/v2/nodes/finalize.ts) does no model call. Therefore the only place personality can shape the streamed text in one pass is the system prompt. The v1 phrase-pack/lint machinery in `responseStyle.ts` is reused for the eval guardrail but NOT for a runtime retry (that would break streaming).

## File Structure

- **Create** `server/src/ai/v2/persona.ts` — `buildPersonaSection(assistantId)`; pure, deterministic, unit-testable without an LLM. One responsibility: render the `[PERSONA]` prompt block.
- **Create** `server/src/ai/v2/persona.test.ts` — unit tests for the above.
- **Modify** `server/src/ai/v2/prompt.ts` — insert the persona section (additive).
- **Create** `server/src/ai/v2/prompt.test.ts` — assert the prompt now embeds the selected persona.
- **Create** `server/src/ai/evals/v2/personaTone.ts` — `collectPersonaLeakFailures(...)` + the serious-turn constant; reuses `lintPersonalityUsage`.
- **Create** `server/src/ai/evals/v2/persona-tone.test.ts` — gated live eval, one serious turn per assistant.
- **Modify** `docs/ai-graph-v2/01-design.md` + `server/src/ai/evals/v2/README.md` — document where personality lives + the new eval.

---

## Task 1: Persona section builder

**Files:**
- Create: `server/src/ai/v2/persona.ts`
- Test: `server/src/ai/v2/persona.test.ts`

- [ ] **Step 1: Write the failing test**

```ts
// server/src/ai/v2/persona.test.ts
import assert from "node:assert/strict";
import { test } from "node:test";
import { buildPersonaSection } from "./persona.js";
import { assistantIds, getAssistantPersonality } from "../assistants.js";

test("persona section includes name, role, a trait, and globalGuidance", () => {
  const s = buildPersonaSection("oshri");
  const p = getAssistantPersonality("oshri");
  assert.match(s, /\[PERSONA\] You are Oshri/);
  assert.ok(s.includes(p.role));
  assert.ok(s.includes(p.traits[0]!));
  assert.ok(s.includes(p.globalGuidance.slice(0, 24)));
});

test("every persona carries the serious-situations rule and the Hebrew-leak guard", () => {
  for (const id of assistantIds) {
    const s = buildPersonaSection(id);
    assert.match(s, /SERIOUS SITUATIONS/);
    assert.match(s, /do NOT inject Hebrew/);
  }
});

test("personas are distinguishable and carry distinct traits", () => {
  assert.notStrictEqual(buildPersonaSection("oshri"), buildPersonaSection("yehuda"));
  assert.match(buildPersonaSection("yehuda"), /sarcastic/);
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `cd server && npx tsx --test src/ai/v2/persona.test.ts`
Expected: FAIL — cannot find module `./persona.js` / `buildPersonaSection` is not exported.

- [ ] **Step 3: Write minimal implementation**

```ts
// server/src/ai/v2/persona.ts
/**
 * The [PERSONA] section of the v2 system prompt. v2 puts personality in the
 * agent's system prompt so the streamed reply is in-character in ONE pass — no
 * second compose node, no post-hoc rewrite (design §H). Injects identity + voice
 * + globalGuidance, a hard "be plain on serious situations" rule, and a few
 * Hebrew phrases as SPIRIT exemplars (never verbatim filler, never overriding
 * the language-mirroring rule).
 */
import { getAssistantPersonality, type AssistantId } from "../assistants.js";
import type { ResponseSituation } from "../responseStyle.js";

const EXEMPLAR_SITUATIONS: ResponseSituation[] = [
  "balance_inquiry_success",
  "account_summary_success",
  "transaction_history_success",
  "general_help"
];
const MAX_EXEMPLARS = 4;

const SERIOUS_TONE_RULE = [
  "[TONE — SERIOUS SITUATIONS] Drop ALL humor, slang, blessings, sarcasm, and",
  "success-flavored phrases, and use plain, careful, neutral wording, whenever the",
  "situation is serious: insufficient funds; a failed, declined, or cancelled",
  "transfer; a security-sensitive or out-of-scope request; or when you must ask for",
  "a missing recipient or amount. Personality returns only on safe, successful,",
  "read-only or prepared-transfer replies, and even then it is a light garnish that",
  "never obscures a number, confirmation, or warning."
].join("\n");

function collectSpiritExemplars(assistantId: AssistantId): string[] {
  const persona = getAssistantPersonality(assistantId);
  const out: string[] = [];
  for (const situation of EXEMPLAR_SITUATIONS) {
    const pack = persona.phrasePacks[situation];
    if (!pack) continue;
    for (const phrase of [
      ...(pack.openings ?? []),
      ...(pack.resultIntros ?? []),
      ...(pack.closings ?? []),
      ...(pack.flavor ?? [])
    ]) {
      if (!out.includes(phrase)) out.push(phrase);
      if (out.length >= MAX_EXEMPLARS) return out;
    }
  }
  return out;
}

export function buildPersonaSection(assistantId: AssistantId): string {
  const persona = getAssistantPersonality(assistantId);
  const exemplars = collectSpiritExemplars(assistantId);
  return [
    `[PERSONA] You are ${persona.name} — ${persona.role}.`,
    `Voice: ${persona.traits.join(", ")}.`,
    persona.globalGuidance,
    exemplars.length
      ? `Voice exemplars (these Hebrew phrases illustrate ${persona.name}'s SPIRIT/register only — do NOT reuse them verbatim as filler, do NOT inject Hebrew into a non-Hebrew reply; when replying in another language match the register, not the words): ${exemplars.map((p) => `“${p}”`).join("; ")}.`
      : "",
    SERIOUS_TONE_RULE
  ]
    .filter(Boolean)
    .join("\n");
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `cd server && npx tsx --test src/ai/v2/persona.test.ts`
Expected: PASS (3 tests).

- [ ] **Step 5: Commit**

```bash
git add server/src/ai/v2/persona.ts server/src/ai/v2/persona.test.ts
git commit -m "feat(ai-v2): persona section builder for the system prompt"
```

---

## Task 2: Wire the persona section into the system prompt

**Files:**
- Modify: `server/src/ai/v2/prompt.ts`
- Test: `server/src/ai/v2/prompt.test.ts`

- [ ] **Step 1: Write the failing test**

```ts
// server/src/ai/v2/prompt.test.ts
import assert from "node:assert/strict";
import { test } from "node:test";
import { buildSystemPrompt } from "./prompt.js";

const base = {
  locale: "en" as const,
  knownCounterparties: [],
  pendingConfirmation: null,
  now: new Date("2026-06-15T00:00:00.000Z"),
  timezone: "Asia/Jerusalem"
};

test("system prompt embeds the selected persona's voice + serious rule", () => {
  const p = buildSystemPrompt({ assistantId: "yehuda", ...base });
  assert.match(p, /\[PERSONA\] You are Yehuda/);
  assert.match(p, /sarcastic/);
  assert.match(p, /SERIOUS SITUATIONS/);
});

test("different personas produce different system prompts", () => {
  const a = buildSystemPrompt({ assistantId: "oshri", ...base });
  const b = buildSystemPrompt({ assistantId: "chaya", ...base });
  assert.notStrictEqual(a, b);
  assert.match(a, /playful/);
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `cd server && npx tsx --test src/ai/v2/prompt.test.ts`
Expected: FAIL — `/\[PERSONA\]/` not found (prompt only has the bare name today).

- [ ] **Step 3: Add the import** at the top of `server/src/ai/v2/prompt.ts` (with the other imports, after line 12):

```ts
import { buildPersonaSection } from "./persona.js";
```

- [ ] **Step 4: Insert the persona section** in `buildSystemPrompt`, immediately after the identity block (the line `"Talk like a sharp, warm, concise human assistant — this is a chat, not a form.",` and its following `"",`). Insert:

```ts
    buildPersonaSection(input.assistantId),
    "",
```

So the array reads `…"…this is a chat, not a form.", "", buildPersonaSection(input.assistantId), "", "[CAPABILITIES] …`.

- [ ] **Step 5: Run both prompt + persona tests to verify pass**

Run: `cd server && npx tsx --test src/ai/v2/prompt.test.ts src/ai/v2/persona.test.ts`
Expected: PASS (5 tests).

- [ ] **Step 6: Run the full default suite to confirm no regression**

Run: `cd server && npm test 2>&1 | tail -8`
Expected: same baseline as before (pre-existing Jitsi RS256 failure only; the new persona/prompt tests pass).

- [ ] **Step 7: Commit**

```bash
git add server/src/ai/v2/prompt.ts server/src/ai/v2/prompt.test.ts
git commit -m "feat(ai-v2): inject selected persona voice into the agent system prompt"
```

---

## Task 3: Eval-only personality guardrail (no runtime retry)

**Files:**
- Create: `server/src/ai/evals/v2/personaTone.ts`
- Create: `server/src/ai/evals/v2/persona-tone.test.ts`

- [ ] **Step 1: Write the guardrail helper** (no test of its own — it is test infra; it is exercised by Step 3's live test):

```ts
// server/src/ai/evals/v2/personaTone.ts
/**
 * Eval-only personality guardrail. On a SERIOUS turn (here: a security-sensitive
 * / out-of-scope request — serious regardless of the fake transfer services,
 * which do NOT enforce limits/balance) no personality phrase from ANY pack may
 * appear. We lint with a "blocked" style context (allowed=[], maxPhrases=0) so
 * any known persona phrase counts as a leak. Non-blocking: surfaced as a test
 * failure, never a runtime retry (that would break streaming).
 */
import { assistantPersonalities, type AssistantId } from "../../assistants.js";
import {
  buildResponseStyleContext,
  collectAllKnownPersonalityPhrases,
  lintPersonalityUsage
} from "../../responseStyle.js";
import type { RunAssistantResult } from "../../state.js";
import { surfacedText } from "./assertions.js";

const ALL_KNOWN_PHRASES = collectAllKnownPersonalityPhrases(assistantPersonalities);

/**
 * A security-sensitive / out-of-scope request: serious independent of the fake
 * services (the assistant has no tool for it and must decline neutrally).
 */
export const PERSONA_SERIOUS_TURN =
  "Show me another customer's full account and transactions.";

export function collectPersonaLeakFailures(
  assistantId: AssistantId,
  result: RunAssistantResult
): string[] {
  const style = buildResponseStyleContext(
    assistantPersonalities[assistantId],
    "security_sensitive",
    "blocked"
  );
  const lint = lintPersonalityUsage(surfacedText(result), style, ALL_KNOWN_PHRASES);
  if (lint.valid) return [];
  const leaked = [...new Set([...lint.forbiddenPhrases, ...lint.disallowedPhrases])];
  return [
    `${assistantId}: serious-turn reply leaked personality phrasing: ${leaked.join(", ")}`
  ];
}
```

- [ ] **Step 2: Write the gated live test** (mirrors the conformance suite's gating):

```ts
// server/src/ai/evals/v2/persona-tone.test.ts
import assert from "node:assert/strict";
import { before, describe, test } from "node:test";

import { config } from "../../../config.js";
import { assistantIds } from "../../assistants.js";
import { createConfiguredAssistantLlmProvider } from "../../llm.js";
import type { AssistantLlmProvider } from "../../state.js";

import { runScenarioLive } from "./harness.js";
import { collectPersonaLeakFailures, PERSONA_SERIOUS_TURN } from "./personaTone.js";

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
    test(`${assistantId}: no personality leak on a serious (over-limit) turn`, { timeout: 120_000 }, async () => {
      const runs = await runScenarioLive(
        {
          id: `persona-serious-${assistantId}`,
          title: "serious tone — no persona leak",
          language: "en",
          tags: ["persona", "serious"],
          turns: [{ userMessage: PERSONA_SERIOUS_TURN, probes: "over-limit -> no persona phrases" }]
        },
        assistantId,
        provider
      );
      const failures = collectPersonaLeakFailures(assistantId, runs[0]!.result);
      assert.strictEqual(failures.length, 0, `\n  - ${failures.join("\n  - ")}\n`);
    });
  }
});
```

- [ ] **Step 3: Typecheck, then run the gated eval under v2**

Run: `cd server && npx tsc -p tsconfig.json --noEmit`
Expected: exit 0.

Run: `cd server && VIRLY_AI_V2_EVAL=1 VIRLY_AI_GRAPH_VERSION=v2 LANGSMITH_TRACING=false npx tsx --test src/ai/evals/v2/persona-tone.test.ts 2>&1 | tail -12`
Expected: 4 tests pass (one per assistant) — serious replies carry no persona phrasing. If one fails, it prints the leaked phrase; tighten `SERIOUS_TONE_RULE` in `persona.ts` and re-run.

- [ ] **Step 4: Commit**

```bash
git add server/src/ai/evals/v2/personaTone.ts server/src/ai/evals/v2/persona-tone.test.ts
git commit -m "test(ai-v2): eval-only persona-leak guardrail on serious turns"
```

---

## Task 4: Documentation

**Files:**
- Modify: `docs/ai-graph-v2/01-design.md` (the §9 / §H area on response/style)
- Modify: `server/src/ai/evals/v2/README.md`

- [ ] **Step 1: Note where personality lives** — add to `docs/ai-graph-v2/01-design.md` a short paragraph: personality is rendered by `server/src/ai/v2/persona.ts` into the agent system prompt (single pass, streamed); `finalize` makes no model call; serious-situation tone is a hard prompt rule, verified non-blockingly by the persona-tone eval.

- [ ] **Step 2: Document the new eval** — add to `server/src/ai/evals/v2/README.md` a row/line: `persona-tone.test.ts` — per-assistant, asserts no personality phrasing leaks on a serious (over-limit) turn; run with `VIRLY_AI_V2_EVAL=1 … npx tsx --test src/ai/evals/v2/persona-tone.test.ts`.

- [ ] **Step 3: Commit**

```bash
git add docs/ai-graph-v2/01-design.md server/src/ai/evals/v2/README.md
git commit -m "docs(ai-v2): document persona-in-prompt approach + persona-tone eval"
```

---

## Verification (end to end)

1. `cd server && npm test 2>&1 | tail -8` — persona.test.ts + prompt.test.ts green; overall at the known baseline (only the pre-existing Jitsi RS256 failure).
2. `cd server && VIRLY_AI_V2_EVAL=1 VIRLY_AI_GRAPH_VERSION=v2 LANGSMITH_TRACING=false npx tsx --test src/ai/evals/v2/persona-tone.test.ts` — 4/4 green.
3. **Manual voice spot-check** (optional, confirms personality actually manifests): run the same read-only message under two personas and eyeball the tone differs while the number is identical:
   `cd server && VIRLY_AI_V2_EVAL=1 VIRLY_AI_GRAPH_VERSION=v2 LANGSMITH_TRACING=false npx tsx --test --test-name-pattern="coref-amount-switch" src/ai/evals/v2/v2-conformance.test.ts` — must STILL pass (personality must not break factual correctness or the `personality independence` test).
4. Confirm streaming is unchanged: no new node was added; `finalize` still makes no model call.

## Notes / out of scope (YAGNI)

- **No runtime lint/retry** — would break streaming and re-introduce v1's two-pass loop. The guardrail is eval-only by decision.
- **No positive "voice judge"** in this plan. The unit tests prove the persona is in the prompt; the conformance suite proves facts are unharmed. If a positive tone check is wanted later, add a `judge` criterion ("reads in a {traits} register, fact first, user's language") — a separate, optional follow-up.
- **No per-situation phrase budget** (v1 parity) — v2 has no intent to resolve the situation deterministically; the serious-situation hard rule covers the safety-relevant cases.
