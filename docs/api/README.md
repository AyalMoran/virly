# Virly API Reference

**Base URL (local):** `http://localhost:3000`
**Spec file:** [`openapi.yaml`](../../openapi.yaml) (repo root)

> Render the interactive spec: `npm run docs:api` — outputs `docs/api/index.html` via Redocly.
> Regenerate any time `openapi.yaml` changes.

This reference documents the cross-cutting concerns the raw spec under-explains:
authentication, error shapes, pagination, rate limits, and SSE streaming.
The spec itself is the authoritative contract for per-endpoint request/response schemas.

---

## Table of contents

1. [Endpoint groups](#1-endpoint-groups)
2. [Authentication and CSRF](#2-authentication-and-csrf)
3. [Error envelope](#3-error-envelope)
4. [Pagination](#4-pagination)
5. [Rate limits](#5-rate-limits)
6. [Fraud hold — `POST /api/transactions` 202 path](#6-fraud-hold--post-apitransactions-202-path)
7. [Held-transfer review endpoints](#7-held-transfer-review-endpoints)
8. [SSE streaming — `POST /api/ai/chat/stream`](#8-sse-streaming--post-apiaichatstream)
9. [End-to-end examples](#9-end-to-end-examples)
10. [Related docs](#10-related-docs)

---

## 1. Endpoint groups

All application routes are mounted under `/api/*` in `server/src/app.ts`.

| Prefix | Router file | Tag |
|---|---|---|
| `GET /` | inline in app.ts | — |
| `GET /api/health` | inline in app.ts | — |
| `/api/auth` | `server/src/routes/auth.routes.ts` | Authentication |
| `/api/accounts` | `server/src/routes/user.routes.ts` | Account |
| `/api/users` | `server/src/routes/userProfile.routes.ts` | Users |
| `/api/transactions` | `server/src/routes/transaction.routes.ts` | Transactions |
| `/api/exchange-rates` | `server/src/routes/exchangeRate.routes.ts` | Exchange Rates |
| `/api/ai` | `server/src/routes/ai.routes.ts` | AI Assistant |
| `/api/video-sessions` | `server/src/routes/videoSession.routes.ts` | Video Sessions |
| `/api/admin/video-sessions` | `server/src/routes/videoSession.routes.ts` (`adminVideoSessionRoutes`) | Admin |

### Full route inventory

**Authentication** (`/api/auth`, rate-limited in production)

| Method | Path | Auth required |
|---|---|---|
| POST | `/api/auth/register` | No |
| GET | `/api/auth/verify` | No |
| POST | `/api/auth/resend-verification` | No |
| POST | `/api/auth/login` | No |
| GET | `/api/auth/me` | Yes |
| POST | `/api/auth/logout` | Yes + CSRF |

**Account** (`/api/accounts`)

| Method | Path | Auth required |
|---|---|---|
| GET | `/api/accounts/me` | Yes |
| GET | `/api/accounts/personal-details` | Yes |
| PUT | `/api/accounts/personal-details` | Yes + CSRF |
| POST | `/api/accounts/personal-details/skip` | Yes + CSRF |

**Users** (`/api/users`)

| Method | Path | Auth required |
|---|---|---|
| GET | `/api/users/:userId/profile` | Yes |
| GET | `/api/users/:userId/transactions` | Yes |

`:userId` accepts a MongoDB ObjectId or an email address.

**Transactions** (`/api/transactions`)

| Method | Path | Auth required |
|---|---|---|
| GET | `/api/transactions` | Yes |
| POST | `/api/transactions` | Yes + CSRF |
| POST | `/api/transactions/quote` | Yes + CSRF |
| GET | `/api/transactions/held/confirm` | No (token-guarded) |
| POST | `/api/transactions/held/confirm` | No (token-guarded) |
| POST | `/api/transactions/held/cancel` | No (token-guarded) |

**Exchange Rates** (`/api/exchange-rates`)

| Method | Path | Auth required |
|---|---|---|
| GET | `/api/exchange-rates/current` | Yes |

**AI Assistant** (`/api/ai`, rate-limited in production)

| Method | Path | Auth required |
|---|---|---|
| POST | `/api/ai/chat` | Yes + CSRF |
| POST | `/api/ai/chat/stream` | Yes + CSRF |
| POST | `/api/ai/confirmations/:id` | Yes + CSRF |

**Video Sessions** (`/api/video-sessions`)

| Method | Path | Auth required |
|---|---|---|
| POST | `/api/video-sessions` | Yes + CSRF |
| GET | `/api/video-sessions/:id` | Yes |
| POST | `/api/video-sessions/:id/join-token` | Yes + CSRF |
| POST | `/api/video-sessions/:id/end` | Yes + CSRF |

**Admin — Video Sessions** (`/api/admin/video-sessions`, requires video-agent role)

| Method | Path | Auth required |
|---|---|---|
| GET | `/api/admin/video-sessions` | Yes + role |
| POST | `/api/admin/video-sessions/:id/assign` | Yes + CSRF + role |
| POST | `/api/admin/video-sessions/:id/join-token` | Yes + CSRF + role |
| POST | `/api/admin/video-sessions/:id/end` | Yes + CSRF + role |

---

## 2. Authentication and CSRF

**Source files:**
- `server/src/middleware/auth.ts` — `requireAuth` middleware
- `server/src/utils/auth.ts` — cookie names, token lifetimes
- `client/src/lib/api.ts` — client-side CSRF injection

### Auth cookie

Successful `POST /api/auth/login` and `GET /api/auth/verify` set two cookies:

| Cookie | Name | Flags | Lifetime |
|---|---|---|---|
| JWT session | `virly_auth` | HttpOnly, SameSite=Strict | 7 days (default) or 30 days (`rememberMe: true`) |
| CSRF | `virly_csrf` | readable by JS | same as JWT |

The `virly_auth` cookie is the only credential the server reads; it is **never** accessible from JavaScript. The browser sends it automatically on same-origin requests. Cross-origin callers need `credentials: "include"` on fetch.

### CSRF protection

All **unsafe methods** (POST, PUT, PATCH, DELETE) on authenticated endpoints require the `X-CSRF-Token` request header containing the CSRF token value.

The token is returned in the `csrfToken` field of every `AuthSuccessResponse` (login, verify, me). Cross-origin clients must cache and re-send it. Same-origin clients may instead read it from the `virly_csrf` cookie.

The client reads `virly_csrf` and attaches it automatically (`client/src/lib/api.ts:buildHeaders`):

```
// GET /api/auth/login response body
{
  "user": { ... },
  "csrfToken": "lRZlG2Yd3xEY3EbOg8p7Yj37TyoEL7x9ySd9uSx4vxM"
}
```

Missing or mismatched CSRF token → `403 { "message": "Invalid CSRF token." }`.

### JWT internals

The JWT payload contains `userId` and `csrfTokenHash` (a hash of the CSRF token). The server recomputes and compares the hash on every unsafe request; neither the token nor the hash is stored in a database. The library used is `jsonwebtoken` (not manual validation).

For more on the security model see [../security.md](../security.md).

---

## 3. Error envelope

**Source files:**
- `server/src/utils/app-error.ts` — `AppError` class
- `server/src/middleware/error-handler.ts` — `errorHandler` function

All errors follow one of two JSON shapes:

### Standard error (AppError or decorated Error)

```json
{
  "message": "Human-readable reason.",
  "code": "MACHINE_READABLE_CODE"
}
```

`code` is optional and present only when the route explicitly sets it. Known codes include `QUOTE_REQUIRED` and `QUOTE_RATE_CHANGED` (transaction.routes.ts).

### Zod validation error

When request body validation fails (`ZodError`), the handler returns HTTP 400:

```json
{
  "message": "Validation failed.",
  "issues": [
    { "path": "email", "message": "Invalid email" },
    { "path": "amount", "message": "Amount must be greater than 0." }
  ]
}
```

`path` is the dot-joined field path (e.g. `"address.postalCode"`).

### AI confirmation superseded (409)

The confirmation endpoint may return an additional `supersededById` field when a pending transfer card was replaced by a newer one:

```json
{
  "message": "This transfer confirmation was replaced by a newer one.",
  "error": "confirmation_superseded",
  "supersededById": "6650cc68782e55fbbf857222"
}
```

### HTTP status summary

| Status | Meaning |
|---|---|
| 200 / 201 | Success |
| 400 | Validation error (`issues` array present) or bad request |
| 401 | Missing or expired `virly_auth` cookie |
| 403 | Missing or invalid CSRF token, or insufficient role |
| 404 | Resource not found |
| 409 | Conflict (rate changed, confirmation superseded, etc.) |
| 500 | Internal error — message is always `"Internal server error."` |
| 503 | Downstream service unavailable (e.g. exchange rates) |

Plain `Error` objects (not thrown as `AppError`) that reach the handler produce a generic 500 — their original message is never surfaced to the client.

---

## 4. Pagination

**Source file:** `server/src/utils/pagination.ts`

Endpoints that return lists accept query parameters:

| Parameter | Type | Default | Max | Description |
|---|---|---|---|---|
| `page` | integer ≥ 1 | `1` | — | Page number |
| `limit` | integer ≥ 1 | `10` | `50` | Records per page |

Paginated responses include a `pagination` object from `getPaginationMeta`:

```json
{
  "pagination": {
    "page": 1,
    "limit": 10,
    "total": 42,
    "totalPages": 5
  }
}
```

Endpoints that paginate: `GET /api/accounts/me`, `GET /api/transactions`, `GET /api/users/:userId/transactions`.

The `GET /api/transactions` endpoint also accepts `counterparty` (email) as an additional query filter.

Note: pagination is page/limit–based (not cursor-based); page offsets are appropriate here given that transaction history is user-scoped and bounded in size.

---

## 5. Rate limits

**Source file:** `server/src/app.ts`

Rate limiting is enforced **in production only** (both limiters use `skip: () => !isProduction`). Local development and the test suite are never rate-limited.

| Limiter | Applies to | Window | Limit | Headers |
|---|---|---|---|---|
| `authLimiter` | `/api/auth/*` | 15 minutes | 50 requests | Standard (`RateLimit-*`) |
| `aiLimiter` | `/api/ai/*` | 60 seconds | 30 requests | Standard (`RateLimit-*`) |
| `heldLimiter` | `/api/transactions/held/*` | 60 seconds | 20 requests | Standard (`RateLimit-*`) |

`heldLimiter` is always active (not scoped to production) and applies to all three held-transfer endpoints — including the read-only GET review page — to blunt one-time token guessing.

When a limit is exceeded the server responds with HTTP **429** and standard `RateLimit-Limit`, `RateLimit-Remaining`, and `RateLimit-Reset` headers.

---

## 6. Fraud hold — `POST /api/transactions` 202 path

**Source file:** `server/src/routes/transaction.routes.ts` lines 175–177, 208–273

When `config.fraud.holdLevel !== "off"` and the transfer's scored risk level meets the hold policy (`shouldHold(risk.level)`), the transfer is **not executed**. Instead the server:

1. Creates a hold record with a one-time token (`createHold`).
2. Emails the sender a review link pointing to `GET /api/transactions/held/confirm?id=<id>&token=<token>`.
3. Returns **HTTP 202** with the following JSON body:

```json
{
  "status": "held",
  "heldId": "6650cc68782e55fbbf857333",
  "level": "high",
  "reasons": ["New recipient", "Unusually large amount"],
  "expiresAt": "2026-06-26T08:00:00.000Z",
  "message": "This transfer was held for review. Check your email to confirm it."
}
```

| Field | Type | Description |
|---|---|---|
| `status` | `"held"` | Constant discriminator. |
| `heldId` | string | Opaque held-transfer identifier. |
| `level` | `"medium"` \| `"high"` | Risk level that triggered the hold. |
| `reasons` | string[] | Human-readable flagging reasons. |
| `expiresAt` | ISO 8601 string | Timestamp after which the review link expires. |
| `message` | string | Human-readable summary for the sender. |

If scoring or hold creation fails, the server degrades fail-open: the transfer executes normally and returns **201**. The fraud gate never blocks a legitimate send due to infrastructure failure.

The existing 201 / 400 `QUOTE_REQUIRED` / 409 `QUOTE_RATE_CHANGED` behavior is unchanged when the hold gate is not triggered.

---

## 7. Held-transfer review endpoints

**Source file:** `server/src/routes/transaction.routes.ts` lines 290–363

These three endpoints are **public** (no session cookie) and **token-guarded** (one-time token from the email link). All responses are `text/html`. They are rate-limited by `heldLimiter` (20 requests / 60 s, always active — see [Section 5](#5-rate-limits)). The `token` query parameter is redacted from server access logs (`server/src/app.ts` morgan token override).

### `GET /api/transactions/held/confirm`

Renders an HTML review page containing Confirm and Cancel form buttons. This endpoint is **read-only** — it does not move money, so email link-prefetch scanners cannot accidentally trigger a transfer.

| Parameter | Location | Required | Description |
|---|---|---|---|
| `id` | query | Yes | Held-transfer id. |
| `token` | query | Yes | One-time review token. |

| Status | Meaning |
|---|---|
| 200 | HTML review page rendered. |
| 400 | Missing `id` or `token`. |

### `POST /api/transactions/held/confirm`

Confirms and executes the held transfer exactly once. `id` and `token` are submitted as form fields (not in the URL) to keep them out of access logs.

| Status | Outcome (`result.status` from `confirmHold`) | Meaning |
|---|---|---|
| 200 | `executed` | Transfer confirmed and sent. |
| 200 | `already_confirmed` | Transfer was already confirmed. |
| 409 | `in_progress` | Transfer is currently being processed. |
| 410 | `expired` | Confirmation link has expired. |
| 409 | `cancelled` | Transfer was previously cancelled. |
| 400 | `failed` | Transfer execution failed (message from `result.message`). |
| 404 | (default) | Token is not valid. |

### `POST /api/transactions/held/cancel`

Cancels a pending held transfer. `id` and `token` are submitted as form fields.

| Status | Meaning |
|---|---|
| 200 | HTML result page — "Transfer cancelled" or "No change / could not be cancelled" if the hold was already actioned or the token was invalid. |
| 400 | Missing `id` or `token`. |

---

## 8. SSE streaming — `POST /api/ai/chat/stream`

**Source files:**
- `server/src/routes/ai.routes.ts` lines 146–248 — route handler
- `server/src/ai/v2/streamEvents.ts` — v2 event types and mapper
- `client/src/lib/api.ts` — `requestEventStream` / `aiChatStream`

### Request

Identical to `POST /api/ai/chat`:

```
POST /api/ai/chat/stream
Content-Type: application/json
X-CSRF-Token: <token>

{
  "message": "What is my balance?",
  "conversationId": "4b26485d-5e88-4b2b-a09f-05d66bd01157",
  "assistantId": "oshri"
}
```

The response `Content-Type` is `text/event-stream; charset=utf-8` with `Cache-Control: no-cache, no-transform` and `Connection: keep-alive`.

### SSE event shapes

Each event is sent in the standard SSE wire format:

```
event: <event-name>
data: <JSON payload>

```

#### `status` — lifecycle phase / semantic label

The `status` event name carries **two distinct payload shapes**. Discriminate on
the presence of `phase` vs `label`.

**Phase status** (both graph versions): `accepted` is sent at entry and
`completed` at the end of every request, with intermediate phases reported in
between. Each phase is emitted at most once per request. Source:
`server/src/routes/ai.routes.ts` (`sendStatusPhase`).

```json
{
  "type": "status",
  "phase": "accepted",
  "conversationId": "4b26485d-5e88-4b2b-a09f-05d66bd01157",
  "assistantId": "oshri"
}
```

Known phase values: `accepted`, `understanding_request`, `resolving_context`, `checking_account_facts`, `preparing_confirmation`, `composing_response`, `completed`.

**Semantic status** (v2 graph only): emitted while the v2 graph streams, carrying
a free-form human-readable `label` (no `phase`/`conversationId`/`assistantId`).
Source: `server/src/ai/v2/streamEvents.ts` (`{ event: "status", data: { label } }`),
wrapped to `{ type: "status", ... }` at `ai.routes.ts`.

```json
{
  "type": "status",
  "label": "Checking your balance…"
}
```

#### `token` — incremental text (v2 graph only)

Emitted for each LLM output chunk when `config.ai.graphVersion === "v2"`. Not emitted in v1 graph mode.

```json
{
  "type": "token",
  "text": "Your current balance is"
}
```

Source: `server/src/ai/v2/streamEvents.ts:mapStreamChunk` — mode `"messages"`.

#### `block` — deterministic UI block (v2 graph only)

Emitted by tools via `V2StreamWriter` when a semantic result block is ready (e.g. a balance card produced the moment the tool returns).

```json
{
  "type": "block",
  "block": { "id": "account-balance", "type": "account_summary", ... }
}
```

Source: `server/src/ai/v2/streamEvents.ts:mapStreamChunk` — mode `"custom"`, `kind: "block"`.

#### `result` — final assistant response

One per request, carries the full response identical to `POST /api/ai/chat`.

```json
{
  "type": "result",
  "conversationId": "4b26485d-5e88-4b2b-a09f-05d66bd01157",
  "assistantId": "oshri",
  "result": {
    "message": "Your balance is ₪1,042.75.",
    "responseMessage": "Your balance is ₪1,042.75.",
    "responseFormatVersion": 1,
    "conversationId": "4b26485d-5e88-4b2b-a09f-05d66bd01157",
    "assistantId": "oshri",
    "intent": "balance_inquiry",
    "toolCalls": ["getUserAccounts", "getAccountBalance"]
  }
}
```

#### `error` — stream-level error

Sent only when headers have already been flushed (HTTP status is already 200). The stream ends immediately after this event.

```json
{
  "type": "error",
  "message": "Streaming request failed."
}
```

For `AppError` instances the `message` is the application-defined one; for all other errors it is the generic string above (internals are masked).

### Event ordering

```
status(accepted) → [token…] → [block…] → status(phase…) → result → status(completed)
```

The client (`client/src/lib/api.ts:requestEventStream`) reads `status` events and dispatches them to the `onStatus` handler, collects the single `result` event, and returns it as the resolved promise value.

---

## 9. End-to-end examples

These examples are illustrative. Cookie handling is automatic in browsers; in curl you must save and replay cookies manually.

### Example 1: Register, login, get account summary

```bash
# 1. Register
curl -s -X POST http://localhost:3000/api/auth/register \
  -H "Content-Type: application/json" \
  -d '{"email":"ada@example.com","password":"StrongPass123!","phone":"+15551234567"}'
# -> {"message":"Verification email sent to ada@example.com"}

# 2. Verify email (token from the email link)
curl -s -c cookies.txt \
  "http://localhost:3000/api/auth/verify?token=<verification-token>"
# -> {"user":{...},"csrfToken":"lRZlG2Yd..."}

# 3. Get account summary (auth cookie is sent automatically by -b)
curl -s -b cookies.txt \
  "http://localhost:3000/api/accounts/me?page=1&limit=5"
# -> {"balance":0,"personalDetails":{...},"transactions":[],"pagination":{...}}
```

### Example 2: Login, get FX quote, execute a transfer

```bash
# 1. Login and capture cookies + CSRF token
RESPONSE=$(curl -s -c cookies.txt -X POST http://localhost:3000/api/auth/login \
  -H "Content-Type: application/json" \
  -d '{"email":"ada@example.com","password":"StrongPass123!","rememberMe":false}')
CSRF=$(echo "$RESPONSE" | grep -o '"csrfToken":"[^"]*"' | cut -d'"' -f4)

# 2. Get a USD transfer quote
QUOTE=$(curl -s -b cookies.txt -X POST http://localhost:3000/api/transactions/quote \
  -H "Content-Type: application/json" \
  -H "X-CSRF-Token: $CSRF" \
  -d '{"amount":100,"currency":"USD"}')
RATE=$(echo "$QUOTE" | grep -o '"rate":[0-9.]*' | head -1 | cut -d: -f2)
FETCHED=$(echo "$QUOTE" | grep -o '"rateFetchedAt":"[^"]*"' | cut -d'"' -f4)

# 3. Execute the transfer — echo the quote back to lock the rate
curl -s -b cookies.txt -X POST http://localhost:3000/api/transactions \
  -H "Content-Type: application/json" \
  -H "X-CSRF-Token: $CSRF" \
  -d "{\"recipientEmail\":\"bob@example.com\",\"amount\":100,\"currency\":\"USD\",
       \"quote\":{\"rate\":$RATE,\"fetchedAt\":\"$FETCHED\"},
       \"reason\":\"Rent\"}"
# -> {"message":"Transfer completed successfully.","transaction":{...},"newBalance":...}
```

### Example 3: AI chat (non-streaming)

```bash
# Assumes cookies.txt and CSRF from a prior login
curl -s -b cookies.txt -X POST http://localhost:3000/api/ai/chat \
  -H "Content-Type: application/json" \
  -H "X-CSRF-Token: $CSRF" \
  -d '{"message":"Send 50 ILS to bob@example.com for coffee","assistantId":"oshri"}'
# -> {"message":"...","confirmation":{"id":"6650cc68...","version":1,...},...}

# If the AI returns a confirmation card, confirm it:
curl -s -b cookies.txt -X POST \
  "http://localhost:3000/api/ai/confirmations/6650cc68782e55fbbf857111" \
  -H "Content-Type: application/json" \
  -H "X-CSRF-Token: $CSRF" \
  -d '{"action":"confirm","version":1}'
# -> {"status":"confirmed","message":"Transfer completed successfully.","newBalance":...}
```

---

## 10. Related docs

- **Security model** — cookie flags, CSRF design, JWT internals: [../security.md](../security.md)
- **Backend reference** — service and repository layer, data models: [../backend/index.md](../backend/index.md)
- **AI architecture** — graph versions, HITL flow, response blocks: [../ai/architecture.md](../ai/architecture.md)

To render the full interactive spec:

```bash
npm run docs:api
# Opens docs/api/index.html
```
