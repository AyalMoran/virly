# Persona Prompt Tuning Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Stop personas from forcing signature phrases where they don't fit — the
reported symptom is Oshri opening with "מה שנקרא" out of nowhere — by (a) fixing the
phrase-pack data that seeds the bad habit, and (b) softening the vocabulary directive
so phrases are used only where they read naturally, across all four personas.

**Architecture:** Two roots. (1) Data: Oshri's `transaction_history_success` pack
lists `resultIntros: ["מה שנקרא"]` — a discourse filler ("so to speak") that is
meaningless as a standalone opener, so the model emits it bare. (2) Directive:
`vocabularyRule` in `v2/persona.ts` tells the model to use signature phrases "verbatim
and often, do not let them sit unused" — which pressures the model to inject phrases
even when they don't fit. The fix reclassifies/repairs the offending phrase and
rewrites the directive to "use where it fits naturally; never force a phrase that
doesn't fit the sentence", keeping the personas distinct without the forced-filler
failure mode.

**Tech Stack:** `server/src/ai/assistants.ts` (phrase packs), `server/src/ai/v2/persona.ts`
(vocabulary rule), `node:test` + `tsx`; optional skip-gated persona-tone eval.

## Global Constraints

- ESM: relative imports end in `.js`. Server unit tests: `cd server && npm test`.
- The SERIOUS_TONE_RULE and the money/number invariants are untouched — this only
  changes how *flavor* phrases are offered on safe turns.
- Personas must STAY distinguishable: the goal is "natural, in-character", not "neutral
  corporate". Do not gut the vocabulary — repair it.
- Deterministic tests assert the data + directive wording. Behavioral proof (the model
  actually stops forcing the phrase) is a skip-gated live eval.
- TDD throughout.

## Approach & rationale

Considered:

1. **Repair data + soften directive (chosen).** Minimal, targeted, fixes the actual
   cause for Oshri and removes the systemic "force a phrase" pressure for everyone.
2. **Delete the vocabulary block entirely.** Kills the bug but also kills persona
   distinctiveness — the whole point of the recent persona work (ADR 0007). Rejected.
3. **Add a post-hoc lint that strips misplaced fillers.** v1 already lints
   (`responseStyle.ts`); v2 deliberately does tone in one prompt pass with no second
   compose node. Adding a stripper reintroduces the rewrite node the design removed.
   Rejected; fix the prompt instead.

"מה שנקרא" specifically: it's a filler that must precede the thing it qualifies (e.g.
"היסטוריית העברות, מה שנקרא הסיפור המלא"). As a bare `resultIntro` it has nothing to
qualify. Repair = give Oshri a real history intro and, if "מה שנקרא" is kept at all,
move it to `flavor` with guidance that it must lead into a noun.

## File Structure

| File | Responsibility |
|---|---|
| `src/ai/v2/persona.ts` (modify) | Rewrite `vocabularyRule` (all locales) to "use where it fits, never force". |
| `src/ai/assistants.ts` (modify) | Repair Oshri's `transaction_history_success` pack; audit the other personas' packs for bare fillers. |
| `src/ai/v2/persona.test.ts` (modify) | Assert the new directive wording; assert no "do not let them sit unused"-style forcing. |
| `src/ai/personaPacks.test.ts` (create) | Data lint: no pack uses a known bare-filler phrase as a standalone `resultIntro`/`opening`. |
| `src/ai/evals/v2/persona-tone.test.ts` or `scenarios.ts` (modify, optional) | Skip-gated live assertion that Oshri doesn't open with bare "מה שנקרא". |

---

## Task 1: Soften the vocabulary directive (all locales)

**Files:**
- Modify: `src/ai/v2/persona.ts`
- Modify: `src/ai/v2/persona.test.ts`

**Interfaces:**
- Modifies: `vocabularyRule(name, exemplars, locale)` output text. No signature change.

- [ ] **Step 1: Write the failing test**

Add to `src/ai/v2/persona.test.ts`:

```ts
import { buildPersonaSection } from "./persona.js";

test("vocabulary directive tells the model NOT to force phrases", () => {
  for (const locale of ["he", "en", "mixed", "unknown"] as const) {
    const section = buildPersonaSection("oshri", locale);
    // The fix: explicit "fits naturally / never force" guidance...
    assert.match(section, /fit|natural|forc/i);
    // ...and the old forcing language is gone.
    assert.doesNotMatch(section, /do not let them sit unused/i);
    assert.doesNotMatch(section, /use them verbatim and often/i);
  }
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `cd server && npx tsx --test src/ai/v2/persona.test.ts`
Expected: FAIL — current wording still says "use them verbatim and often".

- [ ] **Step 3: Rewrite `vocabularyRule`**

In `src/ai/v2/persona.ts`, replace the three locale branches' phrasing. Hebrew/mixed
branch:

```ts
  if (locale === "he" || locale === "mixed") {
    return [
      `[YOUR VOCABULARY] These signature phrases capture ${name}'s voice: ${list}.`,
      `Reach for them when one fits the sentence naturally and rotate so you never open`,
      `two replies the same way — but NEVER force a phrase where it doesn't fit. A filler`,
      `like “מה שנקרא” must lead into the thing it qualifies; never drop it in bare or as a`,
      `standalone opener. One well-placed phrase beats three forced ones.`
    ].join("\n");
  }
```

English branch — keep the "zero Hebrew" rule, add the "never force" clause:

```ts
  if (locale === "en") {
    return [
      `[YOUR VOCABULARY] ${name}'s signature phrases are Hebrew and the user is writing`,
      `English, so write ZERO Hebrew — not even a signature phrase. They are a REGISTER`,
      `REFERENCE: reproduce the same attitude in English where it fits naturally, and never`,
      `force a stock phrase that doesn't suit the sentence (e.g. render “הכול בשליטה” as`,
      `“all under control”). Reference only — do not transcribe: ${list}.`
    ].join("\n");
  }
```

Unknown branch — same "where it fits / never force" softening:

```ts
  return [
    `[YOUR VOCABULARY] Match the user's language. Use ${name}'s signature phrases where`,
    `they fit naturally (verbatim in Hebrew; reproduced in their language otherwise — never`,
    `inject Hebrew into a non-Hebrew reply), and never force a phrase that doesn't fit.`,
    `Phrases: ${list}.`
  ].join("\n");
```

- [ ] **Step 4: Run test to verify it passes**

Run: `cd server && npx tsx --test src/ai/v2/persona.test.ts`
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add server/src/ai/v2/persona.ts server/src/ai/v2/persona.test.ts
git commit -m "fix(ai): persona vocabulary directive — use phrases where they fit, never force"
```

---

## Task 2: Repair Oshri's phrase pack + lint all packs for bare fillers

**Files:**
- Modify: `src/ai/assistants.ts`
- Create: `src/ai/personaPacks.test.ts`

**Interfaces:**
- Modifies: `assistantPersonalities.oshri.phrasePacks.transaction_history_success`.
- Produces (test): a data lint over all `assistantPersonalities`.

- [ ] **Step 1: Write the failing test**

```ts
// src/ai/personaPacks.test.ts
import assert from "node:assert/strict";
import test from "node:test";
import { assistantPersonalities } from "./assistants.js";

// Phrases that are discourse fillers: meaningless as a standalone opener/result-intro
// because they must lead into a noun/clause. They may live in `flavor` (with guidance)
// but not in `openings`/`resultIntros`.
const BARE_FILLERS = ["מה שנקרא"];

test("no persona uses a bare filler as a standalone opening or result intro", () => {
  for (const persona of Object.values(assistantPersonalities)) {
    for (const [situation, pack] of Object.entries(persona.phrasePacks)) {
      const standalone = [...(pack.openings ?? []), ...(pack.resultIntros ?? [])];
      for (const filler of BARE_FILLERS) {
        assert.ok(
          !standalone.includes(filler),
          `${persona.id}.${situation} uses bare filler "${filler}" as a standalone phrase`
        );
      }
    }
  }
});

test("oshri still has a transaction-history intro (persona stays distinct)", () => {
  const pack = assistantPersonalities.oshri.phrasePacks.transaction_history_success;
  assert.ok(pack);
  assert.ok((pack.openings?.length ?? 0) + (pack.resultIntros?.length ?? 0) > 0);
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `cd server && npx tsx --test src/ai/personaPacks.test.ts`
Expected: FAIL — Oshri's `transaction_history_success.resultIntros` contains "מה שנקרא".

- [ ] **Step 3: Repair the pack**

In `src/ai/assistants.ts`, update Oshri's `transaction_history_success` pack. Replace
the bare filler result-intro with a real one, and (optionally) move "מה שנקרא" to
`flavor` with guidance that it must lead into a noun:

```ts
      transaction_history_success: guardedPack({
        maxPhrases: 1,
        openings: ["בדיקה זריזה", "בדקתי לך"],
        resultIntros: ["הנה התנועות", "זה מה שרץ בחשבון"],
        flavor: ["מה שנקרא, הסיפור המלא"],
        guidance:
          "Read-only transaction context. The UI renders transaction facts, so the prose should be a short intro only. If you use “מה שנקרא”, it must lead into a noun (e.g. “מה שנקרא, הסיפור המלא”) — never bare or as a standalone opener."
      }),
```

Then audit the other three personas' packs for any other bare filler and fix similarly
(the lint in Step 1 enumerates them; extend `BARE_FILLERS` if you find more during the
audit).

- [ ] **Step 4: Run test to verify it passes**

Run: `cd server && npx tsx --test src/ai/personaPacks.test.ts`
Expected: PASS.

- [ ] **Step 5: Run the persona + response-style suites for regressions**

Run: `cd server && npx tsx --test src/ai/v2/persona.test.ts src/ai/responseStyle.test.ts`
Expected: PASS.

- [ ] **Step 6: Commit**

```bash
git add server/src/ai/assistants.ts server/src/ai/personaPacks.test.ts
git commit -m "fix(ai): repair Oshri history phrase pack; lint packs for bare fillers"
```

---

## Task 3 (optional): Live persona-tone assertion

**Files:**
- Modify: `src/ai/evals/v2/persona-tone.test.ts` (or `scenarios.ts`)

- [ ] **Step 1: Add a skip-gated assertion**

In the Oshri transaction-history scenario, assert the reply does NOT contain "מה שנקרא"
as a sentence-initial standalone (regex e.g. `/^\s*מה שנקרא[\s,.]*$/m` should not match,
and it should not start a reply). Runs only under the live eval gate.

- [ ] **Step 2: Run the gated eval (manual)**

Run: `cd server && VIRLY_AI_V2_EVAL=1 OPENAI_API_KEY=… VIRLY_AI_MODEL=… npx tsx --test src/ai/evals/v2/persona-tone.test.ts`
Expected: PASS (manual; costs tokens).

- [ ] **Step 3: Commit**

```bash
git add server/src/ai/evals/v2/persona-tone.test.ts
git commit -m "test(ai): live assertion that Oshri doesn't open with bare 'מה שנקרא'"
```

---

## Self-Review

- **Spec coverage:** directive softened for all personas (T1), the specific Oshri bug
  fixed + a data lint to prevent regressions (T2), and an optional behavioral check
  (T3). Covers "improve prompt for the different personalities; oshri always says מה
  שנקרא out of nowhere."
- **Placeholder scan:** none.
- **Type consistency:** uses the existing `PhrasePack`/`assistantPersonalities` shapes
  unchanged; no new types.

## Open questions (answer later)

1. **Replacement phrasings** — are "הנה התנועות" / "זה מה שרץ בחשבון" the right Oshri
   intros, or do you have preferred copy? (Easy to swap.)
2. **Other personas** — any specific overuse complaints for Chaya/Yehuda/Yohai to fix
   in the same pass, or is Oshri the only reported one?
3. **Keep "מה שנקרא" at all?** This plan keeps it as guided `flavor`; if you'd rather
   drop it entirely, remove the `flavor` entry too.
