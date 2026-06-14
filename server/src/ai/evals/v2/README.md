# V2 Live Conformance Suite (RED)

A live-LLM, multi-turn conformance suite for the **V2 assistant design**
(`docs/ai-graph-v2/`). It drives long, complex conversations through the real
model and asserts the V2 behavioural contract.

**This is a RED suite by design.** Per TDD, the goal is for tests to *fail* so we
learn exactly where today's assistant falls short of the V2 spec. Each failure
names the turn and the capability it probes.

## How to run

The suite is **opt-in** so it never runs (and never spends tokens) during a normal
`npm test`. It needs a live model.

```bash
# from server/  (server/.env supplies OPENAI_API_KEY + VIRLY_AI_MODEL)
VIRLY_AI_V2_EVAL=1 LANGSMITH_TRACING=false \
  npx tsx --test src/ai/evals/v2/v2-conformance.test.ts

# one scenario
VIRLY_AI_V2_EVAL=1 LANGSMITH_TRACING=false \
  npx tsx --test --test-name-pattern="hebrew-coref-transfer" \
  src/ai/evals/v2/v2-conformance.test.ts
```

- `VIRLY_AI_V2_EVAL=1` — required opt-in. Without it the suite skips.
- `LANGSMITH_TRACING=false` — recommended; otherwise trace uploads can spam
  `429` warnings (non-fatal) and slow the run.
- Requires `OPENAI_API_KEY` + `VIRLY_AI_MODEL` (read from `server/.env`).

Without the flag the suite prints `# set VIRLY_AI_V2_EVAL=1 …` and skips, so CI
stays green and free.

## What it tests

Long multi-turn scenarios (English, Hebrew, and the boundaries between them),
probing the behaviours the V2 design promises:

| Dimension | Example turn |
| --- | --- |
| Coreference / pronouns | "And to Dan?", "send **him** the same…", "תעביר **לו**…" |
| Contextual amounts | "the same amount I sent Rani", "make it **double**" |
| Amount vs recipient separation (F2) | "send **Rani** the same amount **Dan** sent me" → 200 to Rani, not Dan |
| Multiple requests in one turn | "What's my balance, **and** how much can I still send today?" |
| Ordinal references | "tell me more about **the second one**" |
| Missing-slot clarification + resume | "Send 250." → "to Noa" |
| Modify / supersede | "Actually make it 200." |
| No premature execution | chat "yes do it" must not claim money moved |
| Language mirroring | Hebrew in → Hebrew out; English in → English out |

## Design

- **Personality-agnostic.** Assertions only check facts (resolved recipient,
  resolved amount, surfaced numbers), structure (clarification vs confirmation),
  and faithfulness/language. They never check tone, openings, emoji, or phrase
  packs. A dedicated test additionally runs the flagship scenario across **all**
  assistant ids and asserts the factual outcome is identical.
- **DB-free world.** `world.ts` / `worldTools.ts` define a known, multi-counterparty
  world (Rani/Dan/Noa with distinct totals, a fixed ledger, balance, limits) as
  fake tools. The **only** live dependency is the LLM; no Mongo.
- **LLM-as-judge.** `judge.ts` grades faithfulness + language mirroring only — it
  is explicitly told to ignore tone and to never fail a reply just because a
  user-requested transfer amount differs from a historical total.
- **Forward-compatible.** `harness.ts → runAssistantUnderTest()` is the single
  indirection point. Today it calls the current graph; when the V2 graph ships
  behind `VIRLY_AI_GRAPH_VERSION`, only that function changes and the whole suite
  re-targets V2 — the assertions are the spec.

## Files

| File | Role |
| --- | --- |
| `world.ts` | Ground-truth data + pure helpers |
| `worldTools.ts` | DB-free fake read-only tools over the world |
| `types.ts` | `V2Scenario` / `V2TurnExpectation` |
| `scenarios.ts` | The multi-turn scenarios |
| `harness.ts` | Seeded store, DB-free amount service, scenario driver, entrypoint indirection |
| `assertions.ts` | Personality-agnostic structural assertions |
| `judge.ts` | LLM-as-judge (faithfulness + language) |
| `v2-conformance.test.ts` | Gated Node test runner |

## Baseline findings (current graph, gpt-5.4-nano)

First live run against the **current** assistant — all six scenarios fail, each
localising a real gap (these are the bugs V2 must fix):

- **Multiple requests dropped.** "balance **and** daily remaining" answered only
  the daily figure (880), omitting the balance (1,840.50).
- **Hebrew comprehension.** "כמה שלחתי לרני?" returned English *"Which recipient
  should I use for that question?"* instead of the 320 total.
- **Language leak / mirroring.** An English question drew a Hebrew reply
  ("בדיקה זריזה…") — personality phrases overriding the user's language.
- **Recipient/contextual-amount resolution.** "Send Noa 25", "send him the same I
  sent Rani", and the F2 case often produced **no confirmation card**.
- **Clarification resume.** "Send 250." → "to Noa" sometimes loses the amount and
  re-asks instead of preparing the 250→Noa card (resume only covers `amount_scope`
  today). Behaviour is also **non-deterministic** across runs — itself a finding.

Re-run after each V2 milestone; the failing set should shrink toward zero.
