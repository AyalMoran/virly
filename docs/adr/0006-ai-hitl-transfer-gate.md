# ADR-0006: AI HITL confirmation gate before money movement

**Status:** Accepted
**Date:** 2026-06-22
**Source:** [`docs/domain/transfers.md`](../domain/transfers.md) — §1b "Assistant-Prepared Flow", §2 "Safety Mechanisms". [`docs/security.md`](../security.md) — §4.5 "HITL money-movement gate". Code: `server/src/services/aiPendingTransfer.service.ts` (`respondToAiPendingTransfer`); `server/src/ai/v2/nodes/transferGate.ts` (`interrupt()`).

---

## Context

An AI assistant that can both propose and execute transfers unilaterally would
be a significant risk surface: a single prompt-injection or model error could
drain a user's balance. The design needed a guarantee that money movement always
requires explicit human intent, not just text in a chat message.

## Decision

The AI assistant can only **prepare** a transfer confirmation card (a pending
record in the database). Money never moves until a subsequent authenticated
`POST /api/ai/confirmations/:id` from the user's browser — with the correct
`version` and, in v2, resuming the checkpointed LangGraph thread — calls
`respondToAiPendingTransfer` and settles the transfer. Chat text ("yes",
"confirm it") is explicitly routed to `pending_confirmation_status`, which tells
the user to press the UI button and executes no tools.

The gate is enforced at multiple layers: (1) the system policy
(`server/src/ai/policy.ts`), (2) graph topology — `executeTransfer` is
reachable only from `transferGate`'s confirmed-resume edge, not from any tool,
(3) the LLM response post-check rejects any assistant message that claims a
transfer was executed. See [`../domain/transfers.md`](../domain/transfers.md)
for the full confirmation schema, versioning, idempotency, and supersede
semantics.

## Alternatives considered

| Alternative | Why not chosen |
|---|---|
| Allow chat-message confirmation ("yes" = execute) | Chat text is unauthenticated in the sense that any prompt injection can produce it; the server cannot distinguish a genuine user "yes" from an LLM-fabricated one. |
| Tool-based transfer execution | Any tool reachable by the model is reachable by a prompt injection; the "no execute-transfer tool" invariant is enforced by test. |

## Status

Accepted — the pending-transfer flow, `transferGate` interrupt, and
`respondToAiPendingTransfer` are live. Safety invariants asserted in
`server/src/ai/tests/aiSafety.test.ts` (e.g. "chat confirmation wording never
executes money movement", "llm response post-check rejects chat-confirmation
money movement claims").

## Consequences

**Positive:** Money movement is structurally impossible without an explicit
authenticated HTTP request from the user. Prompt injection cannot execute a
transfer.

**Negative / trade-offs:** The UX requires a UI button click beyond the chat;
the transfer card + confirmation endpoint add implementation surface area.
Pending transfers expire after 10 minutes, so slow users need to re-initiate.

**Neutral / follow-on work:** Version guard + idempotency key handle the
"double-click confirm" and "superseded card" races. Write-skew on the daily-cap
check is a documented known limitation (see [`../domain/transfers.md`](../domain/transfers.md) §2c).
