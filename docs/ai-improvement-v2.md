# AI Assistant Graph Architecture Plan V2

This plan upgrades the Virly AI assistant from a mostly linear
intent-and-tool workflow into a LangGraph architecture with explicit subgraphs,
conditional edges, and interrupt/resume semantics.

The product boundary does not change:

```text
LLM = language parsing, reference interpretation, response wording
Backend = auth, account facts, recipient validation, transfer validation, confirmation lifecycle, execution
```

Chat text must never execute money movement. Transfers still require an
explicit confirmation card and the confirmation endpoint.

## Current Implementation Snapshot

As of this plan rewrite, `server/src/ai/graph.ts` uses `StateGraph` from
`@langchain/langgraph` `1.3.2` with one top-level state annotation and a linear
edge chain:

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

The installed LangGraph package exports `StateGraph`, `Command`,
`interrupt`, `MemorySaver`, and related interruption helpers. The current graph
does not yet use `addConditionalEdges`, compiled subgraphs, `Command`, or
native `interrupt()`.

Implemented assistant capabilities already include:

- sanitized diagnostic tracing for fallback and clarification decisions
- tolerant transfer-draft normalization
- deterministic Hebrew/English recipient, amount-reference, and direction
  capture
- internal `AiUserRequest` compatibility state
- contextual amount resolution before transfer preparation
- received-total and net-total read-only counterparty tools
- bounded conversation memory for counterparties, totals, pending
  confirmations, and clarification resume state
- safer response composition with deterministic required facts and
  contradiction checks
- streaming-safe progress phases
- deterministic eval fixtures plus guarded `llm-dev` and `seeded-mongo` modes
- developer docs and contract parity checks

The remaining architectural gap is that all nodes still run in one broad
sequence. Most nodes internally no-op when they are not relevant. The next
architecture should move those decisions into graph routing.

## Problems This Plan Solves

The assistant still needs a clearer graph shape for:

- avoiding irrelevant node execution through conditional edges
- isolating read-only, transfer-preparation, pending-modification, response,
  and clarification workflows into reviewable subgraphs
- representing clarification as an interrupt/resume boundary instead of a
  generic message flag
- making future tool authorization, transfer safety, and eval coverage easier
  to reason about from graph topology
- keeping Mongo conversation persistence as the source of truth while
  evaluating LangGraph checkpointing and native interrupts safely

## Non-Negotiable Safety Rules

```text
1. Never execute a transfer from chat text.
2. Never let the LLM select arbitrary tools.
3. Never trust LLM-extracted recipient, amount, or currency without backend validation.
4. Always scope tool and transfer queries by authenticated userId.
5. Always keep full emails out of LLM-facing assistant-generated context.
6. Always require an explicit confirmation card button for money movement.
7. Always reject stale, expired, denied, confirmed, or superseded confirmation cards.
8. Always preserve audit history for pending-transfer replacement.
9. Read-only subgraphs must not mutate balances, transfers, or account records.
10. Interrupt/resume state must not authorize actions by itself.
```

## Target Graph Topology

The target graph should have a small top-level router and composable subgraphs.
The top-level graph decides which subgraph may run. Subgraphs enforce their own
local safety gates.

```text
START
  -> loadAuthenticatedContext
  -> authGate
      unauthenticated -> responseSubgraph -> auditAndSave -> END
      authenticated   -> loadConversationContext
  -> resumeGate
      pending_clarification_reply -> clarificationSubgraph
      normal_turn                  -> requestParsingSubgraph
  -> intentGate
      unsafe_or_help       -> responseSubgraph
      read_only            -> readOnlyAnswerSubgraph
      prepare_transfer     -> transferPreparationSubgraph
      modify_pending       -> pendingModificationSubgraph
      pending_status       -> pendingStatusSubgraph
      unsupported          -> responseSubgraph
  -> responseSubgraph
  -> auditAndSave
  -> END
```

The top-level graph should use conditional edges for `authGate`,
`resumeGate`, and `intentGate`. Node functions should stop encoding broad
routing policy through repeated early returns when a graph edge can express the
same decision.

## Subgraph Contracts

### Auth And Persistence Subgraph

Purpose:

- load authenticated identity
- fail closed without `userId`
- load and normalize persisted conversation memory
- save bounded memory and audit-safe diagnostics after the turn

Inputs:

- request input
- optional persisted conversation

Outputs:

- `userId`
- normalized `counterpartyMemory`
- `currentTurn`
- refusal state when unauthenticated

Safety rules:

- chat text never supplies identity
- `conversationId` is storage context, not authorization
- audit diagnostics stay metadata-only

### Request Parsing Subgraph

Purpose:

- normalize the message
- classify intent
- extract deterministic request slots
- build `AiUserRequest`
- extract transfer drafts only for transfer-related operations

Expected internal routing:

```text
normalizeUserMessage
  -> classifyIntent
  -> extractRequestSlots
  -> buildUserRequest
  -> parseGate
      transfer operation -> extractTransferDraft
      non-transfer       -> END
```

Safety rules:

- LLM output is parse input only
- parsed recipient, amount, and currency remain untrusted hints
- assistant messages sent back into the LLM are sanitized and masked

### Conversation Reference Subgraph

Purpose:

- resolve counterparty, transaction, pending-transfer, date, and amount
  references in one deterministic contract
- avoid duplicated resolver logic across transfer and read-only paths
- create structured clarification interrupts when references are ambiguous

Resolution order:

1. current clarification options
2. current pending confirmation
3. explicit email in user message
4. user-visible labels from memory
5. masked labels from memory
6. display names and aliases
7. local-part aliases
8. last counterparty or pronoun
9. answer-frame entities
10. backend read-only resolver tools

Output:

```ts
type ResolvedConversationReferences = {
  counterparty?: CounterpartyRef;
  amount?: ResolvedAmountRef;
  transactionId?: string;
  pendingTransferId?: string;
  dateRange?: ResolvedDateRange;
  clarification?: AiGraphInterrupt;
};
```

Safety rules:

- do not silently choose among similar candidates
- every resolved value records source, confidence, reason, and candidate count
- backend resolver tools must remain read-only and user-scoped

### Read-Only Answer Subgraph

Purpose:

- map read-only intents to allowlisted tools
- build tool input from `AiUserRequest` and resolved references
- execute read-only tools
- apply bounded memory updates

Expected internal routing:

```text
resolveConversationReferences
  -> referenceGate
      unresolved_or_ambiguous -> interruptSubgraph
      resolved_or_not_needed  -> selectReadOnlyTools
  -> toolGate
      no_tools        -> END
      tools_available -> executeReadOnlyTools
  -> applyToolMemoryUpdates
```

Safety rules:

- fixed intent-to-tool map only
- every tool is checked by `isReadOnlyToolName`
- tools scope all database reads by authenticated `userId`
- no read-only tool mutates account, transaction, or transfer state

### Transfer Preparation Subgraph

Purpose:

- parse a transfer draft
- resolve recipient references
- resolve contextual amount references
- validate currency, amount, recipient, balance, limits, and sender scope
- create only a pending confirmation card

Expected internal routing:

```text
extractTransferDraft
  -> resolveRecipient
  -> recipientGate
      missing_or_ambiguous -> interruptSubgraph
      resolved             -> resolveContextualAmount
  -> amountGate
      missing_or_ambiguous -> interruptSubgraph
      resolved             -> validateTransferDraft
  -> validationGate
      invalid       -> interruptOrRefusal
      valid         -> createPendingConfirmation
```

Safety rules:

- pending confirmation creation is not transfer execution
- `prepareAiPendingTransfer` remains the backend validation boundary
- unsupported currencies clarify before preparation
- contextual amounts are resolved only from authenticated backend facts and
  bounded memory
- insufficient balance and transfer limits still block after contextual
  resolution

### Pending Modification Subgraph

Purpose:

- modify an active pending transfer by creating a replacement confirmation
- preserve the old pending transfer unless replacement validation succeeds

Expected internal routing:

```text
loadActivePendingConfirmation
  -> extractModificationDraft
  -> resolveModifiedRecipient
  -> resolveModifiedAmount
  -> validateReplacement
  -> createReplacementAndSupersedeOld
```

Safety rules:

- no chat text confirms, denies, or executes a transfer
- replacement must re-run backend validation
- old confirmation remains pending if replacement fails
- supersede operation preserves audit history

### Pending Status Subgraph

Purpose:

- answer status/detail questions about pending confirmations
- resolve ordinal pending-transfer references after a pending list

Safety rules:

- status/detail questions are read-only
- `resolvePendingTransferReference` may run only through the allowlisted
  read-only path
- status responses never confirm, deny, modify, supersede, or execute transfers

### Clarification Interrupt Subgraph

Purpose:

- create structured interruption payloads for missing or ambiguous slots
- persist enough resume state to continue the original safe flow
- consume a later user reply through explicit resume logic

Interrupt reasons:

```text
missing_transfer_recipient
missing_transfer_amount
ambiguous_recipient
ambiguous_amount
ambiguous_transaction
ambiguous_pending_transfer
unsupported_currency
unresolved_reference
```

Expected output:

```ts
type AiGraphInterrupt = {
  reason: ClarificationReason;
  expectedReplyType: ClarificationReplyType;
  message: string;
  resumeIntent: AssistantIntent;
  resumeOperation: AiUserRequest["operation"];
  resumeDraft?: TransferDraft;
  options?: ClarificationOption[];
  safeResumeStateVersion: number;
};
```

Safety rules:

- resume state is bounded and structured
- resume state cannot authorize money movement
- resumed transfer flow still re-enters backend validation
- stale, unrelated, or malformed clarification replies ask again or fail closed

### Response Subgraph

Purpose:

- build deterministic fallback text
- optionally let the LLM reword safe facts
- run response post-checks
- hydrate user-visible labels after LLM wording

Safety rules:

- response wording cannot create account facts
- response wording cannot claim transfer execution
- required facts cannot be contradicted
- masked labels are not shown when a full backend-known user label is allowed

## Conditional Edge Plan

Add conditional edges incrementally. Each edge migration should preserve current
behavior and add focused tests proving irrelevant nodes no longer run.

Recommended edge route values:

```ts
type AuthRoute = "authenticated" | "unauthenticated";
type ResumeRoute = "clarification_reply" | "normal_turn";
type IntentRoute =
  | "unsafe_or_help"
  | "read_only"
  | "prepare_transfer"
  | "modify_pending"
  | "pending_status"
  | "unsupported";
type ReferenceRoute = "resolved" | "needs_interrupt";
type TransferRoute = "continue" | "needs_interrupt" | "invalid" | "ready";
```

Top-level conditional edges should first replace obvious no-op paths:

- unauthenticated requests skip parsing, tools, and transfer nodes
- unsafe requests skip tools and transfer nodes
- read-only requests skip transfer preparation and pending modification
- transfer-preparation requests skip read-only tool routing except resolver
  tools explicitly used inside the transfer subgraph
- pending status requests use the pending-status subgraph only

## Interrupt Migration Plan

Use two stages so the app can keep its current request/response contract while
moving toward LangGraph-native interrupts.

### Stage 1: Interrupt-Compatible State

- Keep returning clarification messages in `/api/ai/chat`.
- Replace ad hoc `clarificationMessage` decisions with `AiGraphInterrupt`
  state.
- Persist interrupt payloads through `AiConversation.memory.clarification`.
- Add conditional edges that route `needs_interrupt` to the clarification
  interrupt subgraph.
- Tests prove:
  - missing recipient interrupts before transfer preparation
  - missing amount interrupts before transfer preparation
  - ambiguous transaction interrupts before receipt lookup
  - ambiguous pending transfer interrupts before pending reference resolution
  - public response shape remains compatible

### Stage 2: Native LangGraph Interrupt Spike

- Add a small isolated test graph using `interrupt()` and `Command`.
- Use `MemorySaver` only in tests until Mongo checkpoint behavior is designed.
- Verify the installed package behavior for:
  - interrupt payload shape
  - resume command shape
  - stream behavior around interrupted runs
  - how compiled subgraphs report interrupts
- Do not change production chat routing until this spike is proven.

### Stage 3: Production Resume Bridge

- Keep Mongo-backed conversation memory as the durable source of resume state.
- Optionally add a LangGraph-compatible Mongo checkpointer only if it provides
  value beyond existing conversation persistence.
- Map a later user reply to either:
  - a normal new graph invocation that consumes persisted interrupt state, or
  - a `Command({ resume })` invocation when checkpointing is available and
    stable.
- Re-run all transfer validation after resume.

## Implementation Phases

### Phase A: Documentation And Contract Reset

Goal: align the plan and docs with the target graph architecture.

Files:

```text
docs/ai-improvement-v2.md
docs/ai-assistant.md
docs/ai-tool-plan-steps-v2.md
```

Tests:

- `git diff --check`

### Phase B: Conditional Edge Skeleton

Goal: replace top-level no-op sequencing with conditional routing while keeping
current node implementations.

Files:

```text
server/src/ai/graph.ts
server/src/ai/state.ts
server/src/ai/tests/aiSafety.test.ts
```

Patch items:

- add route helper functions for auth, resume, and intent routing
- add `addConditionalEdges` at the top level
- preserve current result shape and diagnostics
- prove unrelated nodes do not run for unauthenticated, unsafe, read-only, and
  transfer turns

### Phase C: Request Parsing Subgraph

Goal: extract normalization, classification, slot extraction, `AiUserRequest`,
and transfer-draft parsing into a subgraph.

Files:

```text
server/src/ai/graph.ts
server/src/ai/requestParsingSubgraph.ts
server/src/ai/tests/aiSafety.test.ts
```

Tests:

- read-only requests do not run transfer draft extraction
- transfer requests still preserve tolerant draft parsing and diagnostics
- classifier fallback diagnostics still persist

### Phase D: Read-Only Answer Subgraph

Goal: isolate read-only tool authorization and memory updates.

Files:

```text
server/src/ai/graph.ts
server/src/ai/readOnlyAnswerSubgraph.ts
server/src/ai/toolInputs.ts
server/src/ai/tests/aiSafety.test.ts
```

Tests:

- read-only tools remain allowlisted
- unauthorized or missing tools fail closed
- tools receive `AiUserRequest` and resolved references
- read-only paths do not create or modify pending transfers

### Phase E: Transfer Preparation Subgraph

Goal: isolate transfer preparation and make each safety gate visible in graph
topology.

Files:

```text
server/src/ai/graph.ts
server/src/ai/transferPreparationSubgraph.ts
server/src/ai/amountResolution.ts
server/src/ai/tests/aiSafety.test.ts
```

Tests:

- missing recipient routes to interrupt state
- missing amount routes to interrupt state
- contextual amount resolution occurs before backend preparation
- backend validation is still required
- no transfer executes from chat text

### Phase F: Pending Modification And Status Subgraphs

Goal: separate pending transfer modification from read-only pending status.

Files:

```text
server/src/ai/graph.ts
server/src/ai/pendingModificationSubgraph.ts
server/src/ai/pendingStatusSubgraph.ts
server/src/ai/tests/aiSafety.test.ts
```

Tests:

- pending status is read-only
- ordinal pending-list follow-ups use `resolvePendingTransferReference`
- modification creates a replacement card only after validation
- failed modification leaves the old card pending

### Phase G: Interrupt-Compatible Clarification Subgraph

Goal: replace ad hoc clarification message handling with structured
interrupt-compatible state.

Files:

```text
server/src/ai/state.ts
server/src/ai/graph.ts
server/src/ai/clarificationSubgraph.ts
server/src/services/aiConversation.service.ts
server/src/ai/tests/aiSafety.test.ts
```

Tests:

- interruption payloads persist only safe structured data
- clarification replies resume the original intent
- stale or malformed replies fail closed
- transfer resume still revalidates recipient, amount, balance, and limits

### Phase H: Native Interrupt Spike

Goal: prove LangGraph-native interrupt/resume behavior in isolation before
production use.

Files:

```text
server/src/ai/tests/aiSafety.test.ts
server/src/ai/tests/langGraphInterrupt.test.ts
```

Tests:

- `interrupt()` returns the expected payload shape
- `Command({ resume })` resumes the expected node
- compiled subgraphs propagate interrupts predictably
- `MemorySaver` is sufficient for tests but not treated as production
  persistence

### Phase I: Production Interrupt Bridge

Goal: decide whether production should use native interrupts with a
checkpointer or keep interrupt-compatible Mongo resume state.

Files:

```text
server/src/ai/graph.ts
server/src/services/aiConversation.service.ts
server/src/ai/tests/aiSafety.test.ts
```

Decision criteria:

- no public API breaking change unless explicitly approved
- Mongo remains durable source of conversation state
- interrupted runs do not keep unsafe hidden prompt state
- resume cannot bypass tool authorization or transfer validation

### Phase J: Streaming And Eval Alignment

Goal: align streaming and evals with subgraph boundaries.

Files:

```text
server/src/routes/ai.routes.ts
server/src/ai/evals/
client/src/components/ui/floating-chat-widget-shadcnui.tsx
client/src/lib/types.ts
openapi.yaml
```

Tests:

- streamed status phases match subgraph progress
- interrupted turns stream only safe status and final clarification text
- deterministic eval fixtures cover conditional routes and interrupt/resume
  flows
- seeded Mongo and `llm-dev` modes remain guarded

## Verification Commands

Run after runtime implementation slices:

```bash
npm run build --workspace server
env VIRLY_EMAIL_FROM='Virly <verify@example.com>' npm run test --workspace server
git diff --check
```

Run when client or OpenAPI changes are included:

```bash
npm run build --workspace client
ruby -e 'require "yaml"; YAML.load_file("openapi.yaml")'
```

Run evals when graph routing or assistant behavior changes:

```bash
./scripts/ai-eval-chat.sh deterministic
```

Guarded eval modes require explicit environment setup:

```bash
VIRLY_AI_EVAL_ENABLE_LLM_DEV=true ./scripts/ai-eval-chat.sh llm-dev
VIRLY_AI_EVAL_ENABLE_MONGO=true VIRLY_AI_EVAL_MONGO_URI='mongodb://...' ./scripts/ai-eval-chat.sh seeded-mongo
```

## Success Criteria

The graph architecture is successful when:

- top-level graph routing uses conditional edges instead of a broad linear
  chain
- read-only, transfer-preparation, pending-modification, pending-status,
  clarification, and response behavior are isolated into subgraphs
- missing or ambiguous user input is represented as structured interrupt state
- native LangGraph interrupts are either safely integrated or explicitly ruled
  out with evidence
- the current natural conversation still works:

```text
User: למי העברתי היום?
Assistant: העברת היום לניקולה יוקיץ' (jokic@nuggets.com).

User: בוא נעביר לו שוב את אותה כמות
Assistant: [confirmation card for the latest amount sent to jokic@nuggets.com]

User: how much did he send me?
Assistant: Nikola Jokic (jokic@nuggets.com) sent you 120.00 ILS total.

User: send him the same amount he sent me
Assistant: [confirmation card for 120.00 ILS to jokic@nuggets.com]
```

- chat text still never executes money movement
- every transfer confirmation still goes through backend validation and the
  explicit confirmation endpoint
- diagnostics, tests, evals, docs, and OpenAPI/client contracts stay aligned
