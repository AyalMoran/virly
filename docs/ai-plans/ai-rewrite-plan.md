
# Virly AI Assistant Graph Rewrite Implementation Plan

## Goal

Rewrite the current Virly AI assistant LangGraph from a mostly linear graph into a routed, modular graph using:

- Conditional edges
- Compiled subgraphs
- Structured clarification / interrupt-compatible state
- Clear business-flow separation
- Existing backend validation and confirmation boundaries

Do **not** implement these right now:

- Native LangGraph `interrupt()`
- `Command({ resume })`
- `ToolNode`
- `Send`
- Parallel fan-out
- LangGraph checkpointer / `MemorySaver` in production

The graph should become more correct, more reviewable, easier to test, and less wasteful than the current linear workflow, while preserving all current business logic and public API behavior.

---

# 1. Current Problem

The current graph is linear:

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
````

This means many nodes are always visited, then internally no-op with guard clauses.

Examples of current guard-style behavior:

* `extractTransferDraft` skips itself unless intent is `transfer_prepare` or `transfer_modify_pending`.
* `resolveCounterpartyReference` skips itself unless counterparty resolution is needed.
* `resolveContextualAmounts` skips itself unless the current transfer draft has an amount reference.
* `prepareTransferConfirmation` skips itself unless intent is `transfer_prepare`.
* `modifyPendingTransferConfirmation` skips itself unless intent is `transfer_modify_pending`.
* `routeReadOnlyTools` skips execution when blocked by missing user, refusal, or clarification state.

This works functionally, but the graph topology does not express the actual workflow. The rewrite should move broad routing decisions into graph edges.

---

# 2. Non-Negotiable Business Rules

Do not change these rules.

```text
1. Chat text must never execute money movement.
2. The LLM must never select arbitrary tools.
3. The LLM may classify, parse, and phrase responses, but it is not a source of truth.
4. Backend services remain the source of truth for:
   - authenticated user identity
   - account data
   - balances
   - recipients
   - transfer validation
   - pending confirmation creation
   - confirmation lifecycle
   - transfer execution
5. Transfers must still require an explicit confirmation card.
6. Transfer execution must remain outside the chat graph.
7. The graph may prepare a pending confirmation only.
8. The confirmation endpoint must remain responsible for confirm / deny actions.
9. Read-only paths must not mutate balances, transfers, accounts, or transaction records.
10. Tool calls must stay allowlisted by intent.
11. Every DB-backed tool must scope reads by authenticated userId.
12. Clarification / resume state must not authorize transfer execution.
13. A resumed transfer-preparation flow must still re-run backend validation.
14. Existing response shape must remain compatible with the current client.
15. Existing audit and conversation persistence behavior must remain compatible.
```

Relevant current backend boundary:

```text
prepareAiPendingTransfer()
  validates draft
  creates pending confirmation

respondToAiPendingTransfer()
  validates pending confirmation id, user id, version, status, expiration
  executes transfer only after explicit confirmation endpoint action
```

Do not move this execution logic into the graph.

---

## Required progress tracking

Create and maintain a progress log file named:

`ai-rewrite-progress.md`

Use this file throughout the rewrite process.

The agent must:

- Create ai-rewrite-progress.md at the start of the task if it does not already exist.
- Read ai-rewrite-progress.md before starting each new implementation phase.
- Update ai-rewrite-progress.md after each meaningful implementation step.
- Record what was changed, which files were touched, which tests/build commands were run, and what remains.
- Use ai-rewrite-progress.md to avoid repeating completed work.
- Use ai-rewrite-progress.md to understand the current rewrite state if the task is resumed later.
- Mark blockers, failed tests, skipped steps, and follow-up work explicitly.

Suggested structure:

```text
# AI Rewrite Progress

## Current Status

Brief summary of the current rewrite state.

## Completed Steps

- [ ] Phase 1: Safe extraction
- [ ] Phase 2: Conditional top-level routing
- [ ] Phase 3: Request parsing subgraph
- [ ] Phase 4: Read-only answer subgraph
- [ ] Phase 5: Transfer preparation subgraph
- [ ] Phase 6: Pending modification subgraph
- [ ] Phase 7: Pending status subgraph
- [ ] Phase 8: Response subgraph
- [ ] Phase 9: Structured clarification state
- [ ] Phase 10: Cleanup, tests, and documentation alignment

## Change Log

### YYYY-MM-DD HH:mm

Changed:
- ...

Files touched:
- ...

Verification:
- `npm run build --workspace server`
- `env VIRLY_EMAIL_FROM='Virly <verify@virly.ayal.online>' npm run test --workspace server`
- `git diff --check`

Result:
- Passed / failed / skipped with reason

Remaining:
- ...
```

# 3. Target Top-Level Graph

Replace the single linear chain with this topology:

```text
START
  -> loadAuthenticatedContext
  -> authGate
      unauthenticated -> responseSubgraph
      authenticated   -> loadConversationContext

  -> resumeGate
      clarification_reply -> clarificationResumeSubgraph
      normal_turn         -> requestParsingSubgraph

  -> intentGate
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

Important: `loadAuthenticatedContext`, `loadConversationContext`, and `saveConversation` should remain top-level nodes for now. Do not hide authentication and persistence inside a subgraph yet.

---

# 4. Implementation Scope

Implement now:

```text
1. Conditional edge routing.
2. Request parsing subgraph.
3. Read-only answer subgraph.
4. Transfer preparation subgraph.
5. Pending modification subgraph.
6. Pending status subgraph.
7. Response subgraph.
8. Structured clarification / interrupt-compatible state.
9. Tests proving skipped nodes are actually skipped.
10. Existing public API compatibility.
```

Do not implement now:

```text
1. Native LangGraph interrupt().
2. Command({ resume }).
3. LangGraph production checkpointing.
4. ToolNode.
5. Send / parallel fan-out.
6. Parallel read-only tool execution.
7. LLM-selected tool calls.
```

---

# 5. File Plan

Likely files to modify or create:

```text
server/src/ai/graph.ts
server/src/ai/state.ts
server/src/ai/requestParsingSubgraph.ts
server/src/ai/readOnlyAnswerSubgraph.ts
server/src/ai/transferPreparationSubgraph.ts
server/src/ai/pendingModificationSubgraph.ts
server/src/ai/pendingStatusSubgraph.ts
server/src/ai/clarificationSubgraph.ts
server/src/ai/responseSubgraph.ts
server/src/ai/graphRoutes.ts
server/src/ai/tests/aiSafety.test.ts
server/src/ai/tests/graphRouting.test.ts
```

Optional helper files if needed:

```text
server/src/ai/graphNodes.ts
server/src/ai/graphDebug.ts
server/src/ai/graphState.ts
server/src/ai/referenceResolution.ts
```

Avoid huge rewrites at once. Prefer extracting existing node logic first, then replacing the topology.

---

# 6. Route Types

Create a new file:

```text
server/src/ai/graphRoutes.ts
```

Add route types:

```ts
import type { AssistantGraphState, AssistantIntent } from "./state.js";

export type AuthRoute = "authenticated" | "unauthenticated";

export type ResumeRoute =
  | "clarification_reply"
  | "normal_turn";

export type IntentRoute =
  | "read_only"
  | "prepare_transfer"
  | "modify_pending"
  | "pending_status"
  | "unsafe_or_help"
  | "unsupported";

export type ParseRoute =
  | "transfer_related"
  | "non_transfer";

export type ReferenceRoute =
  | "resolved"
  | "needs_clarification";

export type TransferPreparationRoute =
  | "continue"
  | "needs_clarification"
  | "ready"
  | "invalid";

export type ResponseRoute =
  | "compose"
  | "save";
```

Add route helper functions:

```ts
export function getAuthRoute(state: AssistantGraphState): AuthRoute {
  return state.userId ? "authenticated" : "unauthenticated";
}

export function getResumeRoute(state: AssistantGraphState): ResumeRoute {
  const clarification = state.counterpartyMemory?.clarification;

  if (clarification) {
    return "clarification_reply";
  }

  return "normal_turn";
}

export function getIntentRoute(state: AssistantGraphState): IntentRoute {
  const intent = state.detectedIntent ?? "unsupported";

  if (state.refusalReason || intent === "unsafe_request" || intent === "general_help") {
    return "unsafe_or_help";
  }

  if (intent === "transfer_prepare") {
    return "prepare_transfer";
  }

  if (intent === "transfer_modify_pending") {
    return "modify_pending";
  }

  if (
    intent === "pending_confirmation_status" ||
    intent === "transfer_cancel_pending" ||
    intent === "pending_ai_transfers"
  ) {
    return "pending_status";
  }

  if (intent === "unsupported") {
    return "unsupported";
  }

  return "read_only";
}

export function getParseRoute(state: AssistantGraphState): ParseRoute {
  return state.detectedIntent === "transfer_prepare" ||
    state.detectedIntent === "transfer_modify_pending"
    ? "transfer_related"
    : "non_transfer";
}

export function hasClarification(state: AssistantGraphState): boolean {
  return Boolean(state.clarificationRequest || state.clarificationMessage);
}
```

Keep route helpers deterministic and side-effect-free.

---

# 7. State Changes

Modify `server/src/ai/state.ts`.

The current `ClarificationRequest` is close to the desired shape. Extend it carefully without breaking the public response shape.

Current fields:

```ts
export type ClarificationRequest = {
  reason: ClarificationReason;
  message: string;
  resumeIntent?: AssistantIntent;
  resumeDraft?: TransferDraft;
  options?: Array<{
    id: string;
    label: string;
    value: string;
  }>;
  expectedReplyType: ClarificationReplyType;
};
```

Change to:

```ts
export type ClarificationRequest = {
  reason: (typeof clarificationReasonValues)[number];
  message: string;
  expectedReplyType: (typeof clarificationReplyTypeValues)[number];

  resumeIntent?: AssistantIntent;
  resumeOperation?: AiUserRequest["operation"];
  resumeDraft?: TransferDraft;

  options?: Array<{
    id: string;
    label: string;
    value: string;
  }>;

  safeResumeStateVersion?: number;
  createdAt?: string;
  expiresAt?: string;
};
```

Add missing clarification reasons if needed:

```ts
export const clarificationReasonValues = [
  "missing_recipient",
  "ambiguous_recipient",
  "missing_amount",
  "ambiguous_amount",
  "unsupported_currency",
  "missing_date_range",
  "ambiguous_reference",
  "ambiguous_transaction",
  "ambiguous_pending_transfer",
  "unresolved_reference"
] as const;
```

Keep current reason names unless changing them would not break tests or client expectations.

Do not introduce a separate public `AiGraphInterrupt` response type yet. Internally, treat `ClarificationRequest` as interrupt-compatible state.

---

# 8. Annotation Reducers

In `graph.ts`, consider adding reducers for array-like state fields.

Current annotation fields are simple:

```ts
messages: Annotation<AssistantGraphState["messages"]>(),
toolResults: Annotation<AssistantGraphState["toolResults"]>(),
debugTrace: Annotation<AssistantGraphState["debugTrace"]>()
```

For this rewrite, since the graph remains mostly sequential, reducers are not strictly required. But they are useful as subgraphs grow.

Add reducers only if they do not create type friction.

Suggested reducers:

```ts
messages: Annotation<AssistantGraphState["messages"]>({
  reducer: (left, right) => right ?? left ?? [],
  default: () => []
}),

requestedToolNames: Annotation<AssistantGraphState["requestedToolNames"]>({
  reducer: (left, right) => right ?? left ?? [],
  default: () => []
}),

executedToolNames: Annotation<AssistantGraphState["executedToolNames"]>({
  reducer: (left, right) => right ?? left ?? [],
  default: () => []
}),

toolResults: Annotation<AssistantGraphState["toolResults"]>({
  reducer: (left, right) => right ?? left ?? [],
  default: () => []
}),

debugTrace: Annotation<AssistantGraphState["debugTrace"]>({
  reducer: (left, right) => right ?? left ?? [],
  default: () => []
})
```

Do not use append reducers blindly if existing nodes return full arrays. Preserve current semantics unless all writers are converted to append-style updates.

---

# 9. Node Extraction Strategy

Before changing topology, extract current node implementations into reusable builders.

Keep behavior identical.

Move these existing node functions or factories to helper files if helpful:

```text
loadAuthenticatedContext
buildConversationLoader
resolveClarificationReplyNode
normalizeMessageNode
buildIntentClassifier
extractRequestSlotsNode
buildTransferDraftExtractor
buildCounterpartyResolver
buildContextualAmountResolver
buildToolRouter
buildTransferConfirmationPreparer
buildPendingTransferModifier
buildResponseComposer
buildConversationSaver
```

Codex should avoid changing business logic inside these functions during extraction.

Preferred approach:

```text
Step 1: Extract node functions.
Step 2: Run tests.
Step 3: Add route helpers.
Step 4: Replace linear edges with conditional edges.
Step 5: Extract subgraphs.
```

---

# 10. Request Parsing Subgraph

Create:

```text
server/src/ai/requestParsingSubgraph.ts
```

Purpose:

```text
Normalize the user message.
Classify intent.
Extract request slots.
Build AiUserRequest.
Extract transfer draft only for transfer-related intents.
```

Topology:

```text
START
  -> normalizeUserMessage
  -> classifyIntent
  -> extractRequestSlots
  -> parseGate
      transfer_related -> extractTransferDraft -> END
      non_transfer     -> END
```

Implementation sketch:

```ts
import { START, END, StateGraph } from "@langchain/langgraph";
import type { GraphOptionsLike } from "./graphTypes.js";
import { AssistantStateAnnotation } from "./graphState.js";
import { getParseRoute } from "./graphRoutes.js";

export function buildRequestParsingSubgraph(options: GraphOptionsLike) {
  return new StateGraph(AssistantStateAnnotation)
    .addNode("normalizeUserMessage", withNodeTrace(...))
    .addNode("classifyIntent", withNodeTrace(...))
    .addNode("extractRequestSlots", withNodeTrace(...))
    .addNode("extractTransferDraft", withNodeTrace(...))
    .addEdge(START, "normalizeUserMessage")
    .addEdge("normalizeUserMessage", "classifyIntent")
    .addEdge("classifyIntent", "extractRequestSlots")
    .addConditionalEdges("extractRequestSlots", getParseRoute, {
      transfer_related: "extractTransferDraft",
      non_transfer: END
    })
    .addEdge("extractTransferDraft", END)
    .compile();
}
```

Rules:

```text
1. Do not extract transfer draft for read-only intents.
2. Keep deterministic transfer draft fallback behavior.
3. Keep LLM parsing fallback diagnostics.
4. Keep current `userRequest` construction.
```

Tests:

```text
1. Balance request does not execute transfer draft extractor.
2. Recent transactions request does not execute transfer draft extractor.
3. Transfer request executes transfer draft extractor.
4. Transfer modification request executes transfer draft extractor.
5. Classifier fallback diagnostics still work.
```

---

# 11. Clarification Resume Subgraph

Create:

```text
server/src/ai/clarificationSubgraph.ts
```

Purpose:

```text
Consume a user reply when persisted conversation memory has an active clarification.
Convert the reply into structured state.
Clear clarification state only after successful resolution.
Do not authorize transfer execution.
```

Initial topology:

```text
START
  -> resolveClarificationReply
  -> END
```

For now, reuse existing `resolveClarificationReplyNode`.

Important current limitation:

The existing resolver mostly handles `amount_scope` clarification replies. Keep that behavior, but structure it so additional clarification types can be added later.

Required behavior:

```text
1. If reply resolves clarification:
   - set detectedIntent to the original resume intent
   - restore or update transferDraft if needed
   - clear clarificationRequest
   - clear clarificationMessage
   - clear counterpartyMemory.clarification

2. If reply does not resolve clarification:
   - allow normal parsing to continue, or re-ask clarification depending on existing behavior
   - do not execute transfer
```

Top-level graph should route clarification replies here first. After this subgraph, route to `intentGate`.

---

# 12. Read-Only Answer Subgraph

Create:

```text
server/src/ai/readOnlyAnswerSubgraph.ts
```

Purpose:

```text
Resolve references needed for read-only questions.
Select allowlisted tools using the existing intent-to-tool map.
Execute read-only tools.
Apply tool memory updates.
Produce clarification state if a reference is ambiguous or unresolved.
```

Topology:

```text
START
  -> resolveCounterpartyReference
  -> routeReadOnlyTools
  -> END
```

For now, keep this simple. Do not over-split into too many gates yet.

Use existing:

```text
buildCounterpartyResolver()
buildToolRouter()
```

Rules:

```text
1. Tool selection must still come from `getReadOnlyToolsForIntent`.
2. LLM must not choose arbitrary tools.
3. Every requested tool must pass `isReadOnlyToolName`.
4. Missing tool must fail closed or produce current compatibility message.
5. Read-only subgraph must not create, modify, supersede, confirm, deny, or execute transfers.
6. Counterparty resolver tools are allowed only as part of the fixed tool map.
```

Tests:

```text
1. Read-only balance request calls only read-only tools.
2. Counterparty total received can call resolver then total tool.
3. Ambiguous resolver result produces clarification.
4. Missing tool fails safely.
5. No pending transfer confirmation is created in read-only path.
6. No transfer preparation service is called in read-only path.
7. No transfer modification service is called in read-only path.
```

---

# 13. Transfer Preparation Subgraph

Create:

```text
server/src/ai/transferPreparationSubgraph.ts
```

Purpose:

```text
Prepare a pending confirmation card for a transfer.
Never execute a transfer.
Make recipient, amount, currency, and backend validation gates visible.
```

Initial topology:

```text
START
  -> resolveCounterpartyReference
  -> resolveContextualAmounts
  -> prepareTransferConfirmation
  -> END
```

This preserves current behavior but isolates transfer preparation from read-only paths.

Later optional refinement:

```text
START
  -> resolveCounterpartyReference
  -> recipientGate
      needs_clarification -> END
      continue            -> resolveContextualAmounts
  -> amountGate
      needs_clarification -> END
      continue            -> prepareTransferConfirmation
  -> END
```

Implement the simple version first. If tests pass, add gates if they improve clarity.

Rules:

```text
1. Only runs for `transfer_prepare`.
2. Can create only a pending confirmation card.
3. Must call `prepareAiPendingTransfer` or injected `transferPreparationService`.
4. Must pass authenticated userId, conversationId, assistantId, draft, and resolvedCounterparty.
5. Must preserve unsupported-currency clarification behavior.
6. Must preserve missing-recipient clarification behavior.
7. Must preserve missing-amount clarification behavior.
8. Must preserve contextual amount resolution before backend preparation.
9. Must not call `respondToAiPendingTransfer`.
10. Must not mutate balances or create completed transactions.
```

Tests:

```text
1. Missing recipient creates clarification before confirmation.
2. Missing amount creates clarification before confirmation.
3. Unsupported currency asks clarification.
4. Contextual amount reference is resolved before backend preparation.
5. Valid transfer creates pending confirmation.
6. Valid transfer does not execute transfer.
7. Transfer service receives userId from authenticated context only.
8. Transfer service is not called for read-only request.
```

---

# 14. Pending Modification Subgraph

Create:

```text
server/src/ai/pendingModificationSubgraph.ts
```

Purpose:

```text
Modify an active pending transfer by creating a replacement confirmation.
Preserve old confirmation unless replacement validation succeeds.
Never execute transfer.
```

Topology:

```text
START
  -> resolveCounterpartyReference
  -> resolveContextualAmounts
  -> modifyPendingTransferConfirmation
  -> END
```

Use existing:

```text
buildPendingTransferModifier()
```

Rules:

```text
1. Only runs for `transfer_modify_pending`.
2. Requires active pending confirmation in memory.
3. Must call `modifyAiPendingTransfer` or injected `transferModificationService`.
4. Must re-run backend validation.
5. Must preserve old pending transfer if replacement validation fails.
6. Must supersede old confirmation only after replacement is created.
7. Must not execute transfer.
8. Chat text cannot confirm or deny transfer.
```

Tests:

```text
1. Modify without active pending confirmation asks to prepare new transfer.
2. Modify amount creates replacement card.
3. Modify recipient creates replacement card after validation.
4. Failed replacement leaves old card pending.
5. Successful replacement returns supersededConfirmationId.
6. No transfer execution occurs.
```

---

# 15. Pending Status Subgraph

Create:

```text
server/src/ai/pendingStatusSubgraph.ts
```

Purpose:

```text
Answer questions about pending confirmations.
Handle “yes / confirm / send it” safely by refusing chat confirmation and directing user to card buttons.
Handle pending list and ordinal pending references.
```

Topology:

```text
START
  -> routeReadOnlyTools
  -> END
```

Current behavior:

* `pending_confirmation_status` currently maps to no read-only tools.
* `pending_ai_transfers` maps to `getPendingAiTransfers`.
* `transfer_cancel_pending` is handled in deterministic response text and does not execute deny.

Rules:

```text
1. This subgraph is read-only.
2. It must not confirm transfer.
3. It must not deny transfer.
4. It must not modify transfer.
5. It may retrieve pending confirmations if mapped through read-only tools.
6. It may resolve pending transfer references only through allowlisted read-only resolver tools.
7. “yes”, “confirm”, “send it”, “go ahead”, Hebrew equivalents, etc. must not execute transfer.
8. Response should direct user to explicit confirmation card buttons.
```

Tests:

```text
1. “yes” with pending card does not execute transfer.
2. “confirm it” does not execute transfer.
3. “cancel it” does not deny through chat.
4. Pending list request can call getPendingAiTransfers.
5. Ordinal pending follow-up can resolve pending reference if supported.
```

---

# 16. Response Subgraph

Create:

```text
server/src/ai/responseSubgraph.ts
```

Purpose:

```text
Build the final assistant response.
Use deterministic fallback first.
Optionally allow LLM rewrite.
Run response post-checks.
Hydrate user-visible labels.
```

Topology:

```text
START
  -> composeResponse
  -> END
```

Use existing:

```text
buildResponseComposer()
```

Rules:

```text
1. Response must not invent account facts.
2. Response must not claim transfer execution.
3. Response must not contradict required facts.
4. Response must not leak masked labels when user-visible labels are available.
5. If LLM response fails post-checks, fall back to deterministic response.
6. Preserve current Hebrew/English behavior.
```

Current post-check behavior should remain:

```text
unsafe money movement claim
masked label leak
missing required amount fact
contradicting currency
contradicting recipient
contradicting status
contradicting date
```

Tests:

```text
1. LLM claiming transfer was sent falls back.
2. LLM omitting required amount falls back.
3. LLM contradicting recipient falls back.
4. Masked label leaks are hydrated or rejected.
5. Deterministic response still works without LLM provider.
```

---

# 17. Top-Level Graph Rewrite

In `server/src/ai/graph.ts`, rewrite `buildAssistantGraph()`.

New topology:

```ts
function buildAssistantGraph(options: GraphOptions) {
  const requestParsingSubgraph = buildRequestParsingSubgraph(options);
  const clarificationResumeSubgraph = buildClarificationSubgraph(options);
  const readOnlyAnswerSubgraph = buildReadOnlyAnswerSubgraph(options);
  const transferPreparationSubgraph = buildTransferPreparationSubgraph(options);
  const pendingModificationSubgraph = buildPendingModificationSubgraph(options);
  const pendingStatusSubgraph = buildPendingStatusSubgraph(options);
  const responseSubgraph = buildResponseSubgraph(options);

  return new StateGraph(AssistantStateAnnotation)
    .addNode("loadAuthenticatedContext", withNodeTrace(...))
    .addNode("loadConversationContext", withNodeTrace(...))
    .addNode("clarificationResumeSubgraph", clarificationResumeSubgraph)
    .addNode("requestParsingSubgraph", requestParsingSubgraph)
    .addNode("readOnlyAnswerSubgraph", readOnlyAnswerSubgraph)
    .addNode("transferPreparationSubgraph", transferPreparationSubgraph)
    .addNode("pendingModificationSubgraph", pendingModificationSubgraph)
    .addNode("pendingStatusSubgraph", pendingStatusSubgraph)
    .addNode("responseSubgraph", responseSubgraph)
    .addNode("saveConversation", withNodeTrace(...))

    .addEdge(START, "loadAuthenticatedContext")

    .addConditionalEdges("loadAuthenticatedContext", getAuthRoute, {
      unauthenticated: "responseSubgraph",
      authenticated: "loadConversationContext"
    })

    .addConditionalEdges("loadConversationContext", getResumeRoute, {
      clarification_reply: "clarificationResumeSubgraph",
      normal_turn: "requestParsingSubgraph"
    })

    .addEdge("clarificationResumeSubgraph", "requestParsingSubgraph")

    .addConditionalEdges("requestParsingSubgraph", getIntentRoute, {
      read_only: "readOnlyAnswerSubgraph",
      prepare_transfer: "transferPreparationSubgraph",
      modify_pending: "pendingModificationSubgraph",
      pending_status: "pendingStatusSubgraph",
      unsafe_or_help: "responseSubgraph",
      unsupported: "responseSubgraph"
    })

    .addEdge("readOnlyAnswerSubgraph", "responseSubgraph")
    .addEdge("transferPreparationSubgraph", "responseSubgraph")
    .addEdge("pendingModificationSubgraph", "responseSubgraph")
    .addEdge("pendingStatusSubgraph", "responseSubgraph")

    .addEdge("responseSubgraph", "saveConversation")
    .addEdge("saveConversation", END)

    .compile();
}
```

Important question: after `clarificationResumeSubgraph`, should the graph always go through full `requestParsingSubgraph` again?

Recommended initial behavior:

```text
Yes, route clarification reply through requestParsingSubgraph after clarification resume.
```

Reason:

* Keeps behavior compatible.
* Ensures `normalizedMessage`, `requestSlots`, and `userRequest` are present.
* Existing `resolveClarificationReplyNode` may set `detectedIntent` and `transferDraft`, and `extractTransferDraft` already skips if `state.transferDraft` exists.

If this causes classifier to overwrite `detectedIntent`, preserve the existing guard in `classifyIntent`:

```ts
if (state.refusalReason || state.detectedIntent) {
  return {};
}
```

---

# 18. Progress Streaming

Current progress mapping is node-name based.

After subgraphs, update progress reporting to avoid noisy internal node names if needed.

Keep existing internal node progress for now, but add these mappings:

```text
requestParsingSubgraph      -> understanding_request
readOnlyAnswerSubgraph      -> checking_account_facts
transferPreparationSubgraph -> preparing_confirmation
pendingModificationSubgraph -> preparing_confirmation
pendingStatusSubgraph       -> checking_account_facts
responseSubgraph            -> composing_response
```

Do not break existing stream event shape.

---

# 19. Audit Logging

Keep current audit behavior in `runAssistantGraph()`:

```text
intent
toolsRequested
toolsExecuted
refusalReason
diagnostics
```

After subgraphs, make sure:

```text
1. requestedToolNames still includes requested read-only tools.
2. executedToolNames still includes executed tools.
3. debugTrace still contains useful node transitions.
4. finalState.detectedIntent is set correctly.
5. refusalReason is preserved.
```

No public audit schema change unless explicitly required.

---

# 20. Conversation Persistence

Keep existing Mongo-backed conversation memory as durable source of truth.

Do not add LangGraph production checkpointing.

In `saveConversation`, preserve current behavior:

```text
1. Append assistant message.
2. Normalize bounded memory.
3. Persist clarification state when present.
4. Persist pending confirmation state when confirmation is created.
5. Persist answerFrames.
6. Persist entities.
7. Preserve mode:
   - awaiting_clarification
   - transfer_confirmation_pending
   - transfer_draft_in_progress
   - answering_read_only
   - idle
```

If adding fields to `ClarificationRequest`, make sure persistence accepts them.

---

# 21. Tool Policy

Do not introduce `ToolNode`.

Keep the current fixed tool-routing model:

```text
intent -> allowlisted read-only tools
```

Preserve:

```ts
getReadOnlyToolsForIntent()
isReadOnlyToolName()
buildToolInput()
```

Rules:

```text
1. The LLM cannot produce tool names.
2. The graph cannot execute a tool not mapped from intent.
3. The graph cannot execute a non-read-only tool in read-only path.
4. Transfer preparation and modification services are not generic tools.
5. Transfer execution is not a graph tool.
```

---

# 22. Testing Plan

Add or update tests in:

```text
server/src/ai/tests/aiSafety.test.ts
server/src/ai/tests/graphRouting.test.ts
```

## 22.1 Routing Tests

Add tests proving unrelated nodes/services are skipped.

Use injected fake services and fake tools with counters.

### Test: unauthenticated skips everything sensitive

Input:

```text
userId: undefined
message: "what is my balance?"
```

Assert:

```text
1. Response says authentication required.
2. classifier is not called if possible.
3. read-only tools are not called.
4. transferPreparationService is not called.
5. transferModificationService is not called.
6. no confirmation returned.
```

### Test: read-only request skips transfer services

Input:

```text
message: "what is my balance?"
```

Assert:

```text
1. read-only tool called.
2. transfer draft extractor not called if instrumented.
3. transferPreparationService not called.
4. transferModificationService not called.
5. no confirmation returned.
```

### Test: transfer request skips read-only tool router

Input:

```text
message: "send 50 ILS to bob@example.com"
```

Assert:

```text
1. transferPreparationService called.
2. generic read-only tools not called.
3. confirmation returned if fake service returns ready.
4. no transfer execution.
```

### Test: transfer modification skips read-only tools

Setup memory with active pending confirmation.

Input:

```text
message: "actually make it 70"
```

Assert:

```text
1. transferModificationService called.
2. transferPreparationService not called.
3. read-only tools not called.
4. supersededConfirmationId returned when fake service returns ready.
```

### Test: pending confirmation chat confirmation is blocked

Setup memory with active pending confirmation.

Input:

```text
message: "yes, send it"
```

Assert:

```text
1. no transfer execution.
2. no confirmation endpoint called.
3. no transferPreparationService called.
4. no transferModificationService called.
5. response directs user to confirmation card buttons.
```

---

## 22.2 Clarification Tests

### Test: missing recipient

Input:

```text
message: "send 50"
```

Assert:

```text
1. clarification reason is missing_recipient.
2. no confirmation returned.
3. transfer execution does not occur.
```

### Test: missing amount

Input:

```text
message: "send money to bob@example.com"
```

Assert:

```text
1. clarification reason is missing_amount.
2. no confirmation returned.
3. transfer execution does not occur.
```

### Test: ambiguous amount scope

Conversation:

```text
User: how much did he send me?
Assistant: ...
User: send him the same amount
```

Assert:

```text
1. ambiguous amount clarification is produced if resolver cannot choose.
2. options are present.
3. resumeDraft is persisted.
4. no confirmation returned before clarification is resolved.
```

### Test: clarification resume revalidates

Setup persisted clarification with `resumeDraft`.

Input:

```text
message: "last sent amount"
```

Assert:

```text
1. clarification is cleared after successful resolution.
2. transferPreparationService is called after resume.
3. backend validation still runs.
4. confirmation may be returned.
5. transfer execution does not occur.
```

---

## 22.3 Response Safety Tests

### Test: LLM claims transfer executed

Fake LLM response:

```text
"I sent the transfer."
```

Assert:

```text
1. response post-check fails.
2. deterministic fallback is used.
3. final response does not claim transfer execution.
```

### Test: LLM contradicts amount

Required fact:

```text
amount: 50
```

Fake LLM response:

```text
"The amount is 500."
```

Assert fallback.

### Test: masked label leak

Fake LLM response includes masked email when user-visible full label is allowed.

Assert hydration or fallback according to current behavior.

---

# 23. Verification Commands

Run after each implementation slice:

```bash
npm run build --workspace server
env VIRLY_EMAIL_FROM='Virly <verify@virly.ayal.online>' npm run test --workspace server
git diff --check
```

If client or OpenAPI changes are accidentally touched:

```bash
npm run build --workspace client
ruby -e 'require "yaml"; YAML.load_file("openapi.yaml")'
```

If graph behavior changes materially:

```bash
./scripts/ai-eval-chat.sh deterministic
```

Do not run guarded eval modes unless env vars are explicitly provided.

---

# 24. Implementation Sequence

## Phase 1: Safe Extraction

Goal:

```text
Move reusable graph nodes into helper modules without changing behavior.
```

Tasks:

```text
1. Extract shared AssistantStateAnnotation if needed.
2. Extract node factories or keep them in graph.ts if extraction is risky.
3. Add graphRoutes.ts route helper functions.
4. Build passes.
5. Existing tests pass.
```

Do not change graph topology yet.

---

## Phase 2: Conditional Top-Level Routing

Goal:

```text
Replace obvious linear no-op paths with conditional edges.
```

Tasks:

```text
1. Add authGate after loadAuthenticatedContext.
2. Add resumeGate after loadConversationContext.
3. Add intentGate after request parsing.
4. Keep existing node implementations mostly unchanged.
5. Make sure public result shape does not change.
```

Expected result:

```text
Unauthenticated requests skip tools and transfer nodes.
Unsafe/help/unsupported requests skip tools and transfer nodes.
Read-only requests skip transfer preparation and pending modification.
Transfer requests skip generic read-only tool router.
Pending modification skips read-only answer path.
```

---

## Phase 3: Request Parsing Subgraph

Goal:

```text
Move normalization/classification/slot extraction/transfer draft extraction into a compiled subgraph.
```

Tasks:

```text
1. Create requestParsingSubgraph.ts.
2. Add parseGate so transfer draft extraction only runs for transfer intents.
3. Wire into top-level graph.
4. Add tests proving read-only intents do not extract transfer drafts.
```

---

## Phase 4: Read-Only Answer Subgraph

Goal:

```text
Move read-only reference resolution and tool execution into a compiled subgraph.
```

Tasks:

```text
1. Create readOnlyAnswerSubgraph.ts.
2. Move counterparty resolution and routeReadOnlyTools into it.
3. Preserve tool allowlist behavior.
4. Preserve memory updates.
5. Preserve clarification from ambiguous tools.
6. Add tests proving no transfer confirmation is created in read-only path.
```

---

## Phase 5: Transfer Preparation Subgraph

Goal:

```text
Move transfer-specific resolution and confirmation preparation into a compiled subgraph.
```

Tasks:

```text
1. Create transferPreparationSubgraph.ts.
2. Include counterparty resolution.
3. Include contextual amount resolution.
4. Include prepareTransferConfirmation.
5. Preserve unsupported currency clarification.
6. Preserve missing recipient / missing amount clarification.
7. Add tests proving no transfer executes.
```

---

## Phase 6: Pending Modification Subgraph

Goal:

```text
Move pending transfer modification into a compiled subgraph.
```

Tasks:

```text
1. Create pendingModificationSubgraph.ts.
2. Include counterparty resolution.
3. Include contextual amount resolution.
4. Include modifyPendingTransferConfirmation.
5. Preserve old pending transfer on failed replacement.
6. Add tests for successful replacement and failure case.
```

---

## Phase 7: Pending Status Subgraph

Goal:

```text
Isolate pending status / chat-confirmation safety handling.
```

Tasks:

```text
1. Create pendingStatusSubgraph.ts.
2. Route pending-related read-only status questions here.
3. Ensure chat confirmation remains blocked.
4. Add tests for “yes”, “confirm”, “send it”, and Hebrew equivalents.
```

---

## Phase 8: Response Subgraph

Goal:

```text
Move response composition and post-checking into a compiled subgraph.
```

Tasks:

```text
1. Create responseSubgraph.ts.
2. Move composeResponse into it.
3. Preserve deterministic fallback.
4. Preserve LLM post-checks.
5. Preserve label hydration.
```

---

## Phase 9: Structured Clarification State

Goal:

```text
Make clarification state interrupt-compatible without using native LangGraph interrupts.
```

Tasks:

```text
1. Extend ClarificationRequest with:
   - resumeOperation
   - safeResumeStateVersion
   - createdAt
   - expiresAt
2. Update buildClarificationRequest helper.
3. Persist new fields.
4. Update clarification resume logic to clear state only on successful resolution.
5. Ensure malformed or stale replies fail closed.
```

Do not use `interrupt()`.

---

## Phase 10: Cleanup and Documentation

Tasks:

```text
1. Remove obsolete linear edges.
2. Remove redundant broad guard clauses only where graph routing fully replaces them.
3. Keep defensive guards at backend/safety boundaries.
4. Update docs/ai-improvement-v2.md if needed.
5. Add a graph topology comment near buildAssistantGraph().
6. Run build, tests, diff check, deterministic eval.
```

Important: do not remove all internal guards. Some guards are still useful as defense-in-depth.

Keep guards around:

```text
userId
refusalReason
clarificationMessage
intent-specific backend calls
transfer service calls
tool allowlist
missing tool executor
```

---

# 25. Acceptance Criteria

The rewrite is complete when:

```text
1. The top-level graph uses conditional edges.
2. The graph no longer has one broad linear chain through every workflow.
3. Read-only flow is isolated.
4. Transfer preparation flow is isolated.
5. Pending modification flow is isolated.
6. Pending status flow is isolated.
7. Response composition is isolated.
8. Request parsing extracts transfer drafts only for transfer-related intents.
9. Chat text still cannot execute transfers.
10. Confirmation card behavior remains unchanged.
11. Backend validation remains unchanged.
12. Tool allowlist behavior remains unchanged.
13. Public `RunAssistantResult` shape remains compatible.
14. Existing tests pass.
15. New routing/safety tests pass.
16. Deterministic evals still pass.
```

---

# 26. What Not To “Improve” During This Rewrite

Avoid scope creep.

Do not:

```text
1. Replace backend transfer validation with graph logic.
2. Let LLM select tools.
3. Add native interrupt.
4. Add LangGraph checkpointing.
5. Add ToolNode.
6. Add parallel fan-out.
7. Add new financial business behavior.
8. Change confirmation endpoint semantics.
9. Change public API response shape.
10. Change client confirmation-card behavior.
11. Change auth model.
12. Change database schema unless required for clarification fields.
```

---

# 27. Core Design Principle

The final graph should be:

```text
Routed, not linear.
Deterministic, not autonomous.
Modular, not over-engineered.
Banking-safe, not framework-driven.
```

The LLM parses and phrases.

The graph routes and coordinates.

The backend validates and enforces.

The confirmation endpoint executes money movement.

