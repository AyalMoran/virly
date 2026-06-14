# Graph v2 — Implementation Plan

Phased, reviewable build of the architecture in [01-design.md](01-design.md).
Each phase is independently shippable behind a flag, leaves the suite green, and
ends in a single commit. The external HTTP contract is preserved throughout, so
the client never breaks during the migration.

**Stack additions:** `@langchain/langgraph-checkpoint-mongodb` (thread
checkpointer), a thin Mongo-backed `BaseStore` adapter (long-term memory). No
client changes are required until cutover.

**Feature flag:** `config.ai.graphVersion: "v1" | "v2"` (env
`VIRLY_AI_GRAPH_VERSION`, default `v1`). `runAssistant()` dispatches on it, so v1
and v2 coexist for shadow evaluation and a per-assistant cutover.

---

## Phase map

| Phase | Theme | Outcome | Depends on |
| --- | --- | --- | --- |
| 0 | Scaffolding & flag | `v2/` module, flag, config, dispatcher; v1 untouched | — |
| 1 | Checkpointer & Store | Durable thread + long-term memory adapters, tested | 0 |
| 2 | Tool layer | All capabilities as `tool()` with Zod + descriptions; `ToolNode` | 0 |
| 3 | Agent + system prompt | The brain: model bound to tools, prompt assembly | 1, 2 |
| 4 | Core loop (read-only) | `prepare → agent ⇄ tools → finalize → persist`; read-only E2E | 3 |
| 5 | Transfers (HITL) | `prepareTransfer`/modify/cancel + `interrupt`/`Command` resume; limit enforcement | 4 |
| 6 | Memory in the loop | Rolling summary + `trimMessages` + Store read/write wired | 4 |
| 7 | Streaming | token + custom status + block updates over SSE | 4 |
| 8 | Structured UI blocks | Tools emit `uiBlocks`; finalize assembles; intro-only text | 4 |
| 9 | Observability | LangSmith spans + `AiAuditLog` + cost capture | 4 |
| 10 | Evals | multi-turn LLM-judge scenarios + tool-call assertions | 5–8 |
| 11 | Rollout & teardown | shadow → per-assistant cutover → delete v1 machinery | all |

---

## Phase 0 — Scaffolding & flag

**Add**
- `server/src/ai/v2/` (new module root; v1 stays in `server/src/ai/`).
- `server/src/ai/v2/graph.ts` (empty compiled graph stub returning a fallback).
- `config.ai.graphVersion` + `VIRLY_AI_GRAPH_VERSION` parsing in `config.ts`.

**Change**
- A single dispatch point (new `runAssistant()` wrapper, or a branch in
  `ai.routes.ts`) selecting v1 vs v2 by flag. Default `v1`.

**Acceptance**
- Flag `v2` routes to the stub and returns a graceful "v2 not ready" message;
  flag `v1` is byte-identical to today. Full server suite green.

---

## Phase 1 — Checkpointer & long-term Store

**Add**
- Dependency `@langchain/langgraph-checkpoint-mongodb`; construct a
  `MongoDBSaver` from the existing Mongoose connection, keyed by
  `thread_id = conversationId`.
- `server/src/ai/v2/memory/store.ts` — a `BaseStore` adapter over a new
  `AiMemory` Mongo collection: `namespace = [userId]`, keys for
  `counterparty:<emailHash>`, `preference:<name>`, `fact:<id>`. In-memory
  `InMemoryStore` for dev/eval.
- `server/src/ai/v2/memory/types.ts` — `LongTermMemorySnapshot`,
  `CounterpartyRecord`, `UserPreferences`.

**Acceptance**
- Unit tests: checkpointer round-trips a thread (write turn 1, resume turn 2 sees
  turn 1); store upsert/read/list by namespace; vector recall optional and gated.
- No graph wiring yet.

---

## Phase 2 — Tool layer

**Add** `server/src/ai/v2/tools/` — one file per tool, each a `tool()` with a
Zod schema and the description from [03-prompts-and-tools.md](03-prompts-and-tools.md).
Reuse the existing query logic from `server/src/ai/tools/*` (the Mongo
aggregations are good); only the wrapper changes.
- Read-only: `getAccounts`, `getBalance`, `searchTransactions` (mode:
  list/stats/count), `getTransactionReceipt`, `findCounterparty`,
  `getCounterpartySummary`, `getCounterpartyTransactions`, `getTotals`,
  `getRecentSent`, `getRecentReceived`, `getLastSent`, `getVerifiedRecipients`,
  `getTransferLimits`, `checkTransferEligibility`, `getTransferQuote`,
  `getDailyTransferUsage`, `getPendingTransfers`.
- `server/src/ai/v2/tools/index.ts` exporting the read-only `ToolNode` toolset.
- `server/src/ai/v2/toolContext.ts` — `toolCtx(config)` pulling
  `userId/conversationId/now/timezone` from `config.configurable`.

**Acceptance**
- Each tool unit-tested against fake/seeded data: returns a `Command` with a
  model-facing `ToolMessage` and (where relevant) a `uiBlocks` entry; identity is
  read from config, never from args; errors return an error `ToolMessage` (no
  throw). No model involved.

---

## Phase 3 — Agent node & system prompt

**Add**
- `server/src/ai/v2/prompt.ts` — `buildSystemPrompt({ assistantId, locale,
  memoryContext, runningSummary, now, timezone })` assembling: policy-lite +
  capabilities + personality section (reuse `responseStyle`/`assistants`) +
  memory context + date. (Skeleton in 03.)
- `server/src/ai/v2/agent.ts` — `buildAgentNode(model, tools)`: binds tools with
  `parallel_tool_calls: true`, invokes with `[SystemMessage, ...messages]`,
  returns `{ messages: [aiMessage] }`. Streams tokens.
- `server/src/ai/v2/model.ts` — `ChatOpenAI` factory (model id, reasoning effort,
  caching) from config.

**Acceptance**
- Node test (recorded/replayed model or live-gated): given a thread, the agent
  emits sensible `tool_calls` for "what's my balance" and a direct answer for
  "what can you do". Language mirrors the user.

---

## Phase 4 — Core loop, read-only end to end

**Add**
- `server/src/ai/v2/nodes/prepare.ts`, `finalize.ts`, `persist.ts`.
- Assemble `server/src/ai/v2/graph.ts`: `AgentState`, nodes, `routeAgent`
  conditional edge (`tools | transferGate | finalize`; transferGate stubbed to
  no-op this phase), compile with the checkpointer.

**Change**
- Dispatcher: under flag `v2`, read-only chat flows through the real loop.

**Acceptance**
- E2E (seeded Mongo, gated live model): a 3-turn read-only conversation with
  coreference ("how much did I send Maya?" → "and Dan?" → "show me those
  transactions") works with no frame/regex code in the path. v1 untouched.

---

## Phase 5 — Transfers via interrupt / resume

**Add**
- `server/src/ai/v2/tools/prepareTransfer.ts`, `modifyPendingTransfer.ts`,
  `cancelPendingTransfer.ts` — these **propose**; they call the existing
  `prepareAiPendingTransfer` / `modifyAiPendingTransfer` services to validate and
  build the card.
- `server/src/ai/v2/nodes/transferGate.ts` — builds/looks-up the card, calls
  `interrupt({ type, card })`; on resume routes confirm/deny.
- `server/src/ai/v2/nodes/executeTransfer.ts` — calls
  `respondToAiPendingTransfer({ action: "confirm" })`.

**Change**
- `ai.routes.ts` `POST /confirmations/:id`: under flag `v2`, resume the graph via
  `graph.invoke(new Command({ resume: { action, version, idempotencyKey } }),
  { configurable: { thread_id: conversationId } })` instead of calling the
  service directly. (v1 path unchanged.) Response shape preserved.
- **Enforce transfer limits** in the single money path (closes the v1 known
  mismatch): `prepareTransfer`/`modifyPendingTransfer` reject/clarify when over
  per-transfer or daily limits.

**Acceptance**
- E2E: "send Maya 70" → card; resume confirm → exactly one transfer executes in a
  txn; resume deny → no movement, model acknowledges; "actually make it 100"
  supersedes the card; double-confirm rejected by version/idempotency; over-limit
  proposal is blocked with a clear message.

---

## Phase 6 — Memory in the loop

**Change**
- `prepare`: read the `Store` into `memoryContext`; load `runningSummary`.
- `persist`: upsert counterparties/preferences learned this turn; if over
  budget, run the summarizer and trim the prompt window.
- `agent`: prompt built from `runningSummary` + `trimMessages(window)` instead of
  the raw full thread.

**Acceptance**
- A brand-new conversation resolves "pay Maya 50" using long-term memory of Maya.
- A 30-turn synthetic thread stays under the per-turn token budget; the summary
  preserves who/what so coreference still works after trimming.

---

## Phase 7 — Streaming

**Change**
- v2 chat/stream uses `graph.stream(input, { streamMode: ["messages","custom",
  "updates"], configurable })`; map to SSE `token` / `status` / `block`; keep
  `accepted`/`completed`/`result`.
- Tools emit `config.writer({ kind: "status", label })` at meaningful points.

**Acceptance**
- SSE test: token deltas arrive incrementally; tool status lines are
  semantically correct; a balance card `block` arrives before the closing text;
  `result` matches the non-streaming response.

---

## Phase 8 — Structured UI blocks

**Change**
- Tools return `uiBlocks` (reuse `responseBlocks` schema/version); `finalize`
  assembles them into `responseBlocks`; the agent prompt instructs intro-only
  prose (no Markdown tables/numbers).

**Acceptance**
- Read-only answers render via blocks; assistant text is a short localized intro;
  `responseFormatVersion`/`responseBlocks` match the client contract.

---

## Phase 9 — Observability

**Change**
- Enable LangSmith env wiring (project per environment).
- `persist`/dispatcher writes `AiAuditLog` (tools requested vs executed,
  refusal, outcome, token/cost from the run); intent field derived from
  tools/answer for continuity with the existing audit UI.

**Acceptance**
- A run produces a LangSmith trace with per-node/tool/model spans and token
  counts; an `AiAuditLog` row is written with the same key fields as v1.

---

## Phase 10 — Evals

**Add** `server/src/ai/v2/evals/`:
- Re-target the existing fixtures (`conversations.transfer-context`,
  `counterparty-history`, `hebrew-mixed`, `pending-confirmations`) as **multi-turn
  scenarios**.
- Two grader types per scenario step: **tool-call assertions** (did it call the
  expected tool with the expected key args? deterministic, cheap) and
  **LLM-as-judge** (is the final answer faithful, fluent, in the right language,
  and free of invented numbers?).
- Golden transfer scenarios assert: card built with the right recipient/amount,
  exactly one execution on confirm, none on deny, supersede on modify.

**Modes** (mirror v1's gating): `deterministic`-ish tool-call asserts run
offline; LLM-judge + seeded-Mongo run gated by env (`VIRLY_AI_EVAL_ENABLE_*`).

**Acceptance**
- Tool-call assertion pass rate at/above the bar on the fixture set; LLM-judge
  faithfulness above threshold; transfer goldens 100%.

---

## Phase 11 — Rollout & teardown

1. **Shadow:** run v2 alongside v1 on eval fixtures (and optionally mirror real
   traffic to v2 without serving its output); compare tool choice, faithfulness,
   latency, cost.
2. **Canary:** flip one assistant (e.g. `oshri`) to `v2` via the flag; watch
   audit logs + traces.
3. **Cutover:** default `VIRLY_AI_GRAPH_VERSION=v2`; keep v1 importable for one
   release as rollback.
4. **Teardown (separate PR, after a stable release):** delete `router.ts`
   classifier+map, `messageNormalization`, `dateResolution`, `amountResolution`,
   `amountExpr`, the `TransferIntentFrame`/`TurnDelta` code, response post-checks,
   masked-label hydration, the personality-linter rejection loop, and the six v1
   subgraphs. Update `docs/ai-current-implementation.md` to describe v2 as the
   implementation.

**Acceptance**
- Post-cutover: chat/stream/confirmations behave per contract on v2; client and
  OpenAPI unchanged; rollback is a single env flip until teardown.

---

## Cross-cutting acceptance (every phase)

- `npm run build --workspace server` clean; server test suite green (respect the
  known pre-existing Jitsi RS256 baseline failure).
- v1 behavior unchanged while the flag defaults to `v1`.
- One conventional commit per phase; no secrets committed.

## Sequencing note

Phases 1–2 are independent and can be built in parallel. 3 needs both. 4 unlocks
5/6/7/8/9 (also parallelizable). 10 needs the behavior phases. 11 is last.
The critical path to a usable read-only v2 is **0 → 1 → 2 → 3 → 4**; transfers
follow in **5**.
