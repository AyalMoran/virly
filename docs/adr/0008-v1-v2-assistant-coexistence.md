# ADR-0008: v1 / v2 assistant coexistence via env flag

**Status:** Accepted
**Date:** 2026-06-22
**Source:** [`docs/ai/architecture.md`](../ai/architecture.md) — §1 "v1 vs v2 selection rule". Code: `server/src/ai/runAssistant.ts` (dispatch at line 24); `server/src/routes/ai.routes.ts` (HTTP dispatch at line 135); `server/src/config.ts` (lines 173–176, `graphVersion` parsing).

---

## Context

v1 is a deterministic-first state graph (classify intent → run read-only tools
→ compose response) where the LLM is optional at every node. v2 is a
LangGraph-native LLM-first agent with full tool calling, resumable HITL, thread
memory, and streaming. v2 was developed alongside v1, and both needed to run in
production to support phased rollout, regression testing, and rollback. Coupling
the two behind a shared contract with a single boot-time flag was the lightest
path to coexistence without branching the HTTP API.

## Decision

`VIRLY_AI_GRAPH_VERSION` (`"v2"` by default; `"v1"` to select the deterministic
pipeline) controls which implementation handles every AI turn for a given server
process. The flag is parsed in `server/src/config.ts` at startup:
`raw === "v1" ? "v1" : "v2"` — any non-`v1` value selects v2. Both
implementations satisfy the identical `(RunAssistantInput, RunAssistantOptions)
=> RunAssistantResult` contract, so `ai.routes.ts` is agnostic to which one
runs. The `assistantId` field selects persona only — it does not change the
graph version (see ADR-0007).

Note: `server/src/ai/runAssistant.ts` line 6 still carries a stale comment
saying "default `v1`"; `config.ts` lines 173–176 are authoritative and default
to `"v2"`.

## Alternatives considered

| Alternative | Why not chosen |
|---|---|
| Per-request version selection (header or body field) | Adds an attack/abuse surface; version selection should be an operator decision, not a per-user one; complicates the conformance harness. |
| A/B routing at the load balancer level (v1 and v2 as separate deployments) | Doubles operational surface area; the single-flag model is cheaper to maintain and roll back. |
| Delete v1 when v2 ships | Premature; v1 is the conformance baseline and provides a zero-LLM fallback for eval and CI. |

## Status

Accepted — both graphs are live. The dispatch is in `runAssistant.ts:24` (used
by the conformance harness) and `ai.routes.ts:135` (the production HTTP route,
which additionally routes v2 through the resumable HITL graph `ai/v2/hitl.ts`).

## Consequences

**Positive:** Rollback from v2 to v1 is a single env flip; the conformance
harness can run both implementations against the same test suite; no API
contract change between versions.

**Negative / trade-offs:** Both implementations must be maintained simultaneously
until v1 is explicitly retired via a future ADR. The stale comment in
`runAssistant.ts` is a minor source of confusion.

**Neutral / follow-on work:** When v2 has sufficient production confidence, a
follow-on ADR should mark v1 as deprecated and schedule removal.
