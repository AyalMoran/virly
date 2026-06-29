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
  fake tools. The **only** live dependency is the LLM; no Mongo. Read-only lookups
  go through the injected world fakes, but the v2 fraud path
  (`assessTransactionRisk` + `prepareTransfer`'s risk note) calls `scoreTransfer`,
  which reads the repository singleton *directly* — not via the injected executors.
  So `worldTools.ts` also exports `createV2WorldRepositories()` (a DB-free fake
  `Repositories`: empty debit history ⇒ a stable low-risk score), and `harness.ts`
  registers it with `setRepositories` before a run — but only when nothing is
  registered yet. It reads nothing, so the suite stays Mongo-free; the call is
  nonetheless load-bearing, since without it the fraud tool throws
  "Repositories not initialised".
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
| `worldTools.ts` | DB-free fake read-only tools + `createV2WorldRepositories()` (fake repos for the fraud path) over the world |
| `types.ts` | `V2Scenario` / `V2TurnExpectation` |
| `scenarios.ts` | The multi-turn scenarios |
| `harness.ts` | Seeded store, DB-free amount service, `ensureWorldRepositories()`, scenario driver, entrypoint indirection |
| `assertions.ts` | Personality-agnostic structural assertions |
| `judge.ts` | LLM-as-judge (faithfulness + language) |
| `v2-conformance.test.ts` | Gated Node test runner |
| `persona-tone.test.ts` | Per-assistant eval: asserts no personality phrasing leaks on a serious (over-limit) turn. Gated; run with `VIRLY_AI_V2_EVAL=1 LANGSMITH_TRACING=false npx tsx --test src/ai/evals/v2/persona-tone.test.ts` |
