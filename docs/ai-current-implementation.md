# AI Assistant Current Implementation

This document describes the Virly AI assistant as implemented in the current
codebase. It is intentionally separate from improvement plans and historical
milestone logs.

## Status Labels

### Implemented

- Authenticated AI chat endpoints: `POST /api/ai/chat` and
  `POST /api/ai/chat/stream` in `server/src/routes/ai.routes.ts`.
- Transfer confirmation endpoint:
  `POST /api/ai/confirmations/:id` in `server/src/routes/ai.routes.ts`.
- A LangGraph `StateGraph` in `server/src/ai/graph.ts` with top-level
  conditional routing and compiled subgraph nodes.
- Fixed deterministic intent-to-tool mapping in `server/src/ai/router.ts`.
- Read-only account tools in `server/src/ai/tools/`, executed through
  allowlisted tool names only.
- Transfer preparation and pending-transfer replacement through
  `server/src/services/aiPendingTransfer.service.ts`.
- Money movement only through the confirmation endpoint, which calls
  `executeTransferWithSession()` in `server/src/services/transfer.service.ts`.
- Mongo conversation memory through
  `server/src/services/aiConversation.service.ts`.
- Deterministic eval mode plus guarded live-LLM and seeded-Mongo eval modes.

### Partially Implemented

- Clarification/resume is stored as structured conversation memory, but only
  selected reply types have explicit resume behavior.
- `AiUserRequest` exists as an internal compatibility object, but not every
  resolver and tool decision is fully migrated to it.
- Transfer limit, quote, eligibility, and daily-usage tools exist as read-only
  preflight information. They are not enforced by pending-confirmation creation
  or confirmation execution.
- Some tool names are present in shared contracts before an executor exists.

### Planned

- Native LangGraph `interrupt()` / `Command({ resume })` production flow.
- LangGraph checkpoint persistence beyond Mongo conversation memory.
- Broader clarification resume coverage for all clarification types.
- Additional profile/action tools if `getMyProfile` or `getAvailableActions`
  become real executors.

### Deprecated / Inaccurate

- The assistant is not a single broad linear graph anymore. The current graph
  uses compiled subgraphs and top-level conditional edges.
- Native LangGraph interrupts are not production behavior.
- MCP and LangGraph `ToolNode` behavior are not wired into this runtime.
- The LLM does not select arbitrary tools.
- Chat text cannot confirm, deny, or execute transfers.
- Read-only tools must not mutate account, transaction, or transfer state.

### Known Mismatch

- `getTransferLimits`, `getTransferEligibility`, `getTransferQuote`, and
  `getDailyTransferUsage` expose read-only preflight information, including
  per-transfer and daily limits. `prepareAiPendingTransfer()` and
  `respondToAiPendingTransfer()` do not enforce those configured limits today.
- `AssistantToolName`, `client/src/lib/types.ts`, and `openapi.yaml` include
  `getCashflowSummary`, `getMyProfile`, and `getAvailableActions`, but
  `server/src/ai/tools/index.ts` does not register executors for them.
  `cashflow_summary` is routed to `getCashflowSummary`, so that intent currently
  reaches the "tool not available yet" path.
- Server `ClarificationRequest` can include resume fields such as
  `resumeIntent` and `resumeDraft`. The client type and OpenAPI schema only
  document `reason`, `message`, `expectedReplyType`, and `options`.
- The server confirmation card includes required nested `recipient`,
  `amountDetails`, `warnings`, `confirmAction`, and `denyAction`. The client
  type marks several of those fields optional for compatibility.
- The `AiPendingTransfer` schema has an `expired` status, but current code
  rejects expired confirmations by `expiresAt` and TTL behavior; it does not
  actively transition records to `status: "expired"` in the confirmation path.

## Graph Topology

`server/src/ai/graph.ts` is the source of truth.

### Top-Level Graph

```text
START
  -> ensureDbConnection
  -> loadAuthenticatedContext
  -> getAuthRoute
      unauthenticated -> responseSubgraph
      authenticated   -> loadConversationContext
  -> getResumeRoute
      clarification_reply -> clarificationResumeSubgraph -> requestParsingSubgraph
      normal_turn         -> requestParsingSubgraph
  -> getIntentRoute
      read_only        -> readOnlyAnswerSubgraph
      prepare_transfer -> transferPreparationSubgraph
      modify_pending   -> pendingModificationSubgraph
      pending_status   -> pendingStatusSubgraph
      unsafe_or_help   -> responseSubgraph
      unsupported      -> responseSubgraph
  -> responseSubgraph
  -> saveConversation
  -> END
```

The route helpers live in `server/src/ai/graphRoutes.ts`:

- `getAuthRoute()`: `authenticated` or `unauthenticated`.
- `getResumeRoute()`: `clarification_reply` when conversation memory has a
  clarification, otherwise `normal_turn`.
- `getIntentRoute()`: read-only, transfer preparation, pending modification,
  pending status, unsafe/help, or unsupported.
- `getParseRoute()`: transfer-related messages continue to transfer-draft
  extraction; non-transfer messages end request parsing.

### Compiled Subgraphs

- `buildRequestParsingSubgraph()`:
  `normalizeUserMessage -> classifyIntent -> extractRequestSlots ->
  getParseRoute -> extractTransferDraft when transfer_related`.
- `buildClarificationSubgraph()`:
  `resolveClarificationReply`.
- `buildReadOnlyAnswerSubgraph()`:
  `resolveCounterpartyReference -> routeReadOnlyTools`.
- `buildTransferPreparationSubgraph()`:
  `resolveCounterpartyReference -> resolveContextualAmounts ->
  prepareTransferConfirmation`.
- `buildPendingModificationSubgraph()`:
  `resolveCounterpartyReference -> resolveContextualAmounts ->
  routeReadOnlyTools -> modifyPendingTransferConfirmation`.
- `buildPendingStatusSubgraph()`:
  `routeReadOnlyTools`.
- `buildResponseSubgraph()`:
  `composeResponse`.

### Internal No-Op Guards

The graph now has conditional routing, but node-level guards still exist:

- `loadAuthenticatedContext()` only sets refusal state when `userId` is absent.
- `classifyIntent()` exits if refusal or intent already exists.
- `extractTransferDraft()` runs only for `transfer_prepare` and
  `transfer_modify_pending`.
- `resolveCounterpartyReference()` exits unless the current intent needs a
  counterparty resolution.
- `resolveContextualAmounts()` runs only for transfer intents with
  `amountReferenceText` and no numeric amount.
- `prepareTransferConfirmation()` runs only for `transfer_prepare` and skips
  when clarification/refusal is already present.
- `modifyPendingTransferConfirmation()` runs only for
  `transfer_modify_pending`.
- `routeReadOnlyTools()` exits with no tools when auth/refusal/clarification
  blocks execution.
- `composeResponse()` bypasses LLM wording for refusals, clarifications,
  `transfer_prepare`, and `transfer_modify_pending`.

## Safety Boundary

### Chat

Chat can:

- answer read-only account questions through allowlisted tools;
- prepare a pending confirmation card;
- replace an active pending confirmation with a new pending card;
- report pending confirmation status/details.

Chat cannot:

- execute money movement;
- confirm a pending transfer;
- deny a pending transfer;
- bypass card review;
- let the LLM choose arbitrary tools.

Text such as `yes`, `confirm it`, or `deny it` routes to
`pending_confirmation_status` / `transfer_cancel_pending` behavior and produces
safe guidance. It does not call `respondToAiPendingTransfer()`.

### Confirmation Endpoint

`POST /api/ai/confirmations/:id` is the only AI path that can confirm or deny a
prepared transfer.

`respondToAiPendingTransfer()` validates:

- authenticated `userId`;
- pending transfer id;
- current `version`;
- `status: "pending"`;
- `expiresAt > now`;
- superseded status before action;
- idempotency key reuse when provided.

For `action: "confirm"`, it executes inside a Mongo transaction through
`executeTransferWithSession()`, which validates:

- sender exists;
- recipient exists by normalized email;
- recipient is not sender;
- sender balance is sufficient.

For `action: "deny"`, it marks the pending record denied and executes no
transfer.

### Transfer Preparation

`prepareAiPendingTransfer()` validates:

- recipient email from explicit draft, resolved counterparty, or a unique
  provided personal-details name match;
- positive numeric amount;
- sender exists;
- recipient exists as a Virly user;
- sender is not recipient;
- sender balance is sufficient.

When valid, it creates an `AiPendingTransfer` with `status: "pending"` and a
10-minute expiry. It returns a card payload; it does not create transactions or
move money.

### Pending Modification

`modifyAiPendingTransfer()` validates:

- active pending confirmation id from conversation memory;
- old pending transfer scoped by `userId`, `conversationId`, status `pending`,
  and unexpired `expiresAt`;
- replacement draft through the same transfer-draft validation path.

If valid, a Mongo transaction creates a new pending transfer and marks the old
one `superseded` with `supersededById`. If validation fails, no replacement is
created and the old pending transfer remains pending.

## Intent And Tool Behavior

The implemented intents are defined in `assistantIntentValues` in
`server/src/ai/state.ts`. Deterministic and optional LLM classification both
return one of those intents.

`intentToReadOnlyTools` in `server/src/ai/router.ts` is the fixed tool map:

| Intent | Tools |
| --- | --- |
| `balance_inquiry`, `account_summary` | `getUserAccounts`, `getAccountBalance` |
| `recent_transactions` | `getRecentTransactions` |
| `transaction_search` | `searchTransactions` |
| `transaction_summary`, `transaction_count`, `transaction_stats` | `getTransactionStats` |
| `transaction_detail` | `resolveTransactionReference`, `getTransactionReceipt` |
| `cashflow_summary` | `getCashflowSummary` |
| `counterparty_lookup` | `resolveCounterpartyCandidates` |
| `recent_sent_counterparties` | `getRecentSentCounterparties` |
| `recent_received_counterparties` | `getRecentReceivedCounterparties` |
| `counterparty_summary` | `resolveCounterpartyCandidates`, `getCounterpartySummary` |
| `counterparty_activity_timeline` | `resolveCounterpartyCandidates`, `getCounterpartyActivityTimeline` |
| `last_sent_counterparty` | `getLastSentCounterparty` |
| `counterparty_transactions` | `getTransactionsWithCounterparty` |
| `counterparty_total_sent` | `getTotalSentToCounterparty` |
| `counterparty_total_received` | `resolveCounterpartyCandidates`, `getTotalReceivedFromCounterparty` |
| `counterparty_net_total` | `resolveCounterpartyCandidates`, `getNetWithCounterparty` |
| `verified_recipients` | `getVerifiedRecipients` |
| `recipient_profile` | `resolveCounterpartyCandidates` |
| `transfer_limits` | `getTransferLimits` |
| `transfer_eligibility` | `getTransferEligibility` |
| `transfer_quote` | `resolveCounterpartyCandidates`, `getTransferQuote` |
| `daily_transfer_usage` | `getDailyTransferUsage` |
| `transfer_status` | `getRecentTransactions` |
| `pending_ai_transfers` | `getPendingAiTransfers` |
| `transfer_prepare`, `transfer_modify_pending`, `transfer_cancel_pending`, `pending_confirmation_status`, `general_help`, `unsafe_request`, `unsupported` | no default read-only tools |

Additional dynamic routing:

- `transfer_modify_pending` can add `resolveCounterpartyCandidates` when a new
  recipient reference needs resolution.
- `pending_confirmation_status` can add `resolvePendingTransferReference` when
  recent memory indicates a pending-transfer ordinal/detail follow-up.
- `transfer_quote` skips `resolveCounterpartyCandidates` when the user supplied
  an explicit email.

Resolver tools are read-only:

- `resolveCounterpartyCandidates`
- `resolveTransactionReference`
- `resolvePendingTransferReference`

Unsupported/planned tool behavior:

- `getCashflowSummary`, `getMyProfile`, and `getAvailableActions` are not
  registered executors in the current tool registry.
- MCP tools and LangGraph `ToolNode` are not runtime behavior.

## Memory Behavior

`CounterpartyMemory` in `server/src/ai/state.ts` stores:

- `turn`;
- `lastCounterparty`;
- `mentionedCounterparties`, capped at `MAX_COUNTERPARTIES = 8`;
- `entities`, capped at `MAX_CONTEXT_ENTITIES = 20`;
- `answerFrames`, capped at `MAX_ANSWER_FRAMES = 8`;
- `pendingConfirmation`;
- `clarification`;
- `mode`.

`AiConversation` persists this memory by authenticated `userId` and
`conversationId`, with a 30-day TTL refresh on save.

Memory sources:

- `applyToolMemoryUpdates()` records counterparties, transactions, pending
  transfers, date ranges, and total entities from read-only tool results.
- `saveConversation()` adds answer frames and records pending confirmation
  snapshots after confirmation-card creation.
- `resolveCounterpartyReference()` and resolver tool results call
  `rememberCounterparty()` for resolved counterparties.

Memory supports:

- pronoun and ordinal counterparty references;
- answer-total references such as `that amount` or `that total`;
- latest sent/received transaction amount references with a resolved
  counterparty;
- pending confirmation amount references;
- transaction row follow-ups such as `tell me more about the second one`;
- pending-transfer list follow-ups such as `what about the first one`;
- clarification options and resume metadata.

## Conversation History Representation

In-graph conversation history (`AssistantGraphState.messages`,
`ConversationStore`) is `BaseMessage[]` from `@langchain/core/messages`:
`HumanMessage` for user turns, `AIMessage` for assistant turns. No
`SystemMessage` or `ToolMessage` is persisted — the system policy is a
prompt prefix and tool results live in `toolResults` (the authoritative
record). The `messages` channel uses last-value semantics: the loader
replaces the array and the saver appends one message, so the lifecycle
cannot duplicate a turn.

Structured business state (`detectedIntent`, `transferDraft`,
`confirmation`, `toolResults`, `counterpartyMemory`, …) stays separate and
authoritative; messages are a conversational record only and are never the
source of truth for balances, transfers, or authorization.

Persistence is unchanged on disk. `AiConversation.messages` remains
`{ role, content, createdAt }`; `server/src/ai/messageMapping.ts` converts
at the store boundary (`fromStored` on load, `toStored` on save), so legacy
documents load directly and no backfill/migration is required. LLM prompt
builders receive a `{ role, content }` projection via `toProviderMessages`,
keeping prompts byte-identical to the pre-migration baseline (asserted in
`server/src/ai/messageMigration.test.ts`).

LangGraph Studio input must supply messages in LangChain form, e.g.:

```json
{
  "userId": "507f1f77bcf86cd799439011",
  "conversationId": "studio-1",
  "assistantId": "oshri",
  "messages": [{ "type": "human", "content": "what's my balance?" }]
}
```

## Clarification And Resume

`ClarificationRequest` in `server/src/ai/state.ts` includes:

- `reason`;
- `message`;
- `expectedReplyType`;
- optional `resumeIntent`;
- optional `resumeOperation`;
- optional `resumeDraft`;
- optional `options`;
- optional `safeResumeStateVersion`;
- optional `createdAt`;
- optional `expiresAt`.

Current code usually returns and persists:

- `reason`;
- `message`;
- `expectedReplyType`;
- `options` when candidates exist;
- `resumeIntent` and `resumeDraft` for amount-scope clarification.

Implemented resume behavior:

- `resolveClarificationReplyNode()` explicitly handles only
  `expectedReplyType: "amount_scope"` with `resumeIntent: "transfer_prepare"`
  and a saved `resumeDraft`.
- It maps replies like `previous answer total` / Hebrew total phrasing to
  `last_answer_total`, or `last sent` / last-transfer phrasing to
  `last_sent_transaction`.
- It clears saved clarification when that amount-scope reply resolves.

Partially implemented behavior:

- Other clarification types are persisted and exposed, and tools can consume
  clarification options for some resolver flows.
- There is no production native LangGraph `interrupt()` or
  `Command({ resume })` behavior.

## Transfer Behavior

Transfer draft extraction:

- `extractTransferDraft()` uses optional LLM structured output when configured.
- It normalizes LLM output through `normalizeTransferDraftOutput()`.
- It falls back to `extractTransferDraftDeterministic()` when no provider exists
  or the provider fails.
- `applySlotDataToDraft()` merges deterministic request slots into the draft.

Recipient/reference resolution:

- Explicit email wins.
- Resolved conversation counterparty can fill the recipient.
- `prepareAiPendingTransfer()` can resolve a unique provided personal-details
  name from `recipientReference`.
- Ambiguous or missing recipients produce clarification rather than a pending
  confirmation.

Contextual amount resolution:

- `resolveContextualAmount()` handles latest received transaction, latest sent
  transaction, latest answer total, active pending transfer amount, and
  ambiguity between same-amount scopes.
- Only resolved positive ILS amounts are written into the transfer draft.
- Unresolved amounts ask for clarification and create no pending confirmation.

Pending confirmation creation:

- Creates an `AiPendingTransfer` only after backend validation.
- Returns a `TransferConfirmation` with `id`, `version`, recipient fields,
  amount fields, `expiresAt`, and confirm/deny action descriptors.

Pending modification/replacement:

- Uses active pending confirmation memory.
- Copies old values and applies only changed draft fields.
- Creates a replacement pending record and supersedes the old record only after
  replacement validation succeeds.

Stale, expired, superseded, and version behavior:

- `respondToAiPendingTransfer()` rejects non-pending, expired, wrong-version,
  and superseded confirmations.
- Superseded confirmations return a 409 response with
  `error: "confirmation_superseded"` and optional `supersededById`.
- Expired confirmations are unavailable by `expiresAt`; code does not
  proactively write `status: "expired"` before rejection.

## Response Behavior

`composeResponse()`:

- builds a deterministic fallback first;
- uses optional LLM wording only for eligible read-only/status responses;
- does not use LLM wording for refusals, clarifications, `transfer_prepare`, or
  `transfer_modify_pending`;
- sends sanitized tool summaries, safe conversation summary, safe references,
  and required facts to the LLM;
- hydrates masked labels back to backend-known user-visible labels;
- falls back to deterministic wording when response post-checks fail.

Response post-checks reject:

- unsafe claims that money was sent, confirmed, approved, completed, or
  processed from chat;
- masked-label leaks where a full backend-known user label should be shown;
- missing required amount facts;
- contradicting currency, recipient, status, or date facts.

## Evals

The eval CLI is `server/src/ai/evals/cli.ts`, wrapped by
`./scripts/ai-eval-chat.sh`.

Implemented modes:

- `deterministic`: default mode; uses in-memory conversation store, fake
  backend-shaped tools, deterministic amount resolver, and optional eval-only
  shim behavior.
- `llm-dev`: live configured OpenAI provider; blocked unless
  `VIRLY_AI_EVAL_ENABLE_LLM_DEV=true`, `OPENAI_API_KEY`, and
  `VIRLY_AI_MODEL` are available.
- `seeded-mongo`: real Mongo-backed tools and conversation store; blocked
  unless `VIRLY_AI_EVAL_ENABLE_MONGO=true` and `VIRLY_AI_EVAL_MONGO_URI` are
  set.
- `llm-seeded-mongo`: combines live LLM and seeded Mongo guards.

Fixture files:

- `server/src/ai/evals/conversations.transfer-context.json`
- `server/src/ai/evals/conversations.counterparty-history.json`
- `server/src/ai/evals/conversations.hebrew-mixed.json`
- `server/src/ai/evals/conversations.pending-confirmations.json`

Commands:

```bash
./scripts/ai-eval-chat.sh deterministic
VIRLY_AI_EVAL_ENABLE_LLM_DEV=true ./scripts/ai-eval-chat.sh llm-dev
VIRLY_AI_EVAL_ENABLE_MONGO=true VIRLY_AI_EVAL_MONGO_URI='mongodb://...' ./scripts/ai-eval-chat.sh seeded-mongo
VIRLY_AI_EVAL_ENABLE_LLM_DEV=true VIRLY_AI_EVAL_ENABLE_MONGO=true VIRLY_AI_EVAL_MONGO_URI='mongodb://...' ./scripts/ai-eval-chat.sh llm-seeded-mongo
```

## API And Client Contract

### Chat Response

`POST /api/ai/chat` returns:

```ts
{
  message: string;
  conversationId: string;
  assistantId: AssistantId;
  intent: AssistantIntent;
  toolCalls: AssistantToolName[];
  toolResults?: Array<{ toolName: AssistantToolName; status: AiToolStatus }>;
  clarification?: ClarificationRequest;
  confirmation?: TransferConfirmation;
  supersededConfirmationId?: string;
}
```

### Clarification Shape

Public docs and client types document:

```ts
{
  reason: string;
  message: string;
  expectedReplyType: string;
  options?: Array<{ id: string; label: string; value: string }>;
}
```

The server can also include internal resume fields. That is a known
client/OpenAPI documentation mismatch.

### Confirmation Card Shape

The server confirmation card includes:

- `id`;
- `version`;
- `type: "transfer"`;
- `status: "pending"`;
- recipient email/name fields;
- nested `recipient`;
- nested `amountDetails`;
- `reason`;
- `warnings`;
- `expiresAt`;
- optional `supersedesId`;
- `confirmAction`;
- `denyAction`.

The card is review state only. It is not money movement.

### Streaming

`POST /api/ai/chat/stream` is implemented with server-sent events.

Status phases:

- `accepted`;
- `understanding_request`;
- `resolving_context`;
- `checking_account_facts`;
- `preparing_confirmation`;
- `composing_response`;
- `completed`.

The final `result` event wraps the same response shape as `/api/ai/chat`.
Status events must not contain account facts or transfer execution claims.
