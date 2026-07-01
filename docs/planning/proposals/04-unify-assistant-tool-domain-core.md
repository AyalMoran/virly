# 04 — Unify the assistant tool/domain core

**Strength: Worth exploring.** Higher payoff but larger surface than 01–03. It
**supports** ADR-0008 (makes maintaining both v1 and v2 cheaper) rather than
reopening it. Best done *after* brief 01 (injection).

---

## Thesis

There are two assistant tool layers and they **reimplement the same domain
queries twice**, and both **bypass the service layer**:

- **v1**: 24 file-per-tool executors in `server/src/ai/tools/*.ts`. Each grabs
  `getRepositories()` and assembles its own result, e.g.
  `ai/tools/getAccountBalance.ts` → `getRepositories().users.findById(...)`.
- **v2**: LangChain `tool()` definitions in `server/src/ai/v2/tools/readOnly.ts`
  + `money.ts`. The architecture doc calls the v2 read-only names "a re-cut of
  v1's" (`getBalance`, `getTotals`, `findCounterparty`, …). They do **not** import
  the v1 executors — they reimplement the orchestration against the same data.

Meanwhile the clean layering the rest of the backend follows is
`route → service → repository` (ADR-0004 + the shipped service extraction). The
**AI tools skip the service layer entirely** and reach repositories directly, so
domain logic that *should* be shared (balance math, counterparty aggregation,
transfer preflight, transaction filtering) is written a **third** time, divergent
from the services that power the REST endpoints.

The deepening: a single **assistant query / domain module** — deep, small
interface — that the REST services, the v1 tools, and the v2 tools all consume.
The two tool registries become thin **adapters** (v1 executor shape; v2
`tool()`+Zod shape) over one core. That's the "one adapter = hypothetical seam,
two adapters = real seam" rule met by construction: there are already two callers,
so the seam is real and earns its keep.

## Affected modules

- `server/src/ai/tools/*.ts` — 24 v1 executors (+ the `*Helpers.ts` already
  factored out: `counterpartyHelpers`, `pendingTransferHelpers`,
  `transactionHelpers`, `transferPreflightHelpers` — these are the *embryo* of
  the shared core).
- `server/src/ai/v2/tools/readOnly.ts` (309 LOC) + `money.ts` + `descriptions.ts`.
- `server/src/services/*.ts` — `transactionQuery`, `account`, `fx`,
  `aiPendingTransfer` services already hold much of this domain logic; the core
  should reuse/become the home for it rather than competing with it.
- `server/src/ai/state.ts` — `ToolContext`, `createToolResult` (god node, 66
  edges) — the shared result envelope both registries already use.

## Evidence of the friction

- Two tool sets: 24 v1 executors vs v2 `readOnly.ts`+`money.ts`, names
  overlapping but implementations separate.
- v1 tools call `getRepositories()` directly (sampled `getAccountBalance.ts:8`),
  not the services that the REST routes use → domain logic forked.
- The presence of `transferPreflightHelpers.ts`, `transactionHelpers.ts`, etc.
  shows the team already started extracting shared logic — but only *within* v1.
- Every new capability today is an **N-way change**: v1 executor + v2 tool +
  (often) a response block builder + the client renderer + the contract (briefs
  02/05). A shared core collapses the first two into one.

### Deletion test

Delete the v2 `getBalance` tool body. The balance-computation complexity
reappears — because it's the *same* computation v1's `getAccountBalance` and the
account/transaction services already do. Complexity that reappears in three
places when you delete one copy is the textbook signal for a shared deep module.

## Target shape

```
server/src/ai/query/                 (new shared "assistant domain" core)
  balance.ts        getBalance(ctx) → BalanceResult
  counterparty.ts   summary / totals / timeline / resolveCandidates
  transactions.ts   recent / search / stats / receipt / resolveReference
  transferPreflight.ts  eligibility / quote / limits / dailyUsage
  pending.ts        listPending / resolvePendingReference
   ── each function: small interface, takes ctx { repos|services, userId },
      returns a plain domain result. No LLM, no tool-framework types.

server/src/ai/tools/*          ← v1 adapter: wrap query fns in createToolResult()
server/src/ai/v2/tools/*       ← v2 adapter: wrap the SAME query fns in tool()+Zod
server/src/services/*          ← REST services delegate to the same core where they overlap
```

Key constraints on the core:
- It is **framework-agnostic** (no LangChain `tool`, no Express) so both adapters
  and the REST services can call it.
- It takes its dependencies **injected** (brief 01) — `ctx.repos` or `ctx.services`
  — not the global.
- **Money stays gated.** The core exposes *reads* and *card-preparation* only.
  `executeTransferWithSession` remains reachable solely from the HITL
  `executeTransfer` node (ADR-0006). The core must not add any execute path.

## Benefits (locality + leverage + tests)

- **Locality of domain logic.** "How is net-with-counterparty computed?" has one
  answer used by REST, v1, and v2 — fix once, correct everywhere.
- **Cheaper coexistence (directly serves ADR-0008).** The ADR accepts maintaining
  both v1 and v2; the main cost is duplicated tool logic. This removes that cost,
  so keeping v1 as the conformance baseline / zero-LLM fallback is cheap.
- **The interface is the test surface.** Domain queries get tested once, directly,
  with stub repos — instead of twice through two tool frameworks.
- **Adapters shrink to mapping.** v1/v2 tool files become "name + schema +
  call core + shape result," which is exactly the per-framework concern they
  should own.

## Before / After

```
BEFORE — logic forked 3 ways
  REST services ─► repos          (balance/totals/preflight logic, copy A)
  v1 tools      ─► repos          (copy B)
  v2 tools      ─► repos          (copy C)   every feature = change in 2–3 copies

AFTER — one deep core, thin adapters
  ai/query/* (framework-agnostic domain core, injected deps)
     ▲           ▲              ▲
  REST svc   v1 adapter     v2 adapter
  (delegate) (createToolResult) (tool()+Zod)
  money execution path unchanged (HITL gate, ADR-0006)
```

## Implementation outline (for the planning agent)

1. **Do brief 01 first (or alongside).** Injection makes the core's `ctx`
   dependency explicit; otherwise the core inherits the global grab.
2. **Pick one capability** with clear triple-duplication (balance or
   counterparty totals). Extract a `ai/query/<x>.ts` function; point the v1
   executor, the v2 tool, and the overlapping REST service at it; keep all tests
   green. This proves the seam with two real adapters.
3. **Migrate read capabilities** one at a time (start from the existing
   `*Helpers.ts` — they are already most of the way there).
4. **Migrate card-preparation** (`prepareTransfer` / modify / cancel) into the
   core *as card builders only*; re-verify `aiSafety.test.ts` proves no money
   path was added.
5. **Leave the graphs and personas alone** — this brief changes only where the
   *domain computation* lives, not the v1/v2 topologies (brief 03) or the
   contract (02/05).

## Risks / constraints

- **ADR-0006 (money gate) is sacrosanct.** The core must be read+prepare only;
  add a test asserting the core exposes no execute path. Run the full safety suite
  after every migration step.
- **ADR-0008 unaffected.** This does not delete v1 or change version selection; it
  makes both cheaper. If anything it makes a *future* v1-retirement ADR easier,
  because the unique-to-v1 surface shrinks to the graph wiring.
- Larger blast radius than 01–03; migrate capability-by-capability, never big-bang.
- Watch the existing 3-file type cycle (brief 03) — put the core's types in the
  leaf contracts module, not in `state.ts`.

## Definition of done

- A representative capability (e.g. balance, counterparty totals) has exactly one
  implementation consumed by the v1 tool, the v2 tool, and the REST service.
- AI tools no longer call `getRepositories()` directly for logic that the core
  owns; they go through the core (which is injected per brief 01).
- `aiSafety.test.ts` and the conformance/eval harnesses pass unchanged.

## Out of scope / related

- **01** (injection) — prerequisite for a clean `ctx`.
- **03** (graph decomposition) — complementary; this is about tool/domain logic,
  that is about graph structure.
- **05** (block registry) — the *output* side; this brief is the *input/query*
  side. Together they collapse the N-way change to ~1–2 places.
