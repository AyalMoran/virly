# AI Assistant

The Virly AI assistant is an authenticated account helper built on LangGraph.js.
It can answer account questions, remember bounded conversation context, prepare
pending transfer confirmations, and replace pending confirmation cards. It
cannot execute money movement from chat text.

For the complete current implementation details, see
[`docs/ai-current-implementation.md`](ai-current-implementation.md). That file
is the source of truth for graph topology, safety boundaries, memory behavior,
transfer behavior, eval modes, and API/client mismatches.

## Current Status

### Implemented

- Authenticated `POST /api/ai/chat` and `POST /api/ai/chat/stream` routes.
- Authenticated `POST /api/ai/confirmations/:id` route for confirm/deny.
- Top-level LangGraph conditional routing with compiled subgraph nodes.
- Fixed intent-to-tool mapping in `server/src/ai/router.ts`.
- Read-only account tools in `server/src/ai/tools/`.
- Optional LLM classification, transfer-draft extraction, counterparty
  reference parsing, and response wording through `server/src/ai/llm.ts`.
- Deterministic fallback behavior when no LLM provider is configured or an LLM
  call fails.
- Mongo-backed conversation memory through `AiConversation`.
- Short-lived pending transfer cards through `AiPendingTransfer`.
- Deterministic AI evals and guarded live-LLM / seeded-Mongo eval modes.

### Partially Implemented

- Clarification/resume is structured and persisted, but not native LangGraph
  interrupt behavior.
- `AiUserRequest` exists as internal compatibility state, but not every path
  consumes it yet.
- Transfer limit and eligibility tools are read-only preflight information; the
  money-moving confirmation path does not enforce those configured limits yet.

### Planned

- Production native LangGraph interrupt/checkpoint integration, if it proves
  useful beyond Mongo conversation memory.
- Broader clarification resume coverage.
- Executors for contract-only tool names if those tools become product
  features.

### Deprecated / Inaccurate

- Treating the graph as a single linear chain is outdated.
- Native LangGraph interrupts, MCP, `ToolNode`, and arbitrary LLM-selected
  tools are not runtime behavior.
- Chat confirmation text cannot confirm, deny, or execute a transfer.

### Known Mismatch

- `getCashflowSummary`, `getMyProfile`, and `getAvailableActions` appear in
  shared contracts but are not registered tool executors.
- `ClarificationRequest` server state can include resume fields that are not
  documented in `openapi.yaml` or `client/src/lib/types.ts`.
- Client confirmation-card types are looser than the server/OpenAPI card shape.
- The pending-transfer schema includes `expired`, but current confirmation code
  rejects by `expiresAt` instead of actively writing `status: "expired"`.

## Code Map

- `server/src/routes/ai.routes.ts`: chat, stream, and confirmation endpoints.
- `server/src/ai/graph.ts`: LangGraph topology, nodes, subgraphs, response
  checks, and persistence handoff.
- `server/src/ai/graphRoutes.ts`: top-level route helpers.
- `server/src/ai/state.ts`: intents, tool names, graph state, clarification,
  confirmation, memory, and API result types.
- `server/src/ai/router.ts`: deterministic safety precheck, fallback
  classification, and fixed intent-to-tool map.
- `server/src/ai/messageNormalization.ts`: normalized message metadata,
  request slots, and `AiUserRequest`.
- `server/src/ai/amountResolution.ts`: contextual transfer amount resolution.
- `server/src/ai/counterpartyMemory.ts`: bounded counterparty/entity/answer
  memory and deterministic reference fallback.
- `server/src/ai/toolMemory.ts`: memory updates from tool results.
- `server/src/ai/toolResults.ts`: safe tool summaries, display metadata, and
  resolution result helpers.
- `server/src/ai/llm.ts`: optional OpenAI provider with structured output.
- `server/src/ai/tools/`: read-only tool executors.
- `server/src/services/aiConversation.service.ts`: Mongo conversation store.
- `server/src/services/aiPendingTransfer.service.ts`: pending transfer
  creation, replacement, confirm, and deny.
- `server/src/services/transfer.service.ts`: final transaction execution used
  by the confirmation endpoint.
- `server/src/ai/evals/`: deterministic, live-LLM, and seeded-Mongo evals.
- `client/src/lib/types.ts`: client-side AI response/card typings.
- `openapi.yaml`: public API contract.

## Graph Summary

The current graph is not a broad linear chain. `buildAssistantGraph()` mounts
compiled subgraphs and routes between them with conditional edges:

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

Compiled subgraphs:

- `requestParsingSubgraph`: normalize, classify, extract slots, and extract a
  transfer draft only for transfer-related intents.
- `clarificationResumeSubgraph`: currently resolves amount-scope clarification
  replies.
- `readOnlyAnswerSubgraph`: resolves counterparty context and executes fixed
  read-only tools.
- `transferPreparationSubgraph`: resolves recipient/amount context and creates
  a pending confirmation card when backend validation passes.
- `pendingModificationSubgraph`: resolves replacement context, may run resolver
  tools, and creates a replacement pending card only after validation.
- `pendingStatusSubgraph`: handles read-only pending confirmation status/detail
  requests.
- `responseSubgraph`: composes deterministic or checked LLM wording.

Node-level no-op guards still exist inside the subgraphs. They are safety and
compatibility guards, not authorization shortcuts.

## Safety Rules

- Chat can prepare a pending confirmation card or replace a pending card.
- Chat cannot confirm, deny, or execute a transfer.
- Money movement requires `POST /api/ai/confirmations/:id` with
  `action: "confirm"` and the current card `version`.
- Denial requires the same endpoint with `action: "deny"`.
- Confirmation ids are scoped to the authenticated user and must be pending,
  unexpired, non-superseded, and version-matched.
- Backend services validate recipient existence, positive amount, self-transfer,
  current balance, status, version, expiry, supersession, idempotency, user
  scope, and conversation scope where applicable.
- Configured transfer limits are currently exposed through read-only preflight
  tools, not enforced by pending-confirmation creation or final confirmation.
- The LLM never selects tools and never authorizes money movement.
- Read-only tools do not mutate account, transaction, balance, or transfer
  state.

## Intent And Tools

Supported intents are listed in `assistantIntentValues` in
`server/src/ai/state.ts`. Tool selection is fixed by `intentToReadOnlyTools` in
`server/src/ai/router.ts`.

Read-only tool categories:

- account and balance: `getUserAccounts`, `getAccountBalance`;
- transaction listing/search/detail/stats:
  `getRecentTransactions`, `searchTransactions`, `getTransactionStats`,
  `resolveTransactionReference`, `getTransactionReceipt`;
- counterparty history:
  `resolveCounterpartyCandidates`, `getLastSentCounterparty`,
  `getRecentSentCounterparties`, `getRecentReceivedCounterparties`,
  `getTransactionsWithCounterparty`, `getTotalSentToCounterparty`,
  `getTotalReceivedFromCounterparty`, `getNetWithCounterparty`,
  `getCounterpartySummary`, `getCounterpartyActivityTimeline`;
- recipients: `getVerifiedRecipients`;
- transfer preflight/status:
  `getTransferLimits`, `getTransferEligibility`, `getTransferQuote`,
  `getDailyTransferUsage`, `getPendingAiTransfers`,
  `resolvePendingTransferReference`.

Resolver tools are read-only. They resolve counterparty, transaction, or pending
transfer references; they do not mutate state beyond bounded conversation
memory updates.

## Memory

The assistant persists conversation context in Mongo by `userId` and
`conversationId`.

Persisted memory includes:

- recent chat messages, capped at 20;
- remembered counterparties, capped at 8;
- structured entities, capped at 20;
- answer frames, capped at 8;
- transaction rows and pending-transfer rows from tool memory updates;
- total amount entities for answer-total references;
- active pending confirmation snapshots;
- current clarification state;
- conversation mode.

This memory supports follow-ups such as pronouns, ordinal references, `that
amount`, latest sent/received transaction amounts, transaction-detail rows, and
pending-confirmation list rows.

## Clarification

Clarification is an explicit response field and persisted memory object. Current
public fields are:

```ts
{
  reason: string;
  message: string;
  expectedReplyType: string;
  options?: Array<{ id: string; label: string; value: string }>;
}
```

The server can also persist resume fields such as `resumeIntent` and
`resumeDraft`. Amount-scope clarification replies are currently resolved by
`resolveClarificationReplyNode()`. Native LangGraph interrupts are not used in
production.

## Transfer Lifecycle

1. User asks for a transfer.
2. The graph classifies `transfer_prepare`.
3. The graph extracts an untrusted draft.
4. Recipient and contextual amount references are resolved when possible.
5. `prepareAiPendingTransfer()` validates the draft and creates an
   `AiPendingTransfer` only when safe.
6. The chat response returns a confirmation card.
7. The user must click Confirm or Deny.
8. The client calls `POST /api/ai/confirmations/:id`.
9. Confirm executes the transfer in a Mongo transaction; deny marks the pending
   record denied.

Pending modifications copy the old pending transfer, apply requested changes,
revalidate the full replacement draft, create a new pending card, and mark the
old card superseded in one database transaction.

## Response Behavior

`composeResponse()` always builds deterministic fallback text first. Optional
LLM wording is allowed only for eligible non-transfer wording and is checked
afterward.

Post-checks reject:

- unsafe claims that money was sent or confirmed from chat;
- masked-label leaks;
- missing required amount facts;
- contradicting currency, recipient, status, or date facts.

When a post-check fails, the graph returns deterministic fallback wording.

## API Summary

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

`POST /api/ai/chat/stream` returns server-sent events:

- `status` events with phases:
  `accepted`, `understanding_request`, `resolving_context`,
  `checking_account_facts`, `preparing_confirmation`, `composing_response`,
  `completed`;
- a final `result` event with the same response shape as `/api/ai/chat`;
- an `error` event if the stream fails after headers are sent.

`POST /api/ai/confirmations/:id` accepts:

```json
{
  "action": "confirm",
  "version": 1,
  "idempotencyKey": "optional-client-key"
}
```

or:

```json
{
  "action": "deny",
  "version": 1,
  "idempotencyKey": "optional-client-key"
}
```

The idempotency key can also be supplied as an `Idempotency-Key` header.

## Evals And Verification

Deterministic eval:

```bash
./scripts/ai-eval-chat.sh deterministic
```

Guarded eval modes:

```bash
VIRLY_AI_EVAL_ENABLE_LLM_DEV=true ./scripts/ai-eval-chat.sh llm-dev
VIRLY_AI_EVAL_ENABLE_MONGO=true VIRLY_AI_EVAL_MONGO_URI='mongodb://...' ./scripts/ai-eval-chat.sh seeded-mongo
VIRLY_AI_EVAL_ENABLE_LLM_DEV=true VIRLY_AI_EVAL_ENABLE_MONGO=true VIRLY_AI_EVAL_MONGO_URI='mongodb://...' ./scripts/ai-eval-chat.sh llm-seeded-mongo
```

Standard local checks:

```bash
npm run build --workspace server
env VIRLY_EMAIL_FROM='Virly <verify@virly.ayal.online>' npm run test --workspace server
./scripts/ai-eval-chat.sh deterministic
git diff --check
```

When client or OpenAPI files change, also run:

```bash
npm run build --workspace client
ruby -e 'require "yaml"; YAML.load_file("openapi.yaml")'
```
