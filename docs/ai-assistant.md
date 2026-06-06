# AI Assistant

The Virly AI assistant is an authenticated account helper built on LangGraph.js.
It can answer account questions, remember recent counterparty context, and
prepare transfer confirmations. The backend remains the authority for all
account facts and money movement. Chat text never executes a transfer; only the
explicit confirmation endpoint can do that.

This document is intended for developers and agents extending the assistant.
When changing the assistant, preserve the boundary between LLM language work and
backend-authoritative decisions.

## Structure

- `server/src/routes/ai.routes.ts` exposes `POST /api/ai/chat`, `POST /api/ai/chat/stream`, and `POST /api/ai/confirmations/:id` behind cookie auth and CSRF checks.
- `server/src/ai/graph.ts` owns the LangGraph flow and is the source of truth for node order.
- `server/src/ai/state.ts` owns the shared TypeScript contracts for graph state, intents, tool names, LLM provider methods, transfer drafts, and confirmations.
- `server/src/ai/llm.ts` adapts `@langchain/openai` `ChatOpenAI` with Zod structured output for classification, transfer draft extraction, counterparty reference resolution, and final wording.
- `server/src/ai/router.ts` performs deterministic safety prechecks, deterministic fallback classification, and fixed intent-to-tool routing.
- `server/src/ai/messageNormalization.ts` extracts language, direction, currency, amount, counterparty, and pending-confirmation slot metadata without changing the user's text.
- `server/src/ai/policy.ts` contains the central safety policy and refusal messages.
- `server/src/ai/counterpartyMemory.ts` contains bounded counterparty memory helpers and deterministic reference fallback.
- `server/src/ai/tools/` contains approved read-only tools. Tools always scope queries by authenticated `userId`.
- `server/src/services/aiConversation.service.ts` persists conversation context in `AiConversation`.
- `server/src/services/aiPendingTransfer.service.ts` creates and resolves short-lived pending transfer confirmations.
- `server/src/services/transfer.service.ts` contains the shared transfer execution logic used by both the regular transfer route and AI confirmation.
- `server/src/services/aiAuditLog.service.ts` writes metadata-only AI audit events.

## Graph Flow

Current graph order in `server/src/ai/graph.ts`:

```text
START
  -> loadAuthenticatedContext
  -> loadConversationContext
  -> resolveClarificationReply
  -> normalizeUserMessage
  -> classifyIntent
  -> extractRequestSlots
  -> extractTransferDraft
  -> resolveCounterpartyReference
  -> resolveContextualAmounts
  -> routeReadOnlyTools
  -> prepareTransferConfirmation
  -> modifyPendingTransferConfirmation
  -> composeResponse
  -> saveConversation
  -> END
```

### `loadAuthenticatedContext`

- Fails closed if `userId` is missing.
- Sets `intent = unsafe_request`, `refusalReason = authentication_required`, and a response message.
- Auth identity comes only from `requireAuth`; chat text never supplies user identity.

### `loadConversationContext`

- Loads persisted conversation by `userId + conversationId`.
- Appends the latest user message.
- Refreshes the turn counter and trims messages to the last 20.
- Loads bounded counterparty memory:
  - `lastCounterparty`
  - `mentionedCounterparties`, max 5
  - structured `entities`, max 12
  - structured `answerFrames`, max 8
  - `mode`, `pendingConfirmation`, and the latest `clarification`
  - LRU behavior is implemented by `rememberCounterparty`.

### `normalizeUserMessage`

- Preserves the original text and adds metadata only.
- Detects Hebrew, English, mixed language, and RTL/LTR/mixed direction.
- Marks currency symbols and date-expression candidates.
- Extracts deterministic request slots after classification:
  - explicit email or contextual recipient words
  - literal amount and currency
  - transaction direction
  - pending-confirmation references
- Hebrew is not translated into English as the main strategy; original phrases such as `לו`, `לה`, `שקל`, and `שישי האחרון` are preserved for downstream parsing.

### `classifyIntent`

- Runs deterministic unsafe-request precheck before the LLM.
- Uses LLM structured output when configured.
- Falls back to deterministic classification if the LLM provider is unavailable or fails.
- Returns only:
  - `intent`
  - optional `refusalReason`
- It must not extract entities, choose tools, execute actions, or ask the user questions.

### `extractRequestSlots`

- Runs after classification so intent and entity parsing remain separate.
- Extracts deterministic slot metadata for counterparty, amount, currency, transaction direction, ordinals, and pending-confirmation references.
- Slot metadata can enrich the transfer draft, but it is still not trusted execution input.

Supported intents:

- `balance_inquiry`
- `account_summary`
- `recent_transactions`
- `transaction_search`
- `transaction_summary`
- `transaction_count`
- `transaction_detail`
- `transaction_stats`
- `cashflow_summary`
- `counterparty_lookup`
- `recent_sent_counterparties`
- `recent_received_counterparties`
- `counterparty_summary`
- `counterparty_activity_timeline`
- `last_sent_counterparty`
- `counterparty_transactions`
- `counterparty_total_sent`
- `counterparty_total_received`
- `counterparty_net_total`
- `transfer_prepare`
- `transfer_modify_pending`
- `transfer_cancel_pending`
- `pending_confirmation_status`
- `verified_recipients`
- `recipient_profile`
- `transfer_limits`
- `transfer_eligibility`
- `transfer_quote`
- `daily_transfer_usage`
- `pending_ai_transfers`
- `transfer_status`
- `general_help`
- `unsafe_request`
- `unsupported`

Important intent distinction:

- New money movement is `transfer_prepare`.
- Changes to an active pending confirmation are `transfer_modify_pending`.
- Historical questions about past transfers are read-only intents.
- Requests to bypass confirmation, impersonate users, access another user data, reveal prompts/secrets, or tamper with records are `unsafe_request`.

### `extractTransferDraft`

- Runs only for `transfer_prepare` and `transfer_modify_pending`.
- Uses LLM structured output when configured.
- Falls back to a simple deterministic extractor.
- Produces a draft, not a trusted transfer:
  - `recipientReference`
  - `recipientEmail`
  - `amount`
  - `amountText`
  - `amountReferenceText`
  - `currency`
  - `currencyMentioned`
  - `currencySupported`
  - `reason`
- The LLM may parse what the user wrote, but it does not resolve authority, verify recipients, check balances, or create transactions.
- The backend rejects unsupported transfer currencies before pending-transfer preparation. The app currently prepares transfers only in ILS; USD/EUR mentions require clarification instead of silent conversion.
- For `transfer_modify_pending`, missing fields mean "keep the existing pending confirmation value"; they do not authorize a transfer.

### `resolveCounterpartyReference`

- Runs for:
  - `counterparty_summary`
  - `counterparty_activity_timeline`
  - `counterparty_transactions`
  - `counterparty_total_sent`
  - `counterparty_total_received`
  - `counterparty_net_total`
  - `transfer_prepare` when no explicit `recipientEmail` exists
  - `transfer_modify_pending` only when the modification includes a new recipient reference
  - `pending_confirmation_status` only when the message is an ordinal or detail
    reference to pending-transfer memory
- Uses LLM structured output as a parser/ranker over already-known counterparties.
- The backend validates resolver output against bounded conversation memory.
- Deterministic fallback handles simple English references such as "this person" and ordinals.
- Pending-transfer ordinal follow-ups such as "what about the first one" or
  `מה לגבי הראשון` are read-only status/reference questions. They may run the
  allowlisted `resolvePendingTransferReference` tool only when recent
  conversation memory points to pending confirmations.
- For read-only counterparty intents, unresolved references become a clarification response and no tools run.
- For `transfer_prepare`, unresolved references continue to `prepareTransferConfirmation`, which asks a transfer-specific missing-recipient question.
- Clarification state is persisted so replies like "the second one" can be interpreted against the latest clarification rather than free-form chat text in a later phase.

### `prepareTransferConfirmation`

- Runs only for `transfer_prepare`.
- Creates no transaction.
- Calls `prepareAiPendingTransfer`, which validates:
  - authenticated sender exists
  - recipient exists as a Virly user
  - recipient is not the sender
  - amount is positive
  - sender has sufficient current balance
- Recipient source precedence:
  - explicit `recipientEmail`
  - resolved counterparty memory
  - unique provided personal-details name match from `recipientReference`
- Creates `AiPendingTransfer` only when required details are valid.
- Stores a snapshot of recipient email plus first and last name when provided.
- Returns a `TransferConfirmation` payload for the chat UI.
- The confirmation payload includes `version`, `status`, nested recipient details, nested amount details, warnings, and explicit confirm/deny action bodies. The card payload is the source of truth for review; assistant wording is secondary.

### `modifyPendingTransferConfirmation`

- Runs only for `transfer_modify_pending`.
- Requires an active pending confirmation in the current conversation memory.
- Loads the pending transfer by authenticated `userId`, `conversationId`, id, status `pending`, and expiry.
- Builds a new transfer draft by copying the old pending transfer and applying only the modified fields from the user message.
- Revalidates the complete new draft through the backend transfer-preparation service, including sender scope, recipient, amount, balance, and limits.
- If validation fails, the old pending transfer remains pending and no replacement confirmation is created.
- If validation succeeds, one database transaction creates the new `AiPendingTransfer` and marks the old one `superseded` with `supersededById`.
- Returns a new confirmation card and `supersededConfirmationId` so the client can visibly invalidate the old card.
- Chat wording must say that a new card needs review and confirmation. Chat text must never execute the transfer.

### `routeReadOnlyTools`

- Uses `getReadOnlyToolsForIntent()` as the only source of tool selection.
- The LLM never selects tools.
- `transfer_prepare`, `transfer_modify_pending`, `unsafe_request`, and `unsupported` map to no tools.
- Each tool name is checked by `isReadOnlyToolName()` before execution.
- Tool results may update counterparty memory from backend metadata.

### `composeResponse`

- Builds a deterministic fallback response first.
- If the LLM responder is available, it may reword the fallback with the selected assistant personality.
- The responder receives sanitized tool metadata and must not invent account facts.
- Personality affects wording only. It must not change intent, tool use, refusal behavior, account scope, or transfer state.
- When a transfer confirmation exists, the response should tell the user to review the card and use the buttons. It must not claim the transfer is complete.

### `saveConversation`

- Saves the latest user and assistant messages.
- Persists updated bounded counterparty memory.
- Persists structured context:
  - conversation `mode`
  - recent `entities`
  - recent `answerFrames`
  - pending confirmation snapshot when one is created
  - latest clarification request
- Refreshes the conversation TTL through `AiConversation`.

### Audit

- Audit logging happens after graph invocation in `runAssistantGraph`.
- Logs metadata only:
  - user id
  - conversation id
  - request id
  - assistant id
  - detected intent
  - tools requested
  - tools executed
  - refusal reason
- Do not log raw prompts, secrets, cookies, full transaction documents, or full account data.

## Subgraph Boundaries

The graph is easier to reason about if you treat it as five deterministic
subgraphs with strict handoff rules.

### 1. Auth And Persistence Boundary

- `loadAuthenticatedContext` trusts only backend auth middleware.
- `loadConversationContext` and `saveConversation` persist bounded context only.
- `conversationId` is a storage key, not an authorization claim.

### 2. Parsing And Intent Boundary

- `normalizeUserMessage`, `classifyIntent`, `extractRequestSlots`, and
  `extractTransferDraft` may parse language, wording, and user intent.
- These nodes may produce structured hints, but they do not authorize tools,
  recipient ownership, balances, or transfer execution.

### 3. Reference And Read-Only Fact Boundary

- `resolveCounterpartyReference` and read-only tools are the only path that can
  turn free-form references into backend-scoped account facts.
- Tool execution is allowlisted by `router.ts` and validated again in the graph.
- Read-only tools may update bounded conversation memory, but they must not
  mutate account or transfer state.

### 4. Transfer Draft And Confirmation Boundary

- `prepareTransferConfirmation` and `modifyPendingTransferConfirmation` are the
  only graph nodes that can create pending confirmation state.
- They validate authenticated sender scope, recipient identity, amount, balance,
  expiry, and pending-confirmation ownership through backend services.
- They may create or supersede `AiPendingTransfer` records, but they never
  execute the transfer itself.

### 5. Response And Streaming Boundary

- `composeResponse` may reword already-decided backend state.
- `/api/ai/chat/stream` may emit progress phases, but not partial account facts
  or transfer execution claims.
- Final user-visible messages are hydrated from sanitized LLM-facing labels back
  to backend-known user-visible labels before returning to the client.

## Label Safety Rules

The assistant uses two parallel label surfaces on purpose.

- LLM-safe labels:
  masked emails and masked labels such as `a***@example.com`
- User-visible labels:
  full emails and full display labels such as `Alex Example (alex@example.com)`

Rules:

- Tool summaries and responder inputs sent to the LLM use masked labels only.
- Backend memory may keep full backend-only email fields where deterministic
  resolution needs them.
- Final `/api/ai/chat` and `/api/ai/chat/stream` result payloads may show full
  emails only after backend-controlled hydration.
- Audit diagnostics must keep masked or metadata-only values.
- New tools must define their LLM-safe and user-visible labels explicitly; do
  not reuse user-visible labels inside LLM-facing summaries by accident.

## Contextual Amount Resolution Rules

`amountReferenceText` exists so the backend can preserve phrases without
inventing amounts too early.

Supported scopes today:

- latest received transaction with the resolved counterparty
- latest sent transaction with the resolved counterparty
- previous read-only total answer from conversation memory
- latest pending confirmation amount for pending-modification flows

Rules:

- If the backend can resolve the amount deterministically, it fills
  `transferDraft.amount` before transfer preparation.
- If the backend cannot resolve the scope safely, it asks for clarification and
  does not create a pending confirmation.
- Bare `same amount` is treated as ambiguous when more than one safe source is
  plausible.
- Unsupported currencies are clarified before preparation; they are not
  converted silently.

## Clarification Resume Flow

Clarification is explicit state, not a best-effort chat guess.

1. A node detects missing or ambiguous information.
2. The graph stores a `clarification` object in conversation memory with:
   reason, message, expected reply type, optional options, and optional
   `resumeIntent` plus `resumeDraft`.
3. A later reply such as `the second one`, `that one`, or
   `the previous answer total` is interpreted against the saved clarification
   first.
4. Once the clarification resolves, the graph clears the saved clarification and
   resumes the intended safe flow.

Rules:

- Clarification replies do not bypass auth, tool allowlists, or transfer
  validation.
- Resume data is bounded and structured; it is not raw hidden prompt state.
- If the reply still does not resolve the ambiguity, the graph asks again
  without running unsafe downstream steps.

## Scenario Matrix

These are the main scenarios the current graph and eval harness are expected to
cover.

### Read-Only

- `who did I send money to today?`
- `מי העביר לי היום?`
- `how much did he send me?`
- `what is my net with him?`
- `show activity with him`
- `Tell me more about the second one`
- after listing pending confirmations: `what about the first one`
- after a Hebrew pending list: `מה לגבי הראשון`

### Transfer Preparation

- `send him 50`
- `send him that amount`
- `send him the same amount he sent me`
- `תעביר לו 50`
- `בוא נעביר לו שוב את אותה כמות`

### Pending Confirmation

- `Actually make it 70`
- `same recipient but 70`
- `send it to Sarah instead`
- `use the same amount as before`
- `yes`
- `confirm it`
- `deny it`

Expected invariants:

- Read-only questions may query facts but never mutate balances or transfers.
- Transfer preparation may create a pending confirmation card only after backend
  validation.
- Pending-transfer modification may create a new card and supersede the old one,
  but never execute money movement.
- Chat text such as `yes`, `confirm it`, or `deny it` never executes a
  transfer.
- Pending-list ordinal follow-ups run only read-only resolution and must not
  modify, confirm, deny, or supersede a pending transfer.

Deterministic eval coverage includes a mixed Hebrew/English success chain:

1. Ask who the user sent money to today.
2. Prepare a transfer to the referenced recipient for the same latest sent
   amount.
3. Ask how much that recipient sent back.
4. Prepare a second transfer for that received amount.

The deterministic fixture uses fake backend-shaped memory and an eval-only
amount resolver. Seeded Mongo or live LLM evals are still required to verify the
same chain against real persisted transaction rows or a configured model.

## LLM Schemas

The LLM adapter uses `ChatOpenAI.withStructuredOutput()` with Zod schemas. Keep
schemas narrow. Do not add fields unless the graph consumes them.

### Classification Schema

Defined in `server/src/ai/llm.ts`:

```ts
{
  intent: AssistantIntent;
  refusalReason?: string | null;
}
```

Purpose:

- classify the latest user task
- optionally attach a refusal reason for `unsafe_request`

Do not add entities or missing fields here. Transfer entities belong to
`transferDraftSchema`; counterparty references belong to
`referenceResolutionSchema`.

### Transfer Draft Schema

```ts
{
  recipientReference?: string | null;
  recipientEmail?: string | null;
  amount?: number | null;
  amountText?: string | null;
  amountReferenceText?: string | null;
  currency?: "ILS" | "USD" | "EUR" | "UNKNOWN" | null;
  currencyMentioned?: boolean;
  currencySupported?: boolean;
  reason?: string | null;
}
```

Purpose:

- parse the user's transfer request into a draft
- preserve contextual recipient text such as "him", "this person", `לו`, or a name
- extract a positive numeric amount when clear
- preserve contextual amount phrases such as "same amount as last time" without inventing a number
- preserve explicit currency mentions
- extract a short optional reason

Constraints:

- This schema is not trusted execution input by itself.
- Recipient resolution and balance checks happen in backend services.
- The app currently supports transfer preparation in ILS only.
- USD/EUR mentions are not silently treated as ILS; the assistant asks for clarification.

### Counterparty Reference Resolution Schema

```ts
{ kind: "none"; confidence: "low" | "medium" | "high" }
{ kind: "last_counterparty"; confidence: "low" | "medium" | "high" }
{ kind: "ordinal_counterparty"; ordinal: 1 | 2 | 3 | 4 | 5; confidence: "low" | "medium" | "high" }
{ kind: "named_counterparty"; query: string; confidence: "low" | "medium" | "high" }
```

Purpose:

- parse references such as "this person", "the first person we talked about", or Hebrew equivalents
- rank against known conversation memory

Backend rule:

- Only `high` confidence resolutions are accepted.
- The backend resolves the result against stored memory.
- The LLM never returns a trusted email unless the backend can validate it.

### Response Schema

```ts
{
  message: string;
}
```

Purpose:

- final wording only
- personality styling only
- language should match the user's latest message

The response schema never carries trusted facts, tool calls, transfer execution,
or confirmation state. Those come from graph state and backend services.

## Persistence Schemas

### `AiConversation`

Stored by `userId + conversationId` with a unique index.

Fields:

- `assistantId`
- `messages`, last 20 chat messages
- `memory.turn`
- `memory.lastCounterparty`
- `memory.mentionedCounterparties`, max 5
- `memory.entities`, max 12 structured references to backend facts
- `memory.answerFrames`, max 8 recent answer summaries with entity/tool refs
- `memory.mode`
- `memory.pendingConfirmation`
- `memory.clarification`
- `expiresAt`, TTL refreshed to 30 days on save

This is conversational context, not an authorization record.

### `AiPendingTransfer`

Created by `prepareTransferConfirmation` and by
`modifyPendingTransferConfirmation` when replacing an existing pending card.

Fields:

- `userId`
- `conversationId`
- `assistantId`
- `version`, currently starts at `1`
- `currency`, currently `ILS`
- `recipientEmail`
- `recipientFirstName`
- `recipientLastName`
- `amount`
- `reason`
- `status`: `pending`, `confirmed`, `denied`, `expired`, or `superseded`
- `supersedesId`, when this confirmation replaces an older pending card
- `supersededById`, when this confirmation was replaced by a newer card
- `expiresAt`, TTL index

Rules:

- Pending transfers expire after 10 minutes.
- Confirmation ids are scoped by authenticated `userId`.
- Confirm and deny are one-time transitions.
- Superseded confirmations cannot be confirmed or denied.
- Confirm rechecks pending status and expiry inside the backend operation.

## API

### Chat

`POST /api/ai/chat`

```json
{
  "message": "What is my balance?",
  "conversationId": "optional-existing-id",
  "assistantId": "oshri"
}
```

`assistantId` is optional and defaults to `oshri`. Valid values are `oshri`,
`chaya`, `yehuda`, and `yohai_daniel`.

Read-only response:

```json
{
  "message": "Virly account Your Virly account available balance is 125.00.",
  "conversationId": "conversation-id",
  "assistantId": "oshri",
  "intent": "balance_inquiry",
  "toolCalls": ["getUserAccounts", "getAccountBalance"]
}
```

Transfer-preparation response:

```json
{
  "message": "Please review the transfer details and confirm before I send anything.",
  "conversationId": "conversation-id",
  "assistantId": "oshri",
  "intent": "transfer_prepare",
  "toolCalls": [],
  "confirmation": {
    "id": "pending-transfer-id",
    "version": 1,
    "type": "transfer",
    "status": "pending",
    "recipientEmail": "moran@example.com",
    "recipientFirstName": "Moran",
    "recipientLastName": "Ayal",
    "amount": 50,
    "currency": "ILS",
    "recipient": {
      "email": "moran@example.com",
      "firstName": "Moran",
      "lastName": "Ayal",
      "displayName": "Moran Ayal",
      "verified": true
    },
    "amountDetails": {
      "value": 50,
      "currency": "ILS",
      "formatted": "₪50.00"
    },
    "reason": "Dinner",
    "warnings": [],
    "expiresAt": "2026-05-22T12:00:00.000Z",
    "confirmAction": {
      "method": "POST",
      "path": "/api/ai/confirmations/pending-transfer-id",
      "body": {
        "action": "confirm",
        "version": 1
      }
    },
    "denyAction": {
      "method": "POST",
      "path": "/api/ai/confirmations/pending-transfer-id",
      "body": {
        "action": "deny",
        "version": 1
      }
    }
  }
}
```

Transfer-modification response:

```json
{
  "message": "I updated the pending transfer. Please review the new confirmation card before anything is sent.",
  "conversationId": "conversation-id",
  "assistantId": "oshri",
  "intent": "transfer_modify_pending",
  "toolCalls": [],
  "supersededConfirmationId": "old-pending-transfer-id",
  "confirmation": {
    "id": "new-pending-transfer-id",
    "version": 1,
    "type": "transfer",
    "status": "pending",
    "recipientEmail": "moran@example.com",
    "recipientFirstName": "Moran",
    "recipientLastName": "Ayal",
    "amount": 70,
    "currency": "ILS",
    "reason": "Dinner",
    "warnings": [],
    "expiresAt": "2026-05-22T12:05:00.000Z",
    "supersedesId": "old-pending-transfer-id"
  }
}
```

### Chat Stream

`POST /api/ai/chat/stream`

This endpoint follows the same backend safety flow as `POST /api/ai/chat`, but
streams progress-only status events before a final `result` event.

Current phase labels:

- `accepted`
- `understanding_request`
- `resolving_context`
- `checking_account_facts`
- `preparing_confirmation`
- `composing_response`
- `completed`

Rules:

- Status events must not contain raw tool payloads, account balances, or
  transfer execution claims.
- The final `result` event uses the same payload shape as `POST /api/ai/chat`.
- Streaming is a transport optimization only; it must not bypass any backend
  confirmation or authorization boundary.

### Confirmation

`POST /api/ai/confirmations/:id`

```json
{
  "action": "confirm",
  "version": 1,
  "idempotencyKey": "client-generated-uuid"
}
```

or:

```json
{
  "action": "deny",
  "version": 1,
  "idempotencyKey": "client-generated-uuid"
}
```

The idempotency key can also be sent as an `Idempotency-Key` header.

Confirm response:

```json
{
  "status": "confirmed",
  "message": "Transfer completed successfully.",
  "newBalance": 75,
  "transaction": {
    "id": "transaction-id",
    "counterpartyEmail": "moran@example.com",
    "amount": -50,
    "reason": "Dinner",
    "date": "2026-05-22T12:00:00.000Z"
  }
}
```

Deny response:

```json
{
  "status": "denied",
  "message": "Transfer cancelled."
}
```

Superseded confirmation response:

```json
{
  "message": "This transfer confirmation was replaced by a newer one. Please review and confirm the latest transfer card.",
  "error": "confirmation_superseded",
  "supersededById": "new-pending-transfer-id"
}
```

Both endpoints require auth cookies and `X-CSRF-Token` for unsafe methods.
Confirmation requests must include the current card `version`. Idempotency keys are accepted to make client retries return the same stored result when available.

## Possible Flows

### Balance Or General Read-Only Query

1. User asks a supported read-only question.
2. Classifier returns a read-only intent.
3. Counterparty resolver is skipped unless the intent requires a counterparty.
4. Tool router executes the fixed read-only tools for that intent.
5. Response composer summarizes backend tool results.
6. Conversation context is saved.

Example: "What is my balance?" -> `balance_inquiry` ->
`getUserAccounts`, `getAccountBalance`.

### Counterparty Follow-Up

1. User asks about a referenced person, such as "this person" or "the first person".
2. Classifier returns `counterparty_transactions` or `counterparty_total_sent`.
3. Resolver maps the reference to a stored counterparty.
4. If resolved, the relevant counterparty tool runs with `resolvedCounterparty`.
5. If not resolved, the assistant asks for clarification and no tool runs.

### Transfer Preparation

1. User asks for a new transfer, such as "send him 50".
2. Classifier returns `transfer_prepare`.
3. Transfer draft extractor parses recipient reference/email, amount, and reason.
4. Resolver resolves contextual recipients when no explicit email exists.
5. Contextual amount resolver fills a deterministic amount only when backend-safe sources exist.
6. Transfer preparation service validates sender, recipient, amount, balance, and personal details.
7. If valid, an `AiPendingTransfer` is created and returned as `confirmation`.
8. Chat UI renders the confirmation card.
9. No transfer is executed yet.

### Pending Transfer Modification

1. User has an active pending confirmation and asks to change its amount, recipient, reason, or another draft field.
2. Classifier returns `transfer_modify_pending` only when the message clearly refers to the active pending transfer.
3. Draft extractor parses only the requested changes.
4. Resolver handles a new recipient reference when needed.
5. Transfer modification service loads the old pending transfer by authenticated user scope and revalidates the full replacement draft.
6. If valid, the backend creates a new pending confirmation and marks the old confirmation `superseded` in one database transaction.
7. Chat UI renders the new confirmation card and invalidates the old card.
8. No transfer is executed yet.

### Transfer Confirmation

1. User clicks Confirm on the chat card.
2. Client calls `POST /api/ai/confirmations/:id` with `{ "action": "confirm" }`.
3. Backend looks up a pending, unexpired, user-scoped confirmation.
4. Backend executes the transfer through `executeTransferWithSession`.
5. Pending transfer status changes to `confirmed`.
6. Client updates the displayed message and authenticated balance.

### Transfer Denial

1. User clicks Deny on the chat card.
2. Client calls `POST /api/ai/confirmations/:id` with `{ "action": "deny" }`.
3. Backend marks the pending transfer `denied`.
4. No transfer executes.
5. Later confirm attempts fail because the confirmation is no longer pending.

### Superseded Confirmation

1. User tries to confirm an older card that was replaced by a newer card.
2. Backend returns 409 with `error = confirmation_superseded` and `supersededById`.
3. No transfer executes.

### Refusal

1. User asks to bypass confirmation, access another user's data, reveal prompts, or tamper with records.
2. Deterministic safety precheck or classifier returns `unsafe_request`.
3. No transfer draft extraction, tool execution, or confirmation creation can produce money movement.
4. Response composer returns a refusal message.

### LLM Missing Or Failing

1. If OpenAI config is missing, `createConfiguredAssistantLlmProvider()` returns undefined.
2. Classifier, transfer draft extraction, resolver, and response wording use deterministic fallback paths.
3. If an LLM call throws, the graph catches it and falls back for that step.
4. Local tests do not require OpenAI.

## Constraints

- The backend is authoritative for auth, user scope, tool routing, recipient validation, balances, and transfer execution.
- The LLM cannot select tools.
- The LLM cannot execute, approve, deny, or directly mutate transfers.
- Chat text is never authorization for money movement.
- A transfer can execute only through `POST /api/ai/confirmations/:id` with `action = confirm`.
- Only pending confirmations can execute. Confirmed, denied, expired, and superseded confirmations are rejected.
- Pending-transfer modifications create a new confirmation and supersede the old one; they never mutate the visible card in place.
- Confirmation cards must show full recipient email plus first and last name when available. If names are missing, the UI must show that the name is not provided.
- Transfer recipients must resolve to existing Virly users.
- The sender cannot transfer to themself.
- Pending transfer ids are scoped to the authenticated user and expire.
- Do not trust `conversationId`, `assistantId`, recipient labels, or names as authorization. They are context/display metadata only.
- Do not log raw prompts, credentials, cookies, secrets, or unbounded financial records.
- Personalities affect wording only.
- If adding new intents, update `AssistantIntent`, `intentValues`, OpenAPI, docs, deterministic fallback, and tests together.
- If adding new tools, update the fixed tool map and `isReadOnlyToolName`; do not let the LLM request arbitrary tools.

## Local Development

Run the backend:

```bash
npm run dev --workspace server
```

Build the backend:

```bash
npm run build --workspace server
```

Build the client:

```bash
npm run build --workspace client
```

Run AI safety tests:

```bash
npm run test --workspace server
```

Run focused AI assistant tests:

```bash
npx tsx --test src/ai/tests/aiSafety.test.ts
```

Run deterministic eval fixtures:

```bash
./scripts/ai-eval-chat.sh deterministic
```

Optional guarded eval modes:

```bash
VIRLY_AI_EVAL_ENABLE_LLM_DEV=true ./scripts/ai-eval-chat.sh llm-dev
VIRLY_AI_EVAL_ENABLE_MONGO=true VIRLY_AI_EVAL_MONGO_URI='mongodb://...' ./scripts/ai-eval-chat.sh seeded-mongo
VIRLY_AI_EVAL_ENABLE_LLM_DEV=true VIRLY_AI_EVAL_ENABLE_MONGO=true VIRLY_AI_EVAL_MONGO_URI='mongodb://...' ./scripts/ai-eval-chat.sh llm-seeded-mongo
VIRLY_AI_EVAL_KEEP_MONGO=true VIRLY_AI_EVAL_ENABLE_LLM_DEV=true VIRLY_AI_EVAL_ENABLE_MONGO=true VIRLY_AI_EVAL_MONGO_URI='mongodb://...' ./scripts/ai-eval-chat.sh llm-seeded-mongo
```

Notes:

- `llm-dev` also requires a working `OPENAI_API_KEY` and `VIRLY_AI_MODEL`.
- `seeded-mongo` is intentionally blocked unless a dedicated eval database URI
  is provided; it must not silently reuse the default development database.
- `llm-seeded-mongo` requires both guarded setups: live LLM configuration plus
  a dedicated seeded Mongo eval database.
- `VIRLY_AI_EVAL_KEEP_MONGO=true` skips the final eval database drop so the
  seeded collections can be inspected after the run. The initial drop still
  happens before seeding, so the eval starts from a clean dedicated database.
- For local Docker Mongo inspection in Compass, use
  `mongodb://127.0.0.1:27017/virly_ai_eval?directConnection=true`.
- The deterministic eval mode covers current fixture behavior, including
  pending-confirmation ordinal follow-ups and the Hebrew/English transfer
  success chain. It does not prove seeded database behavior or live model
  extraction quality.

Guarded eval environment variables:

- `VIRLY_AI_EVAL_ENABLE_LLM_DEV=true`
- `VIRLY_AI_EVAL_ENABLE_MONGO=true`
- `VIRLY_AI_EVAL_MONGO_URI`
- `VIRLY_AI_EVAL_KEEP_MONGO=true`
- `OPENAI_API_KEY`
- `VIRLY_AI_MODEL`

Validate OpenAPI syntax:

```bash
ruby -e 'require "yaml"; YAML.load_file("openapi.yaml")'
```

Current environment variables:

- `VIRLY_AI_MOCK_PER_TRANSFER_LIMIT`, default `500`
- `VIRLY_AI_MOCK_DAILY_TRANSFER_LIMIT`, default `1000`
- `VIRLY_AI_MODEL`, default `gpt-4o-mini`
- `OPENAI_API_KEY`, optional

## Roadmap

- Phase 1: read-only assistant, implemented.
- Phase 2: transfer preparation with explicit chat confirmation, implemented.
- Phase 3: richer fraud/risk review, step-up auth, and support handoff.
