# Money Movement — Transfer Domain

> **Audience:** Engineers changing transfer, limit, FX, or confirmation logic.
> **Related docs:**
> - AI HITL internals → [`../ai/architecture.md`](../ai/architecture.md) *(written separately)*
> - Full endpoint/request shapes → [`../api/README.md`](../api/README.md)
> - Frontend transfer surfaces → [`../frontend/areas/transfers.md`](../frontend/areas/transfers.md)

---

## Overview

Money moves through exactly **two server endpoints**. The client UI collects
intent and displays results, but it never mutates balances directly. All
balance debits and credits happen inside a `runInTransaction` call on the
server, at one of:

| Path | Who triggers it |
|---|---|
| `POST /api/transactions` | User submits the manual cheque form |
| `POST /api/ai/confirmations/:id` | User confirms (or denies) an AI-prepared card |

No other code path moves money. The LLM running the assistant cannot call
`executeTransfer` directly — it can only prepare a pending-transfer record and
surface a confirmation card; a subsequent authenticated `POST
/api/ai/confirmations/:id` is the only path that ever reaches settlement.

---

## 1. Execution Paths

### 1a. Manual Cheque Flow

**Route:** `POST /api/transactions`
**Handler:** `server/src/routes/transaction.routes.ts`
**Core logic:** `server/src/services/transfer.service.ts` → `executeTransfer`

The client submits a body like:

```json
{
  "recipientEmail": "bob@example.com",
  "amount": 150,
  "currency": "ILS",
  "reason": "Dinner"
}
```

For non-ILS transfers the client must first call `POST /api/transactions/quote`
to obtain a server-issued rate snapshot, then echo it back in `quote`:

```json
{
  "recipientEmail": "bob@example.com",
  "amount": 42,
  "currency": "USD",
  "quote": { "rate": 3.72, "fetchedAt": "2026-06-25T10:00:00.000Z" }
}
```

If the echoed `rate` or `fetchedAt` does not match the current server snapshot
the handler throws **409 QUOTE_RATE_CHANGED** before touching the database.

**Note:** AI-assistant limits (`assertAiTransferWithinLimits`) are **not**
enforced on the manual cheque path. They apply only to AI-confirmed transfers.

```
┌─────────────────────────────────────────────────────────────────────────────┐
│                      Manual Cheque Sequence                                  │
└─────────────────────────────────────────────────────────────────────────────┘

Client                       transaction.routes.ts          transfer.service.ts
  │                                   │                              │
  │──POST /api/transactions ─────────►│                              │
  │   { recipientEmail, amount,       │                              │
  │     currency, reason, quote? }    │                              │
  │                                   │ resolveTransferAmount()      │
  │                                   │  (quote check, ILS convert)  │
  │                                   │──── executeTransfer() ──────►│
  │                                   │                              │ runInTransaction
  │                                   │                              │  findById(sender)
  │                                   │                              │  findByEmail(recipient)
  │                                   │                              │  assert balance >= amount
  │                                   │                              │  setBalance(sender, -)
  │                                   │                              │  setBalance(recipient, +)
  │                                   │                              │  createMany([debit, credit])
  │                                   │◄──── { message, newBalance, │
  │◄──── 201 { message, newBalance,   │        transaction } ────────│
  │       transaction } ──────────────│                              │
```

### 1b. Assistant-Prepared Flow (HITL)

**Route:** `POST /api/ai/confirmations/:id`
**Handler:** `server/src/routes/ai.routes.ts`
**Core logic:** `server/src/services/aiPendingTransfer.service.ts` →
`respondToAiPendingTransfer`
**v2 gate nodes:** `server/src/ai/v2/nodes/transferGate.ts`,
`server/src/ai/v2/nodes/executeTransfer.ts`, `server/src/ai/v2/hitl.ts`

**Request body:**

```json
{
  "action": "confirm",
  "version": 1
}
```

Or with idempotency:

```json
{
  "action": "confirm",
  "version": 1,
  "idempotencyKey": "client-generated-uuid-or-similar"
}
```

The `Idempotency-Key` header is also accepted as an alternative to the body
field (`idempotencyKey` body wins if both are present).

`action` must be `"confirm"` or `"deny"`. `version` must be a positive integer
matching the pending-transfer record's current version.

**v2 graph path:** When `VIRLY_AI_GRAPH_VERSION=v2` (the default), the
confirmation endpoint first tries to resume a checkpointed LangGraph thread
via `resumeV2Confirmation`. If a paused graph exists for the card, `Command({
resume: payload })` is issued; `transferGate` receives the decision, routes
`"confirm"` → `executeTransfer` node → `respondToAiPendingTransfer`. If no
resumable checkpoint exists the handler falls through directly to
`respondToAiPendingTransfer`.

In both cases, `respondToAiPendingTransfer` is the function that actually
settles: the LLM model cannot and does not call it.

```
┌─────────────────────────────────────────────────────────────────────────────┐
│                   Assistant-Prepared (HITL) Sequence                         │
└─────────────────────────────────────────────────────────────────────────────┘

User (chat)          ai.routes.ts      LangGraph v2 graph        aiPendingTransfer.service.ts
    │                     │                    │                          │
    │──POST /ai/chat ────►│                    │                          │
    │   { message }       │──invokeV2─────────►│                          │
    │                     │                    │ prepare→agent→tools→     │
    │                     │                    │ finalize                 │
    │                     │                    │──prepareAiPendingTransfer►│
    │                     │                    │                          │ create record
    │                     │                    │                          │ (version=1, status=pending)
    │                     │                    │◄── confirmation card ────│
    │                     │                    │ transferGate: interrupt() │
    │◄── { confirmation } │◄── (paused) ───────│                          │
    │                     │                    │                          │
    │  (user reviews card)│                    │                          │
    │                     │                    │                          │
    │──POST /ai/confirmations/:id ────────────►│                          │
    │   { action:"confirm", version:1,         │                          │
    │     idempotencyKey? }                    │                          │
    │                     │                    │ transferGate resumes     │
    │                     │                    │──► executeTransfer node  │
    │                     │                    │──── respondToAiPending ─►│
    │                     │                    │                          │ assertAiTransferWithinLimits
    │                     │                    │                          │ runInTransaction
    │                     │                    │                          │  optimistic lock check
    │                     │                    │                          │  executeTransferWithSession
    │                     │                    │                          │  updateStatus → "confirmed"
    │◄── { status:"confirmed", newBalance,     │◄─── result ─────────────│
    │     transaction } ─────────────────────── │                          │
```

---

## 2. Safety Mechanisms

### 2a. Unit-of-Work Transaction

All balance mutations happen inside `repos.runInTransaction(fn)` (opaque
`TxContext`), defined in `server/src/services/transfer.service.ts`:

```ts
export async function executeTransfer(input): Promise<ExecuteTransferResult> {
  return getRepositories().runInTransaction(async (tx) =>
    executeTransferWithSession(input, tx)
  );
}
```

Inside the transaction, in order:
1. Read sender (fail fast if missing)
2. Read recipient by email (fail fast if missing)
3. Assert `sender.balance >= amount`
4. `setBalance(sender, sender.balance - amount)`
5. `setBalance(recipient, recipient.balance + amount)`
6. `createMany([debitEntry, creditEntry])`

All six operations are atomic: either all commit or all roll back. Under
MongoDB the repo uses `session.withTransaction`; under PostgreSQL it uses a
Drizzle transaction.

### 2b. Per-Transfer and Daily Limits (AI-Confirmed Transfers Only)

These limits are enforced via `assertAiTransferWithinLimits` in
`server/src/services/transfer.service.ts`, called inside the settlement
transaction for every AI-confirmed transfer. They do **not** apply to the
manual cheque path.

| Limit | Config field | Default | Env override |
|---|---|---|---|
| Per-transfer cap | `config.ai.perTransferLimit` | **500 ILS** | `VIRLY_AI_MOCK_PER_TRANSFER_LIMIT` |
| Daily debit cap | `config.ai.dailyTransferLimit` | **1000 ILS** | `VIRLY_AI_MOCK_DAILY_TRANSFER_LIMIT` |

**Daily-cap computation:** inside the transaction, `getDailyDebitUsage` sums
all debit transactions for the sender whose `createdAt` falls in
`[startOfDay, nextDay)` (UTC-local midnight boundaries). If
`usedToday + amount > dailyLimit` the transfer throws **400
EXCEEDS_DAILY_LIMIT**.

```ts
const startOfDay = new Date(now.getFullYear(), now.getMonth(), now.getDate());
const nextDay    = new Date(now.getFullYear(), now.getMonth(), now.getDate() + 1);
const { total: usedToday } = await repos.transactions.getDailyDebitUsage(
  { ownerId: senderId, dayStart: startOfDay, dayEnd: nextDay },
  tx
);
```

### 2c. Write-Skew Caveat (Documented)

The comment in `transfer.service.ts` (`assertAiTransferWithinLimits`, lines
38–42) documents the caveat explicitly:

> *"MongoDB's snapshot isolation does not fully serialize two concurrent
> confirmations (write-skew remains possible), but this closes the by-design
> bypass where the daily cap was never checked at settlement."*

The same caveat is mirrored in the PostgreSQL migration design spec
(`docs/superpowers/specs/2026-06-22-postgres-migration-design.md`, §3):

> *"Postgres `READ COMMITTED` carries the same write-skew caveat already
> documented in `transfer.service` for Mongo snapshot isolation. Phase 1
> preserves current behaviour; it is not a hardening pass."*

In practice: two concurrent AI confirmations that individually pass the daily
cap check may both commit, together exceeding the cap. Tightening to
`SERIALIZABLE` / `SELECT … FOR UPDATE` is explicitly out of scope for Phase 1.

### 2d. Idempotency, Version Guard, and Supersede Semantics

All logic is in `server/src/services/aiPendingTransfer.service.ts`
(`respondToAiPendingTransfer`).

**Version guard (optimistic lock):** Before executing, the service checks:

```ts
if (
  !owned ||
  owned.version !== input.version ||
  owned.status !== "pending" ||
  owned.expiresAt.getTime() <= Date.now()
) {
  throw getStatusError(); // 409
}
```

Any version mismatch, non-pending status, or expiry throws **409** with
`"This transfer confirmation is no longer available."`.

> **Confirm vs. deny take different code paths to the same guarantee.** The
> inline optimistic-lock block above runs on the **`confirm`** branch, *inside*
> `runInTransaction`, immediately before settlement
> (`aiPendingTransfer.service.ts`). The **`deny`** branch is a separate
> early-return that runs *outside* the transaction: it checks `superseded`
> status in application code, then delegates the same version / pending /
> not-expired predicates to the repository's `updateStatus` call (passing
> `{ version, expectedStatus: "pending", notExpired: true }`). The observable
> result is identical — a 409 on any mismatch or expiry — but a reader tracing
> the source should not expect deny to hit the pseudocode block above.

**Idempotency:** The `idempotencyKey` (from body or `Idempotency-Key` header)
is stored on the pending-transfer record. Before executing, the service reads
`idempotencyResults[key]`; if a result already exists for that key it is
returned immediately without re-executing.

After a successful confirm or deny the result is written into
`idempotencyResults` atomically with the status flip.

**Supersede semantics:** When the assistant modifies a prepared card, a new
pending-transfer record is created with `supersedesId = oldId` and the old
record is atomically set to `status: "superseded"` with
`supersededById = newId`. If a confirm arrives for the superseded card,
`respondToAiPendingTransfer` throws **409** with:

```json
{
  "error": "confirmation_superseded",
  "supersededById": "<new-card-id>"
}
```

The message is: *"This transfer confirmation was replaced by a newer one.
Please review and confirm the latest transfer card."*

**TTL:** Pending transfers expire after **10 minutes**
(`PENDING_TRANSFER_TTL_MS = 10 * 60 * 1000`). An expired record causes the
same 409 as any other non-pending/version-mismatched state.

---

## 3. FX (Foreign Currency Transfers)

### Quote flow

Before submitting a non-ILS transfer the client calls:

```
POST /api/transactions/quote
{ "amount": 42, "currency": "USD" }
```

The server calls `getCurrentRates()` → `buildTransferQuote()` and returns:

```json
{
  "quote": {
    "enteredAmount": 42,
    "enteredCurrency": "USD",
    "amountIls": 156.24,
    "rate": 3.72,
    "rateFetchedAt": "2026-06-25T10:00:00.000Z",
    "rateValidForDate": "2026-06-25",
    "baseCurrency": "ILS",
    "provider": "exchangerate-api"
  }
}
```

### Rate caching

`getCurrentRates()` in `server/src/services/fx.service.ts` implements a
daily cache:

1. Look up today's snapshot in the `exchange_rates` collection by
   `(baseCurrency="ILS", validForDate=<today-UTC>)`.
2. If found and `expiresAt > now`: return it (no network call).
3. Otherwise: fetch from the configured provider, upsert the snapshot, return
   it.
4. On provider failure: fall back to the latest non-expired snapshot in the DB.
5. If no snapshot available at all: throw **503 FxUnavailableError**.

The cache TTL is configured via `VIRLY_FX_CACHE_TTL_HOURS` (default **48
hours**). A background `startDailyFxRefresh` interval (every 6 hours) warms
the cache on boot and picks up UTC-day rollovers without requiring user traffic.

### Stored FX metadata on transactions

When a non-ILS transfer is executed, the following fields are written onto
**both** the debit and credit transaction records:

| Field | Type | Source |
|---|---|---|
| `enteredCurrency` | `"USD" \| "EUR"` | User input |
| `enteredAmount` | `number` | User input (rounded to 2 dp) |
| `exchangeRateUsed` | `number` | Rate from the echoed quote snapshot |
| `exchangeRateFetchedAt` | `Date` | `rateFetchedAt` from the echoed quote |

The `amount` field on the transaction always stores the authoritative **ILS
amount** regardless of entered currency. The `enteredCurrency` /
`enteredAmount` / `exchangeRateUsed` fields are informational for receipts.

The `ExchangeRate` model (`server/src/models/ExchangeRate.ts`) stores the
daily rate snapshot keyed by `(baseCurrency, validForDate)`. It does not hold
per-transaction rates; those are copied onto the transaction record at
settlement time via the echoed quote.

### Rate-change protection

For non-ILS transfers the client echoes back `{ rate, fetchedAt }` from the
server-issued quote. Before any DB write, `resolveTransferAmount` checks:

```ts
if (input.quote.rate !== currentQuote.rate ||
    input.quote.fetchedAt !== currentQuote.rateFetchedAt) {
  throw new AppError(409, "The exchange rate has changed …", { code: "QUOTE_RATE_CHANGED" });
}
```

This ensures the ledger amount always reflects a rate the user explicitly saw
and accepted.

---

## 4. Failure Modes

| Condition | HTTP | Message / code |
|---|---|---|
| Sender not found | 404 | `"Sender account not found."` |
| Recipient email does not exist | 404 | `"Recipient email does not exist."` |
| Self-transfer | 400 | `"You cannot transfer money to yourself."` |
| Insufficient balance | 400 | `"Insufficient balance."` |
| AI transfer exceeds per-transfer limit | 400 | `"That amount exceeds the per-transfer limit of <N> ILS."` / `EXCEEDS_PER_TRANSFER_LIMIT` |
| AI transfer exceeds daily limit | 400 | `"That amount exceeds your remaining daily limit of <N> ILS."` / `EXCEEDS_DAILY_LIMIT` |
| Non-ILS transfer without quote | 400 | `"A current exchange-rate quote is required …"` / `QUOTE_REQUIRED` |
| Exchange rate changed since quote | 409 | `"The exchange rate has changed …"` / `QUOTE_RATE_CHANGED` |
| FX rates unavailable | 503 | `"Currency conversion is currently unavailable."` |
| Version mismatch / expired / non-pending | 409 | `"This transfer confirmation is no longer available."` |
| Card superseded by newer card | 409 | `"This transfer confirmation was replaced by a newer one."` + `supersededById` |
| Card denied | 200 | `{ status: "denied", message: "Transfer cancelled." }` |
| Invalid confirmation id format | 400 | Zod parse error (must match `/^[a-fA-F0-9]{24}$/`) |

The `deny` action on a superseded card throws 409 (superseded check runs
before the deny path). The `deny` action on a valid pending card returns 200
`{ status: "denied", message: "Transfer cancelled." }`.

---

## 5. Fraud Risk Scoring and Hold-Until-Confirmation

> This section covers the fraud gate on the **manual cheque path**
> (`POST /api/transactions`) only. It is entirely separate from the
> AI-confirmed transfer limits (`assertAiTransferWithinLimits`), which apply
> only on the HITL path and are documented in Section 2b above.

### 5a. Overview and Fail-Open Design

When `VIRLY_FRAUD_HOLD_LEVEL` is not `"off"`, the manual transfer route scores
the transfer BEFORE executing. If the score meets the hold threshold, the
transfer is NOT executed immediately: a held record is created, a one-time
email link is sent to the sender, and the route returns HTTP 202 instead of
201. Money moves only when the sender confirms via the link.

Two independent failure modes both degrade gracefully (fail-open):

1. **Scoring throws** — logged, falls through to a normal send.
2. **Hold cannot be created** (e.g., AI Postgres unreachable) — logged loudly
   as `[fraud] FAIL-OPEN: a high-risk transfer was NOT held due to an error`,
   falls through to a normal send.

A fraud control must never block a legitimate transfer.

Source: `server/src/routes/transaction.routes.ts` lines 175-273
(`tryHoldTransfer`).

### 5b. Risk Scoring (`computeRisk`)

`computeRisk` in `server/src/fraud/risk.ts` is **pure and deterministic**: it
takes a `RiskSignals` struct and returns a `RiskResult` with no I/O or
side-effects.

**Rules and weights** (additive, clamped to `[0, 1]` at the end):

| Rule | Condition | Weight |
|---|---|---|
| New counterparty | First-ever debit to this recipient | +0.2 |
| High amount | `amount >= 0.8 * perTransferLimit` | +0.2 |
| Over daily limit | `projectedDailyTotal >= dailyLimit` | +0.35 |
| Near daily limit | `projectedDailyTotal >= 0.9 * dailyLimit` (and not over) | +0.2 |
| Amount spike | `amount > mean + 3*std` of recent debits (needs >= 5 debits) | +0.25 |
| Odd hour | Hour-of-day in {0, 1, 2, 3, 4, 5} UTC | +0.1 |
| Anomaly signal | Always adds `0.4 * anomalyScore`; flagged when `anomalyScore >= 0.6` | up to +0.4 |

`perTransferLimit` and `dailyLimit` come from `config.ai.perTransferLimit` /
`config.ai.dailyTransferLimit` (defaults **500 ILS** / **1000 ILS**; env vars
`VIRLY_AI_MOCK_PER_TRANSFER_LIMIT` / `VIRLY_AI_MOCK_DAILY_TRANSFER_LIMIT` —
see [`../configuration.md`](../configuration.md)).

**Risk level thresholds** (after clamping):

| Score range | Level |
|---|---|
| `>= 0.7` | `high` |
| `>= 0.4` | `medium` |
| `< 0.4` | `low` |

Source: `server/src/fraud/risk.ts` lines 40-104.

### 5c. Scoring Service (`scoreTransfer`)

`scoreTransfer` in `server/src/fraud/service.ts` gathers the signals that
`computeRisk` needs by reading the **app repositories only** (works in both
Mongo and Postgres mode):

- `hasDebitToCounterparty` — new-counterparty flag.
- `getDailyDebitUsage` — daily total (UTC day window).
- `recentForOwner` (up to 50 debits) — spike and kNN anomaly inputs.

The kNN anomaly score comes from `fraud/anomaly.ts` (`knnAnomalyScore`).

When called **post-commit** (`alreadyExecuted: true`), the newest debit is the
transfer itself, so `scoreTransfer` drops it from history to avoid
self-comparison in the anomaly/spike calculation.

Source: `server/src/fraud/service.ts` lines 38-70.

### 5d. Best-Effort Risk Flag (`recordTransferRiskFlag`)

After a transfer completes on the **normal** (non-held) path, the route calls
`recordTransferRiskFlag` post-commit. This is best-effort:

- Calls `scoreTransfer` with `alreadyExecuted: true`.
- If level is `low`, stops (no write).
- Otherwise persists a row to `ai_fraud_flags` in the AI Postgres.
- All errors are swallowed — a flag failure never affects the completed
  transfer.

The `ai_fraud_flags` table lives in the AI Postgres (requires
`VIRLY_AI_PG_URL`). This is the same Postgres that holds held transfers and
vector embeddings — see [`../configuration.md`](../configuration.md).

Source: `server/src/fraud/service.ts` lines 101-125.

### 5e. Hold Gate — Lifecycle

When `shouldHold(level)` returns true (configurable via
`VIRLY_FRAUD_HOLD_LEVEL`; values: `"off"` | `"medium"` | `"high"`):

- `"high"` — holds only `high`-level transfers.
- `"medium"` — holds `medium` and `high`.
- `"off"` — no holds (default); best-effort post-commit flagging still runs.

The held record is stored in the `held_transfers` table in the AI Postgres.
Expiry is `config.fraud.holdExpiryHours` hours from creation (env var
`VIRLY_FRAUD_HOLD_EXPIRY_HOURS`, default **24 hours**).

**Token security:** `createHold` generates `randomBytes(24).toString("hex")`.
Only the SHA-256 hash is stored in `held_transfers.token_hash`; the raw token
travels only in the email link.

**HTTP response when held (202):**

```json
{
  "status": "held",
  "heldId": "<24-char id>",
  "level": "high",
  "reasons": ["First transfer to this recipient.", "Amount is near the per-transfer limit (450/500)."],
  "expiresAt": "2026-06-28T10:00:00.000Z",
  "message": "This transfer was held for review. Check your email to confirm it."
}
```

Source: `server/src/routes/transaction.routes.ts` lines 255-262;
`server/src/fraud/holds.ts` lines 102-121.

### 5f. Held Transfer Status Machine

Statuses in `held_transfers` and their transitions:

```
pending ──confirm-click──► confirming ──execute-succeeds──► confirmed
   │                            │
   │                            └── execute-fails (money did NOT move) ──► pending  (retryable)
   │                            └── execute-succeeds, bookkeeping-fails ──► needs_reconciliation
   │
   ├──cancelHold──► cancelled   (only from pending)
   └──expires_at passed──► (no automatic DB flip; confirmHold returns "expired")
```

**Double-spend prevention:** `confirmHold` uses a compare-and-set SQL UPDATE
(`WHERE status = 'pending' AND token_hash = ? AND expires_at > now()
RETURNING *`) to atomically claim the row to `confirming`. Only the one
concurrent request that wins the claim executes the money move.

**Failure handling after claim:**
- Money did NOT move → revert to `pending` (retryable).
- Money MOVED, bookkeeping UPDATE fails → try to write `confirmed`; if that
  also fails → `needs_reconciliation` (never revert to pending — that would
  risk a double-spend).

`cancelHold` only cancels a still-`pending` hold.

The actual money move calls `executeTransfer` — the same atomic debit/credit
used on the normal path (see Section 2a).

Source: `server/src/fraud/holds.ts` lines 187-269 (`confirmHold`),
lines 314-322 (`cancelHold`).

### 5g. Public Confirm/Cancel Endpoints

Three public endpoints handle the email-link flow; all are rate-limited (20
req/min per window):

| Method | Path | Purpose |
|---|---|---|
| `GET` | `/api/transactions/held/confirm` | Renders an HTML review page only — no state change |
| `POST` | `/api/transactions/held/confirm` | Token in form body; executes confirm |
| `POST` | `/api/transactions/held/cancel` | Token in form body; executes cancel |

The GET endpoint exists so that email link-scanners and prefetchers cannot
accidentally trigger the money move. The actual state change requires a POST
with the token in the form body (not the URL).

For full HTTP contract details and security rationale see
[`../api/README.md`](../api/README.md) and [`../security.md`](../security.md).

Source: `server/src/routes/transaction.routes.ts` lines 275-363.

---

## 6. Cross-Links

- **HITL gate internals** (transferGate node, graph topology, checkpointer):
  see [`../ai/architecture.md`](../ai/architecture.md)
- **Full endpoint shapes and request/response schemas**: see
  [`../api/README.md`](../api/README.md)
- **Frontend transfer surfaces** (TransferCheque, TransferPage, confirmation
  card UI): see [`../frontend/areas/transfers.md`](../frontend/areas/transfers.md)
- **Environment variables** (VIRLY_FRAUD_HOLD_LEVEL, VIRLY_FRAUD_HOLD_EXPIRY_HOURS,
  VIRLY_AI_PG_URL, limit overrides): see [`../configuration.md`](../configuration.md)
- **Token endpoint security and rate limiting**: see [`../security.md`](../security.md)
- **Fraud v2 tool** (AI assistant surface for fraud scoring): see
  [`../ai/architecture.md`](../ai/architecture.md)
