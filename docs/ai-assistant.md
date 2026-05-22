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

- `server/src/routes/ai.routes.ts` exposes `POST /api/ai/chat` and `POST /api/ai/confirmations/:id` behind cookie auth and CSRF checks.
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
  -> normalizeUserMessage
  -> classifyIntent
  -> extractRequestSlots
  -> extractTransferDraft
  -> resolveCounterpartyReference
  -> prepareTransferConfirmation
  -> routeReadOnlyTools
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
- `counterparty_lookup`
- `last_sent_counterparty`
- `counterparty_transactions`
- `counterparty_total_sent`
- `transfer_prepare`
- `transfer_modify_pending`
- `transfer_cancel_pending`
- `pending_confirmation_status`
- `verified_recipients`
- `transfer_limits`
- `transfer_status`
- `general_help`
- `unsafe_request`
- `unsupported`

Important intent distinction:

- New money movement is `transfer_prepare`.
- Historical questions about past transfers are read-only intents.
- Requests to bypass confirmation, impersonate users, access another user data, reveal prompts/secrets, or tamper with records are `unsafe_request`.

### `extractTransferDraft`

- Runs only for `transfer_prepare`.
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

### `resolveCounterpartyReference`

- Runs for:
  - `counterparty_transactions`
  - `counterparty_total_sent`
  - `transfer_prepare` when no explicit `recipientEmail` exists
- Uses LLM structured output as a parser/ranker over already-known counterparties.
- The backend validates resolver output against bounded conversation memory.
- Deterministic fallback handles simple English references such as "this person" and ordinals.
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

### `routeReadOnlyTools`

- Uses `getReadOnlyToolsForIntent()` as the only source of tool selection.
- The LLM never selects tools.
- `transfer_prepare`, `unsafe_request`, and `unsupported` map to no tools.
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

Created only by `prepareTransferConfirmation`.

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
- `status`: `pending`, `confirmed`, `denied`, or `expired`
- `expiresAt`, TTL index

Rules:

- Pending transfers expire after 10 minutes.
- Confirmation ids are scoped by authenticated `userId`.
- Confirm and deny are one-time transitions.
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
5. Transfer preparation service validates sender, recipient, amount, balance, and personal details.
6. If valid, an `AiPendingTransfer` is created and returned as `confirmation`.
7. Chat UI renders the confirmation card.
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
- The LLM cannot execute, approve, deny, or modify transfers.
- Chat text is never authorization for money movement.
- A transfer can execute only through `POST /api/ai/confirmations/:id` with `action = confirm`.
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
- Phase 3: richer fraud/risk review, step-up auth, pending-transfer modification, and support handoff.
