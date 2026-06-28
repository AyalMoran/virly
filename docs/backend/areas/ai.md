# Backend area: AI

> The assistant's HTTP surface: chat, SSE streaming, and pending-transfer
> confirmation. Mounted at `/api/ai` (rate limited by `aiLimiter` in
> production). See [`../index.md`](../index.md) for layering.

> **The assistant's internals are documented in depth elsewhere — this file does
> not duplicate them.** Graph versions (v1/v2), the HITL confirm flow, response
> blocks, tools, and streaming live in the
> [AI architecture doc](../../ai/architecture.md). The money-movement settlement
> reached by the confirm endpoint lives in the
> [Transfers domain doc](../../domain/transfers.md). Per-endpoint request/response
> and SSE event shapes live in the
> [API reference](../../api/README.md#8-sse-streaming--post-apiaichatstream).
> This file is the **route → service map** only.

**Router:** `server/src/routes/ai.routes.ts`
**Services:** `server/src/services/aiConversation.service.ts`,
`server/src/services/aiPendingTransfer.service.ts`,
`server/src/services/aiAuditLog.service.ts`,
`server/src/services/videoSession.service.ts` (for the assistant's video CTA),
`server/src/services/transfer.service.ts` (settlement, via the pending-transfer service)
**Subsystem:** `server/src/ai/*` (graph, tools, v2 HITL) — see the AI doc.

## Endpoints

| Method | Path | Auth | Handler calls | Notes |
|--------|------|------|---------------|-------|
| POST | `/api/ai/chat` | Yes (+ CSRF) | graph runner (`runAssistant`/`invokeV2Resumable`), `mongoConversationStore`, `writeAiAuditLog` | Non-streaming turn; may return a clarification or a confirmation card. |
| POST | `/api/ai/chat/stream` | Yes (+ CSRF) | `streamAssistantV2` + the same stores | SSE stream (`text/event-stream`); event shapes in the API reference. |
| POST | `/api/ai/confirmations/:id` | Yes (+ CSRF) | `aiPendingTransfer.service`: `respondToAiPendingTransfer` → `transfer.service` | **Money-movement gate.** `action: confirm` settles the prepared transfer; `deny` cancels; version mismatch → 409 `confirmation_superseded`. |

Request/response + SSE: [API reference §1 + §8](../../api/README.md#8-sse-streaming--post-apiaichatstream).

## Layer walk

- **Route** validates with Zod (`chatSchema`, `confirmationSchema`,
  `confirmationIdSchema`), selects the graph version from `config.ai.graphVersion`,
  frames the SSE response for the streaming endpoint, persists the turn via
  `mongoConversationStore`, and writes audit entries via `writeAiAuditLog`. The
  graph and tools themselves live under `server/src/ai/*`.
- **Service** — `aiConversation.service.ts` persists conversation turns;
  `aiPendingTransfer.service.ts` prepares/modifies/resumes pending-transfer cards
  and, on confirm, calls into `transfer.service.ts` to settle;
  `aiAuditLog.service.ts` records assistant events. The route can also create a
  `videoSession` when the assistant surfaces a video CTA.
- **Repository** access through the `aiConversations`, `aiPendingTransfers`,
  `aiAuditLogs`, `users`, and `transactions` seam interfaces.

## Cross-cutting

- All endpoints require `requireAuth` + CSRF; `aiLimiter` (30 req/min) applies in
  production — see [API reference §5](../../api/README.md#5-rate-limits).
- **The assistant cannot move money on its own.** It can only *prepare* a
  pending-transfer card; settlement happens only when an authenticated
  `POST /api/ai/confirmations/:id` with `action: confirm` is received. This is
  the same `runInTransaction` settlement as the manual flow — see the
  [Transfers domain doc](../../domain/transfers.md).
