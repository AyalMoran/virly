# Dad Jokes Per Intent Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Give dad-joke personas (Oshri today) a per-intent bank of dad jokes that the
assistant can land — at most one, only on safe successful turns whose situation matches
the joke — so the humor feels intentional and on-topic instead of random.

**Architecture:** A `dadJokes.ts` module holds `DAD_JOKES: Partial<Record<ResponseSituation,
string[]>>` (the per-intent storage), a `personaUsesDadJokes(assistantId)` predicate
(true when a persona's traits include "dad-joke humor"), and
`buildDadJokeSection(assistantId, locale)` which renders a bounded `[DAD JOKES]` prompt
block listing one situation-labeled candidate per SAFE situation. The block is injected
into the v2 persona section. The SERIOUS_TONE_RULE already strips humor on serious
turns, so jokes never appear over a number, warning, missing detail, or failure.

**Tech Stack:** `server/src/ai/dadJokes.ts` (new), `server/src/ai/v2/persona.ts`
(injection), `node:test` + `tsx`. Keys reuse `ResponseSituation` from `responseStyle.ts`.

## Global Constraints

- ESM: relative imports end in `.js`. Server unit tests: `cd server && npm test`.
- Jokes are flavor ONLY. They never obscure, delay, or alter a number, confirmation, or
  warning, and only appear on the safe `EXEMPLAR_SITUATIONS` (same safe set
  `persona.ts` already uses for vocabulary).
- Only personas with the "dad-joke humor" trait get the section (Oshri now; data-driven
  so adding the trait to another persona opts it in).
- Bounded prompt cost: at most ONE candidate per safe situation in the injected block.
- Locale-aware: Hebrew jokes are offered verbatim on Hebrew turns; on English turns the
  block does NOT inject Hebrew — it asks for an equivalent light English dad-joke.
- TDD throughout.

## Approach & rationale

The v2 system prompt is built without a resolved `ResponseSituation` (the agent decides
the turn's shape itself), so we can't inject the single joke for "this turn". Options:

1. **Inject one labeled candidate per safe situation; let the model pick the matching
   one (chosen).** Genuinely per-intent, bounded (~7 lines), fits how vocabulary is
   already offered, and the model already knows the turn's situation as it writes.
2. **Inject the whole bank.** Per-intent but unbounded prompt growth. Rejected.
3. **v1-only, at compose time where the situation is known.** Clean for v1 but v1 isn't
   the production path; v2 is. Offered as an optional follow-up task, not the core.

## File Structure

| File | Responsibility |
|---|---|
| `src/ai/dadJokes.ts` (create) | `DAD_JOKES` storage, `personaUsesDadJokes`, `buildDadJokeSection`. |
| `src/ai/dadJokes.test.ts` (create) | Storage shape + predicate + section rendering/safety. |
| `src/ai/v2/persona.ts` (modify) | Inject `buildDadJokeSection` into `buildPersonaSection`. |
| `src/ai/v2/persona.test.ts` (modify) | Oshri persona section includes `[DAD JOKES]`; Yohai does not. |

---

## Task 1: Dad-joke storage + helpers

**Files:**
- Create: `src/ai/dadJokes.ts`
- Test: `src/ai/dadJokes.test.ts`

**Interfaces:**
- Consumes: `ResponseSituation` (`./responseStyle.js`), `AssistantId` + `getAssistantPersonality` (`./assistants.js`).
- Produces:
  - `const DAD_JOKES: Partial<Record<ResponseSituation, string[]>>`
  - `function personaUsesDadJokes(assistantId: AssistantId): boolean`
  - `function buildDadJokeSection(assistantId: AssistantId, locale: "he" | "en" | "mixed" | "unknown"): string`

- [ ] **Step 1: Write the failing test**

```ts
// src/ai/dadJokes.test.ts
import assert from "node:assert/strict";
import test from "node:test";
import { DAD_JOKES, personaUsesDadJokes, buildDadJokeSection } from "./dadJokes.js";

const SAFE = [
  "balance_inquiry_success",
  "account_summary_success",
  "transaction_history_success",
  "transaction_stats_success",
  "general_help"
] as const;

test("storage is keyed by safe situations only (no serious/blocked keys)", () => {
  for (const key of Object.keys(DAD_JOKES)) {
    assert.doesNotMatch(
      key,
      /insufficient_funds|transfer_failed|security_sensitive|missing_required/,
      `dad jokes must not be keyed to serious situation ${key}`
    );
  }
});

test("oshri uses dad jokes; yohai does not", () => {
  assert.equal(personaUsesDadJokes("oshri"), true);
  assert.equal(personaUsesDadJokes("yohai"), false);
});

test("section for oshri is labelled and bounded to one candidate per situation", () => {
  const section = buildDadJokeSection("oshri", "he");
  assert.match(section, /\[DAD JOKES\]/);
  // one bullet per safe situation that has jokes, no more
  const bullets = section.split("\n").filter((l) => l.trim().startsWith("-"));
  assert.ok(bullets.length >= 1);
  assert.ok(bullets.length <= SAFE.length);
});

test("english section does not inject Hebrew jokes verbatim", () => {
  const section = buildDadJokeSection("oshri", "en");
  assert.match(section, /\[DAD JOKES\]/);
  assert.doesNotMatch(section, /[֐-׿]/); // no Hebrew chars on an English turn
});

test("non-dad-joke persona gets an empty section", () => {
  assert.equal(buildDadJokeSection("yohai", "he"), "");
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `cd server && npx tsx --test src/ai/dadJokes.test.ts`
Expected: FAIL — module not found.

- [ ] **Step 3: Implement storage + helpers**

```ts
// src/ai/dadJokes.ts
import { getAssistantPersonality, type AssistantId } from "./assistants.js";
import type { ResponseSituation } from "./responseStyle.js";

type Locale = "he" | "en" | "mixed" | "unknown";

/**
 * Per-intent dad-joke storage. Keyed ONLY by safe, successful situations — humor is
 * never offered for serious/blocked situations (the SERIOUS_TONE_RULE strips it anyway).
 * Hebrew source text; on non-Hebrew turns the section asks for an equivalent instead of
 * injecting these verbatim.
 */
export const DAD_JOKES: Partial<Record<ResponseSituation, string[]>> = {
  balance_inquiry_success: [
    "היתרה יציבה — בניגוד אליי בבוקר לפני קפה."
  ],
  account_summary_success: [
    "החשבון מסודר יותר מהמגירה של הגרביים שלי."
  ],
  transaction_history_success: [
    "ההיסטוריה לא משקרת — היא רק לפעמים מביכה."
  ],
  transaction_stats_success: [
    "המספרים מדברים, ואני רק מתרגם בלי מבטא."
  ],
  general_help: [
    "אני פה כל היום — אין לי לאן למהר, אני בנק."
  ]
};

/** A persona opts in by carrying the "dad-joke humor" trait (data-driven). */
export function personaUsesDadJokes(assistantId: AssistantId): boolean {
  return getAssistantPersonality(assistantId).traits.includes("dad-joke humor");
}

export function buildDadJokeSection(assistantId: AssistantId, locale: Locale): string {
  if (!personaUsesDadJokes(assistantId)) {
    return "";
  }

  const header = [
    "[DAD JOKES] You may land AT MOST ONE light dad-joke, and ONLY on a safe, successful",
    "turn whose situation matches — never over a number, a warning, a missing detail, a",
    "failure, or any serious turn. The joke comes AFTER the financial fact, never instead",
    "of it. If nothing fits, skip it."
  ];

  if (locale === "en") {
    return [
      ...header,
      "The user is writing English: do NOT use the Hebrew jokes below. Make an equivalent,",
      "short English dad-joke in the same spirit if (and only if) one fits the turn."
    ].join("\n");
  }

  // Hebrew / mixed / unknown: offer one candidate per safe situation.
  const bullets: string[] = [];
  for (const [situation, jokes] of Object.entries(DAD_JOKES)) {
    if (jokes && jokes.length > 0) {
      bullets.push(`- (${situation}) ${jokes[0]}`);
    }
  }
  return [
    ...header,
    "Pick the one matching this turn's situation, or none:",
    ...bullets
  ].join("\n");
}
```

> Replace/extend the seed jokes with the real bank you want. The tests assert structure
> and safety, not specific joke text, so adding jokes won't break them.

- [ ] **Step 4: Run test to verify it passes**

Run: `cd server && npx tsx --test src/ai/dadJokes.test.ts`
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add server/src/ai/dadJokes.ts server/src/ai/dadJokes.test.ts
git commit -m "feat(ai): per-intent dad-joke storage + safe injection helper"
```

---

## Task 2: Inject the dad-joke section into the persona prompt

**Files:**
- Modify: `src/ai/v2/persona.ts`
- Modify: `src/ai/v2/persona.test.ts`

**Interfaces:**
- Consumes: `buildDadJokeSection(assistantId, locale)` (Task 1).
- Produces: `buildPersonaSection` output now includes `[DAD JOKES]` for dad-joke personas.

- [ ] **Step 1: Write the failing test**

Add to `src/ai/v2/persona.test.ts`:

```ts
test("oshri persona section includes the dad-joke block; yohai does not", () => {
  assert.match(buildPersonaSection("oshri", "he"), /\[DAD JOKES\]/);
  assert.doesNotMatch(buildPersonaSection("yohai", "he"), /\[DAD JOKES\]/);
});

test("dad-joke block sits after the SERIOUS_TONE_RULE (serious rule still wins)", () => {
  const section = buildPersonaSection("oshri", "he");
  assert.ok(section.indexOf("[TONE — SERIOUS SITUATIONS]") < section.indexOf("[DAD JOKES]"));
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `cd server && npx tsx --test src/ai/v2/persona.test.ts`
Expected: FAIL — `[DAD JOKES]` not present.

- [ ] **Step 3: Wire it in**

In `src/ai/v2/persona.ts`, import the builder and append the section (after
`SERIOUS_TONE_RULE`, so the serious rule is read first and clearly governs):

```ts
import { buildDadJokeSection } from "../dadJokes.js";
```

```ts
export function buildPersonaSection(
  assistantId: AssistantId,
  locale: PersonaLocale = "unknown"
): string {
  const persona = getAssistantPersonality(assistantId);
  const exemplars = collectVocabularyExemplars(assistantId);
  return [
    `[PERSONA] You are ${persona.name} — ${persona.role}.`,
    `Voice: ${persona.traits.join(", ")}.`,
    persona.globalGuidance,
    inCharacterRule(persona.name),
    vocabularyRule(persona.name, exemplars, locale),
    SERIOUS_TONE_RULE,
    buildDadJokeSection(assistantId, locale)
  ]
    .filter(Boolean)
    .join("\n");
}
```

(`buildDadJokeSection` returns `""` for non-dad-joke personas, and `.filter(Boolean)`
drops it — so Yohai's section is unchanged.)

- [ ] **Step 4: Run test to verify it passes**

Run: `cd server && npx tsx --test src/ai/v2/persona.test.ts`
Expected: PASS.

- [ ] **Step 5: Run the prompt suite for regressions**

Run: `cd server && npx tsx --test src/ai/v2/prompt.test.ts src/ai/v2/persona.test.ts`
Expected: PASS.

- [ ] **Step 6: Commit**

```bash
git add server/src/ai/v2/persona.ts server/src/ai/v2/persona.test.ts
git commit -m "feat(ai): inject per-intent dad jokes into dad-joke personas' prompt"
```

---

## Self-Review

- **Spec coverage:** per-intent storage (T1, `DAD_JOKES` keyed by situation), trait-gated
  injection on safe turns only (T1–T2). Covers "add dad jokes storage per intent."
- **Placeholder scan:** none — seed jokes are real text; the note about swapping them is
  intentional, not a placeholder.
- **Type consistency:** `ResponseSituation` keys, `AssistantId`, and the
  `buildDadJokeSection(assistantId, locale)` signature are consistent across `dadJokes.ts`,
  its test, and `persona.ts`.

## Open questions (answer later)

1. **Joke content** — supply the real Hebrew dad-joke bank per intent? The seed set is a
   placeholder for structure; you'll likely want your own.
2. **Which personas** — Oshri only (current trait), or add "dad-joke humor" to others?
3. **English behavior** — ask the model to improvise an English dad-joke (this plan), or
   keep dad jokes Hebrew-only and omit them entirely on English turns?
4. **Frequency** — at most one per turn (this plan); should there be a cooldown (e.g. not
   two turns in a row)? That would need turn-count state in the prompt input.
