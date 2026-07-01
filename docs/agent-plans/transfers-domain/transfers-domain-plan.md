# Plan: Money-Movement / Transfer Domain Doc

> **Deliverable:** `docs/domain/transfers.md`
> **Type:** Architecture / domain doc
> **Audience:** Anyone changing transfer, limit, FX, or confirmation logic
> **Status:** Done - shipped as `docs/domain/transfers.md`.
> **Gap:** Table 2 #6 — the highest-stakes logic is described only piecemeal across README and frontend area docs.

## Why this doc
A transfer touches the client cheque flow, the HTTP execute path, the AI HITL
confirmation gate, daily/per-transfer limits, idempotency, and FX. Today a
reader must assemble that from five places. This doc is the single domain
narrative for "how money moves and why it's safe."

## Source material (already in the repo)
- Core write path: `server/src/services/transfer.service.ts` (`executeTransfer`, `runInTransaction`, daily-debit cap, FX fields)
- HITL path: `server/src/services/aiPendingTransfer.service.ts` (create/respond, version guard, idempotency, `getResumablePendingForUser`)
- v2 gate: `ai/v2/nodes/{transferGate,executeTransfer}.ts`, `ai/v2/hitl.ts`
- HTTP: `routes/transaction.routes.ts` (`POST /api/transactions`, `/quote`), `routes/ai.routes.ts` (`POST /api/ai/confirmations/:id`)
- FX: `services/fx.service.ts`, `models/ExchangeRate.ts`, `routes/exchangeRate.routes.ts`
- Client surfaces: `client/src/components/TransferCheque.tsx`, `features/transfer/*`, `components/ui/floating-chat-widget-shadcnui.tsx`
- Existing prose: `docs/frontend/areas/transfers.md`, `ai-assistant.md` (link these)

## Phases
### Phase 1 — The two execution paths
- [x] Diagram + prose for **(a)** manual cheque flow (`POST /api/transactions`) and **(b)** assistant-prepared flow (`POST /api/ai/confirmations/:id` with `action:"confirm"` + version).
- [x] State the invariant: the UI never moves money; execution only happens at these two server endpoints.
- **Deliverable:** "execution paths" section with a sequence diagram.

### Phase 2 — Safety mechanisms
- [x] Document the unit-of-work transaction (`runInTransaction`), per-transfer + daily limits, and the documented write-skew caveat (READ COMMITTED parity).
- [x] Document idempotency: the `Idempotency-Key` on confirm, the pending-transfer version guard, and supersede semantics.
- **Deliverable:** "safety" section.

### Phase 3 — FX
- [x] How a transfer in USD/EUR is quoted and stored (`enteredCurrency`/`enteredAmount`/`exchangeRateUsed`), and how rates are fetched/cached.
- **Deliverable:** "FX" section.

### Phase 4 — Failure modes + cross-links
- [x] Insufficient funds, expired/superseded confirmation, denied transfer, unverified sender/recipient — with the resulting status to the user.
- [x] Link to AI architecture (HITL), API reference (endpoint shapes), and the frontend transfer docs.
- **Deliverable:** "failure modes" section + cross-links.

## Acceptance criteria
- [x] Both execution endpoints and the "UI never moves money" invariant are documented and match the code.
- [x] Idempotency + version-guard behaviour matches `aiPendingTransfer.service.ts`.
- [x] Limits and FX field semantics match `transfer.service.ts` and `ExchangeRate.ts`.

## Related docs (link, don't duplicate)
[ai-architecture](../ai-architecture/ai-architecture-plan.md) · [api-reference](../api-reference/api-reference-plan.md) · `docs/frontend/areas/transfers.md`

## Effort estimate
Medium (M) — focused domain; the diagrams carry most of the value.
