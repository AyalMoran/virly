# Stop bypassing `aiPendingTransfer.service` in the confirm route

> **✅ Implemented.** `getResumablePendingForUser(pendingTransferId, userId)` now
> exists in `server/src/services/aiPendingTransfer.service.ts` and is called from
> the v2-resume branch of `ai.routes.ts` (the route no longer touches the
> `AiPendingTransfer` model). The `userId`-scoping and freshness predicate live
> in the service, and the method is covered by `aiPendingTransfer.service.test.ts`.

**Priority:** Medium · **Effort:** Small · **Risk:** Low

## Problem

`aiPendingTransfer.service.ts` is the owner of pending-transfer state, yet the
AI confirm route reaches into the model directly for the v2-resume fast path:

- `server/src/routes/ai.routes.ts:255` — `const pending = await AiPendingTransfer.findOne({ ... })`

This is the one place the confirm endpoint touches the `AiPendingTransfer` model
itself instead of going through the service that already encapsulates every
other read/write of that collection (`respondToAiPendingTransfer`,
`createPendingTransfer`, the idempotency + version-guard logic, etc.). It is a
small leak, but it means the route now knows the document's query shape
(`userId`, `status`, `expiresAt`) and can drift from the service's invariants.

## Proposed change

Add a narrow read method to the service and call it from the route:

```ts
// aiPendingTransfer.service.ts
export function getResumablePendingForUser(
  pendingTransferId: string,
  userId: string
): Promise<PendingTransferDocument | null>;
```

```ts
// ai.routes.ts — inside the v2-resume branch
const pending = await getResumablePendingForUser(pendingTransferId, req.userId);
```

Keep the same `userId`-scoping and the `status: "pending"` / `expiresAt`
predicate inside the service so authorization and freshness rules live in one
place.

## Why it is worth doing

The money-movement path is exactly where you want a single source of truth for
"which pending transfers are valid to act on." Centralizing the predicate makes
the confirm/resume/deny paths provably consistent and keeps the route a thin
controller.

## Reference

The rest of `ai.routes.ts`'s confirm handler already delegates to
`respondToAiPendingTransfer` — this just closes the one remaining direct query.
