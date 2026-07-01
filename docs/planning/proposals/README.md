# Architecture-deepening briefs (proposals)

> Generated 2026-06-26 by an `/improve-codebase-architecture` pass over the whole
> repo, and moved here from `docs/future-plans/` in the 2026-07-01 docs reorg.
> These are aspirational proposals, not yet scheduled. Each file is a self-contained
> brief describing *one* area of architectural friction, written to be thorough
> enough that an agent can turn it into a concrete implementation plan (in
> `docs/planning/plans/`) without re-deriving the analysis.

## How to read a brief

Each brief follows the same shape and uses a consistent vocabulary
(deliberately, so the language stays comparable across briefs):

- **Module** — anything with an interface and an implementation.
- **Interface** — *everything* a caller must know to use a module (types,
  invariants, error modes, ordering, wiring), not just the type signature.
- **Depth** — leverage behind a small interface. **Deep** = a lot of behaviour
  behind a small interface. **Shallow** = the interface is nearly as complex as
  the implementation.
- **Seam** — where an interface lives; a place behaviour can be swapped without
  editing in place.
- **Locality** — change, bugs, and knowledge concentrated in one place.
- **Leverage** — what callers get from depth.
- **Deletion test** — imagine deleting the module. If complexity *vanishes*, it
  was a pass-through. If complexity *reappears across N callers*, it was earning
  its keep.
- **The interface is the test surface.**

## What this pass deliberately did NOT re-suggest

The repo is mature and self-documents its decisions. These are **already done or
already decided** and were excluded:

- Service-layer extraction out of route handlers — **shipped** (see
  `docs/planning/archive/improvements/`, all six suggestions implemented).
- The repository *interface* seam and dual-driver parity — **ADR-0004** (the DI
  brief below builds *on top of* this, it does not reopen it).
- `double precision` money columns — **ADR-0003** (do not propose decimal/cents).
- HttpOnly-JWT-cookie + CSRF auth — **ADR-0005**.
- The AI HITL money gate — **ADR-0006**.
- Moving LangGraph persistence (checkpointer/store) off Mongo — **already
  designed** in `docs/planning/specs/2026-06-25-postgres-migration-phase2-design.md`.
- Deleting v1 of the assistant — **ADR-0008** forbids it until a future ADR. Brief
  04 *reduces the cost of keeping both*, which supports that ADR rather than
  reopening it.

## The briefs

| # | Brief | Strength | One-line thesis |
|---|-------|----------|-----------------|
| 01 | [Dependency injection for data access](01-dependency-injection-data-access.md) | **Strong** | Replace the global `getRepositories()` singleton (92 call sites) with explicit injection so the interface becomes the test surface. |
| 02 | [Single source of truth for the API contract](02-api-contract-single-source-of-truth.md) | **Strong** | The request/response contract lives in 3+ hand-synced places; generate the client side from one source. |
| 03 | [Decompose the v1 assistant graph](03-decompose-v1-assistant-graph.md) | **Strong** | `ai/graph.ts` is a 4,150-line, ~80-function god-file; split it into the node/subgraph modules the architecture doc already names. |
| 04 | [Unify the assistant tool/domain core](04-unify-assistant-tool-domain-core.md) | **Worth exploring** | v1 and v2 tool layers reimplement domain queries and bypass the service layer; give both a shared query module. |
| 05 | [Structured-response block registry](05-structured-response-block-registry.md) | **Worth exploring** | A block type's builder (server), renderer (client), and type live far apart and must change in lockstep; co-locate them. |
| 06 | [Frontend module cohesion](06-frontend-module-cohesion.md) | **Worth exploring** | The client `lib/` grab-bag and 1,000+ LOC components are low-cohesion; carve cohesive boundaries. |

## Suggested order

01 and 02 are the highest-leverage and lowest-risk; they also make everything
else easier to test and change. 03 unlocks safe work inside the assistant. 04
depends conceptually on 01 (a shared query module is far cleaner with injection).
05 and 06 are independent and can be picked up any time.
