# AI Assistant Improvement Plan V2

This document tracks remaining improvement work for the Virly AI assistant. It
is not the source of truth for current behavior. For current implemented
topology and contracts, see
[`docs/ai-current-implementation.md`](ai-current-implementation.md).

The product boundary remains:

```text
LLM = language parsing, reference interpretation, optional wording
Backend = auth, account facts, tool authorization, recipient validation,
          transfer validation, pending confirmation lifecycle, execution
```

Chat text must never execute money movement. Transfers require a confirmation
card and the confirmation endpoint.

## Current Implementation Status

### Implemented

- Top-level `StateGraph` conditional routing in `server/src/ai/graph.ts`.
- Compiled subgraphs mounted as nodes:
  - `requestParsingSubgraph`
  - `clarificationResumeSubgraph`
  - `readOnlyAnswerSubgraph`
  - `transferPreparationSubgraph`
  - `pendingModificationSubgraph`
  - `pendingStatusSubgraph`
  - `responseSubgraph`
- Route helpers in `server/src/ai/graphRoutes.ts`:
  `getAuthRoute`, `getResumeRoute`, `getIntentRoute`, and `getParseRoute`.
- Deterministic request normalization, intent classification fallback, request
  slot extraction, and internal `AiUserRequest` creation.
- Transfer draft extraction through optional structured LLM output plus
  deterministic fallback.
- Contextual amount resolution for latest sent/received transaction amounts,
  answer totals, active pending confirmation amounts, and ambiguous same-amount
  clarification.
- Read-only tool routing through a fixed intent-to-tool map. The LLM does not
  choose tools.
- Pending transfer preparation and replacement through backend services.
- Response post-checks for unsafe money-movement claims, masked-label leaks,
  and required fact contradictions.
- Mongo conversation persistence for messages, memory, clarification state,
  answer frames, entities, and pending confirmation snapshots.
- `/api/ai/chat/stream` progress phases with a final result event.
- Deterministic eval fixtures and guarded `llm-dev`, `seeded-mongo`, and
  `llm-seeded-mongo` modes.

### Partially Implemented

- Clarification/resume:
  structured `ClarificationRequest` state is persisted and amount-scope replies
  can resume a transfer draft. Other clarification types are still handled by
  normal follow-up routing and resolver tools, not a full resume framework.
- Unified request/reference model:
  `AiUserRequest` exists and is passed to tools, but older resolver logic still
  uses `requestSlots`, normalized message text, memory, and tool metadata.
- Transfer preflight limits:
  read-only limit/eligibility/quote/daily-usage tools exist, but transfer
  preparation and final confirmation do not enforce the configured per-transfer
  or daily limits.
- Tool contracts:
  some tool names exist in shared type/OpenAPI/client contracts before server
  executors exist.

### Planned

- Broader clarification resume support for recipient, transaction,
  pending-transfer, date-range, and option-selection replies.
- Native LangGraph interrupt spike using `interrupt()` and
  `Command({ resume })` in isolated tests before any production adoption.
- Checkpointing decision: keep Mongo conversation memory as the durable source
  unless a LangGraph-compatible checkpointer provides a concrete benefit.
- Optional production resume bridge if native interrupts are proven safe with
  the HTTP request/response contract.
- Tighten contract parity for server, client, and OpenAPI once resume fields or
  contract-only tool names are productized.
- Decide whether transfer limits should become enforced in
  `prepareAiPendingTransfer()` and `respondToAiPendingTransfer()`.

### Deprecated / Inaccurate

- The old statement that the current graph is a single linear chain is no
  longer true.
- The old statement that the graph does not use `addConditionalEdges` or
  compiled subgraphs is no longer true.
- "Interrupt subgraph" and "native interrupt" language should not be described
  as production behavior. Current clarification is persisted state plus normal
  graph invocation.
- MCP and LangGraph `ToolNode` behavior are not wired into this assistant.
- Planned arbitrary tool-calling behavior is not implemented and should not be
  introduced without a new safety design.

### Known Mismatch

- Limit tools are informational today. They compute configured limits and daily
  usage, but pending confirmation creation and confirmation execution do not
  enforce those limits.
- `getCashflowSummary`, `getMyProfile`, and `getAvailableActions` appear in
  contracts but are not registered tool executors.
- Server clarification state can include resume fields that are not represented
  in the current client/OpenAPI clarification schema.
- The client confirmation-card type is looser than the server/OpenAPI card
  response.

## Current Graph Snapshot

The current top-level graph:

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

Subgraph internals:

```text
requestParsingSubgraph:
  normalizeUserMessage
  -> classifyIntent
  -> extractRequestSlots
  -> getParseRoute
      transfer_related -> extractTransferDraft -> END
      non_transfer     -> END

clarificationResumeSubgraph:
  resolveClarificationReply -> END

readOnlyAnswerSubgraph:
  resolveCounterpartyReference -> routeReadOnlyTools -> END

transferPreparationSubgraph:
  resolveCounterpartyReference
  -> resolveContextualAmounts
  -> prepareTransferConfirmation
  -> END

pendingModificationSubgraph:
  resolveCounterpartyReference
  -> resolveContextualAmounts
  -> routeReadOnlyTools
  -> modifyPendingTransferConfirmation
  -> END

pendingStatusSubgraph:
  routeReadOnlyTools -> END

responseSubgraph:
  composeResponse -> END
```

Internal node no-op guards still exist and should remain until tests prove they
are unnecessary. The topology is now the primary routing boundary, but node
guards still protect custom graph invocations and preserve compatibility.

## Safety Rules

1. Never execute a transfer from chat text.
2. Never let the LLM select arbitrary tools.
3. Never trust LLM-extracted recipient, amount, or currency without backend
   validation.
4. Always scope tool and transfer queries by authenticated `userId`.
5. Keep full emails out of LLM-facing assistant-generated context.
6. Require the explicit confirmation endpoint for confirm/deny.
7. Reject stale, expired, wrong-version, denied, confirmed, or superseded cards.
8. Preserve audit history for pending-transfer replacement.
9. Read-only tools must not mutate balances, transactions, or transfer state.
10. Clarification/resume state must not authorize money movement.

## Remaining Work Plan

### Phase 1: Documentation And Contract Alignment

Status: implemented by this documentation reset.

Keep these files aligned with current code:

- `docs/ai-current-implementation.md`
- `docs/ai-assistant.md`
- `docs/ai-improvement-v2.md`
- `docs/ai-tool-plan-steps-v2.md`
- `client/src/lib/types.ts`
- `openapi.yaml`

Success criteria:

- implemented behavior is not described as planned;
- planned behavior is not described as implemented;
- known mismatches are explicit.

### Phase 2: Clarification Resume Coverage

Status: planned.

Extend structured resume behavior beyond `amount_scope`.

Candidate reply types:

- `recipient`
- `transaction`
- `pending_transfer`
- `date_range`
- `option_selection`
- `free_text`

Rules:

- resume state stays bounded and structured;
- resumed transfer flows re-run backend validation;
- malformed or stale replies fail closed or ask again;
- public `/api/ai/chat` response shape remains compatible unless an API change
  is explicitly approved.

### Phase 3: Native LangGraph Interrupt Spike

Status: planned.

Build isolated tests only. Do not change production chat routing yet.

Prove:

- `interrupt()` payload shape;
- `Command({ resume })` behavior;
- compiled subgraph interrupt propagation;
- stream behavior around interrupted runs;
- whether `MemorySaver` is useful only for tests or a stepping stone to a real
  checkpointer.

### Phase 4: Production Resume Decision

Status: planned.

Decide whether to keep Mongo-only resume state or bridge to native LangGraph
interrupts.

Decision criteria:

- no hidden prompt state authorizes transfer behavior;
- Mongo remains durable source of conversation state unless replaced by a proven
  checkpointer;
- every resume still passes tool authorization and transfer validation;
- public API and streaming behavior are explicit.

### Phase 5: Limit Enforcement Decision

Status: planned.

Current limit tools are informational. If limits should be enforced for actual
AI-prepared transfers, wire the same limit logic into:

- `prepareAiPendingTransfer()`;
- `modifyAiPendingTransfer()`;
- `respondToAiPendingTransfer()` or the shared `executeTransferWithSession()`
  path.

Tests should cover:

- over per-transfer limit;
- over remaining daily limit;
- near-limit pending replacement;
- stale quote versus current confirmation-time state.

### Phase 6: Contract-Only Tool Cleanup

Status: planned.

Either implement or remove/mark unavailable:

- `getCashflowSummary`
- `getMyProfile`
- `getAvailableActions`

Contract updates may require:

- `server/src/ai/state.ts`
- `server/src/ai/router.ts`
- `server/src/ai/tools/index.ts`
- `client/src/lib/types.ts`
- `openapi.yaml`
- eval fixtures and tests

### Phase 7: Client/OpenAPI Clarification Parity

Status: planned.

Decide whether `resumeIntent`, `resumeDraft`, `resumeOperation`,
`safeResumeStateVersion`, `createdAt`, and `expiresAt` are public API fields or
server-only implementation detail.

If public:

- update `client/src/lib/types.ts`;
- update `openapi.yaml`;
- add client/OpenAPI verification.

If server-only:

- filter them out in `toChatResponse()`;
- keep only public clarification fields in the API response.

### Phase 8: Streaming And Eval Alignment

Status: partially implemented.

Streaming phases are implemented. Continue aligning evals with any future
resume or contract changes.

Keep these commands current:

```bash
npm run build --workspace server
env VIRLY_EMAIL_FROM='Virly <verify@example.com>' npm run test --workspace server
./scripts/ai-eval-chat.sh deterministic
git diff --check
```

When client or OpenAPI changes are included:

```bash
npm run build --workspace client
ruby -e 'require "yaml"; YAML.load_file("openapi.yaml")'
```

Guarded evals:

```bash
VIRLY_AI_EVAL_ENABLE_LLM_DEV=true ./scripts/ai-eval-chat.sh llm-dev
VIRLY_AI_EVAL_ENABLE_MONGO=true VIRLY_AI_EVAL_MONGO_URI='mongodb://...' ./scripts/ai-eval-chat.sh seeded-mongo
VIRLY_AI_EVAL_ENABLE_LLM_DEV=true VIRLY_AI_EVAL_ENABLE_MONGO=true VIRLY_AI_EVAL_MONGO_URI='mongodb://...' ./scripts/ai-eval-chat.sh llm-seeded-mongo
```

## Success Criteria

The next architecture/documentation phase is complete when:

- current graph topology is documented as conditional routed subgraphs;
- native interrupts are either proven and explicitly adopted, or still marked
  planned/spike-only;
- limit enforcement is either implemented or kept as a known mismatch;
- server, client, and OpenAPI contracts agree or mismatches are documented;
- deterministic evals pass;
- chat text still never executes money movement;
- every real transfer still goes through backend validation and the explicit
  confirmation endpoint.
