# AI Tool Plan Steps

This file tracks implementation milestones for `docs/ai-tool-plan.md`.

## 2026-05-24 - Phase 1: Tool Contracts And Routing Foundation

Status: implemented.

Files changed:

- `server/src/ai/state.ts`
- `server/src/ai/router.ts`
- `server/src/ai/llm.ts`
- `server/src/ai/graph.ts`
- `server/src/ai/tests/aiSafety.test.ts`
- `docs/ai-tool-plan-steps.md`

Behavior added:

- Added the planned Phase 1 assistant intent surface.
- Added the planned read-only tool name surface.
- Added shared future-facing tool contracts:
  - `AiToolContext`
  - `AiToolStatus`
  - `AiToolResult<TData>`
  - `AiToolMemoryUpdate`
- Replaced switch-based read-only routing with `intentToReadOnlyTools`.
- Kept current implemented routes stable for existing live behavior.
- Kept transfer preparation, pending modification, cancellation, unsafe requests, and unsupported requests mapped to no read-only tools.
- Added fail-closed graph behavior for planned-but-unimplemented tool executors.

Tests added:

- Existing implemented tool routes remain unchanged.
- Planned Phase 1 route map entries are present.
- Every configured route uses an allowlisted read-only tool name.
- Planned-but-unimplemented tool execution returns a safe unavailable-tool response and executes no tool.

Verification:

- Passed: `npm run build --workspace server`
- Passed: `npm run test --workspace server` (rerun outside sandbox after `tsx` IPC permission failure under `/tmp`)
- Passed: `git diff --check`

Next milestone:

- Phase 2: implement counterparty tools, starting with `getRecentSentCounterparties`.

## 2026-05-24 - Phase 2: Counterparty Tools

Status: implemented.

Files changed:

- `server/src/ai/state.ts`
- `server/src/ai/counterpartyMemory.ts`
- `server/src/ai/llm.ts`
- `server/src/ai/router.ts`
- `server/src/ai/graph.ts`
- `server/src/ai/tools/index.ts`
- `server/src/ai/tools/counterpartyHelpers.ts`
- `server/src/ai/tools/getRecentSentCounterparties.ts`
- `server/src/ai/tools/getRecentReceivedCounterparties.ts`
- `server/src/ai/tools/resolveCounterpartyCandidates.ts`
- `server/src/ai/tools/getCounterpartySummary.ts`
- `server/src/ai/tools/getCounterpartyActivityTimeline.ts`
- `server/src/ai/tests/aiSafety.test.ts`
- `docs/ai-tool-plan-steps.md`

Behavior added:

- Implemented the five Phase 2 counterparty tools.
- Registered the new tools in the read-only executor registry.
- Added shared counterparty display helpers for normalized email ids, masked emails, personal-detail display names, default ILS output, and message-derived limits.
- Added deterministic intent routing for recent sent counterparties, recent received counterparties, counterparty summaries, and counterparty activity timelines in English and Hebrew.
- Updated the LLM classifier prompt with the new counterparty intent definitions.
- Added minimal graph chaining for `resolveCounterpartyCandidates` before summary and activity tools.
- Added resolver short-circuit behavior for ambiguous or unresolved counterparties.
- Extended counterparty memory updates to support list-style tool metadata.
- Kept full emails out of assistant-facing tool summaries and sanitized nested counterparty metadata before LLM response composition.

Tests added:

- Recent sent counterparty requests route to `getRecentSentCounterparties`.
- Recent received counterparty requests route to `getRecentReceivedCounterparties`.
- Counterparty summary resolves before running the summary tool.
- Ambiguous counterparty summary stops before downstream tool execution.
- Counterparty activity timeline resolves before running the timeline tool.
- Hebrew recent sent and received counterparty requests route to the Phase 2 tools.

Verification:

- Passed: `npm run build --workspace server`
- Passed: `npm run test --workspace server` (rerun outside sandbox after `tsx` IPC permission failure under `/tmp`)
- Passed: `git diff --check`

Next milestone:

- Phase 3: implement transaction tools, starting with `searchTransactions`.

## 2026-05-24 - Phase 3: Transaction Tools

Status: implemented.

Files changed:

- `server/src/ai/state.ts`
- `server/src/ai/counterpartyMemory.ts`
- `server/src/ai/messageNormalization.ts`
- `server/src/ai/llm.ts`
- `server/src/ai/router.ts`
- `server/src/ai/graph.ts`
- `server/src/ai/tools/index.ts`
- `server/src/ai/tools/transactionHelpers.ts`
- `server/src/ai/tools/searchTransactions.ts`
- `server/src/ai/tools/getTransactionStats.ts`
- `server/src/ai/tools/resolveTransactionReference.ts`
- `server/src/ai/tools/getTransactionReceipt.ts`
- `server/src/ai/tests/aiSafety.test.ts`
- `docs/ai-tool-plan-steps.md`

Behavior added:

- Implemented filtered transaction search, transaction stats, transaction-reference resolution, and display-safe transaction receipt lookup.
- Registered all four Phase 3 tools in the read-only executor registry.
- Added shared transaction helpers for user-scoped filters, common date ranges, amount filters, reason filters, sorting, limits, and safe display rows.
- Added deterministic English and Hebrew routing for transaction search, transaction stats/count, and ordinal/detail follow-ups.
- Updated the LLM classifier prompt with transaction search, stats, count, and detail definitions.
- Added graph chaining so transaction references resolve before receipt lookup.
- Added graph short-circuit behavior for ambiguous or unresolved transaction references.
- Stored display-safe transaction metadata in conversation memory for later ordinal follow-ups.
- Kept transaction tool output read-only and scoped by authenticated `ownerId`.

Tests added:

- Filtered transaction search routes to `searchTransactions` and stores transaction memory.
- Transaction count routes to `getTransactionStats`.
- Ordinal transaction detail follow-up resolves before running receipt lookup.
- Ambiguous transaction detail stops before receipt lookup.
- Hebrew transaction search and ordinal detail examples route through the Phase 3 tools.
- Bare `from last week` date wording does not infer received-transaction direction.
- Reason filters such as `for rent this month` stop before the common date phrase.

Verification:

- Passed: `npm run build --workspace server`
- Passed: `npm run test --workspace server` (rerun outside sandbox after `tsx` IPC permission failure under `/tmp`)
- Passed: `git diff --check`

Next milestone:

- Phase 4: implement transfer eligibility, quote, daily usage, and pending AI transfer read-only tools.

## 2026-05-24 - Phase 4: Transfer Preflight And Pending Tools

Status: implemented.

Files changed:

- `server/src/ai/state.ts`
- `server/src/ai/llm.ts`
- `server/src/ai/router.ts`
- `server/src/ai/graph.ts`
- `server/src/ai/tools/index.ts`
- `server/src/ai/tools/transferPreflightHelpers.ts`
- `server/src/ai/tools/pendingTransferHelpers.ts`
- `server/src/ai/tools/getTransferEligibility.ts`
- `server/src/ai/tools/getTransferQuote.ts`
- `server/src/ai/tools/getDailyTransferUsage.ts`
- `server/src/ai/tools/getPendingAiTransfers.ts`
- `server/src/ai/tools/resolvePendingTransferReference.ts`
- `server/src/ai/tests/aiSafety.test.ts`
- `docs/ai-tool-plan-steps.md`

Behavior added:

- Implemented read-only transfer preflight tools for eligibility, quote preview, and daily limit usage.
- Implemented pending AI transfer listing and pending-transfer reference resolution helpers.
- Registered all five Phase 4 tools in the read-only executor registry.
- Added shared preflight helpers for sender lookup, amount/currency extraction, ILS-only validation, daily debit usage, limit checks, and max-sendable calculation.
- Added pending-transfer helpers that scope queries by authenticated user, default to current conversation, broaden only on explicit all-user wording, and exclude non-pending or expired confirmations.
- Added deterministic English and Hebrew routing for transfer eligibility, transfer quotes, daily transfer usage, and pending confirmation lists.
- Kept `pending_confirmation_status` mapped to no tools so chat text cannot confirm, deny, or mutate a transfer.
- Added graph behavior so transfer quote requests with an explicit email skip counterparty resolution and validate the email in the quote tool.
- Updated the LLM classifier prompt with Phase 4 intent definitions.

Tests added:

- Transfer eligibility routes to `getTransferEligibility`.
- Hebrew transfer eligibility and daily usage route to Phase 4 tools.
- Transfer quote with an explicit email skips counterparty resolver.
- Transfer quote with a named recipient resolves before quote.
- Daily transfer usage routes to `getDailyTransferUsage`.
- Pending confirmation list defaults to current-conversation scope.
- Explicit all-pending wording uses all-user pending scope.
- Pending confirmation status remains non-mutating and executes no tools.
- Preflight helper tests cover max-sendable and blocking reason calculation.
- Pending scope helper defaults and broadening are covered.

Verification:

- Passed: `npm run build --workspace server`
- Passed: `npm run test --workspace server`
- Passed: `git diff --check`

Next milestone:

- Phase 5: general graph input builders and memory update handling for the expanded tool surface.

## 2026-05-24 - Phase 5: Graph Integration And Runtime Contract Migration

Status: implemented.

Files changed:

- `server/src/ai/state.ts`
- `server/src/ai/graph.ts`
- `server/src/ai/llm.ts`
- `server/src/ai/counterpartyMemory.ts`
- `server/src/ai/dateResolution.ts`
- `server/src/ai/toolInputs.ts`
- `server/src/ai/toolMemory.ts`
- `server/src/ai/toolResults.ts`
- `server/src/ai/tests/aiSafety.test.ts`
- `server/src/ai/tools/getRecentTransactions.ts`
- `server/src/ai/tools/getTransactionsWithCounterparty.ts`
- `server/src/ai/tools/getTransferEligibility.ts`
- `server/src/ai/tools/getTransferQuote.ts`
- `server/src/ai/tools/getDailyTransferUsage.ts`
- `server/src/ai/tools/getPendingAiTransfers.ts`
- `server/src/ai/tools/resolveCounterpartyCandidates.ts`
- `server/src/ai/tools/resolveTransactionReference.ts`
- `server/src/ai/tools/resolvePendingTransferReference.ts`
- `server/src/ai/tools/transactionHelpers.ts`
- `docs/ai-tool-plan-steps.md`

Behavior added:

- Migrated read-only runtime execution to the generic `AiToolResult<TData>` shape, with `displayData` and optional `memoryUpdates`.
- Added graph-level tool input building through `buildToolInput(...)` so tools receive validated context, resolved entities, request slots, clarification state, and narrow backend date ranges.
- Added deterministic common-range backend date resolution for `today`, `yesterday`, `this week`, `last week`, `this month`, `last month`, and the current Hebrew equivalents.
- Added generic memory update application for counterparties, transactions, pending transfers, and date ranges.
- Raised bounded conversation-memory capacities to the Phase 5 targets for counterparties and total entities.
- Replaced resolver-specific graph branching with result-status-based short-circuit handling for counterparty, transaction, and pending-transfer ambiguity or unresolved references.
- Made ordinal follow-ups such as `the second one` resolve from clarification options before broader memory.
- Kept response composition sanitized by converting runtime tool results to assistant-facing summaries before the responder sees them.
- Preserved the Phase 4 safety boundary: deterministic routing only, no tool-driven money movement, and non-mutating pending confirmation chat behavior.

Tests added:

- Updated graph integration tests to run Phase 2-4 flows through the migrated runtime contract.
- Verified chained execution still works for counterparty summary, transaction detail, and transfer quote requests.
- Verified ambiguous counterparty, transaction, and pending-transfer references stop downstream tool execution and produce clarifications.
- Verified transaction search memory persists for ordinal follow-up resolution.
- Verified pending-transfer and counterparty memory still persist through saved conversation state.
- Verified sanitized responder composition still preserves safety behavior while omitting backend-only emails.

Verification:

- Passed: `npm run build --workspace server`
- Passed: `npm run test --workspace server`
- Passed: `git diff --check`

Next milestone:

- Phase 6: OpenAPI and external contract expansion for the full AI tool surface.

## 2026-05-24 - Phase 6: OpenAPI And Client Contract Expansion

Status: implemented.

Files changed:

- `server/src/ai/state.ts`
- `server/src/ai/graph.ts`
- `server/src/routes/ai.routes.ts`
- `server/src/ai/tests/aiSafety.test.ts`
- `client/src/lib/types.ts`
- `client/src/components/ui/floating-chat-widget-shadcnui.tsx`
- `openapi.yaml`
- `docs/ai-tool-plan-steps.md`

Behavior added:

- Exposed optional structured `clarification` and minimal `toolResults` in the live `/api/ai/chat` response.
- Kept `toolResults` intentionally public-safe by returning only `toolName` and `status`.
- Kept `message` as the primary fallback response while adding structured clarification payload support.
- Synced the public assistant intent and tool-name enums in OpenAPI with the current runtime values.
- Added OpenAPI schemas for `AssistantIntent`, `AiToolName`, `AiToolStatus`, `AiToolCallResult`, and `AiClarificationRequest`.
- Synced client AI response types with the expanded server contract.
- Added minimal clarification-option rendering in the floating chat widget; option clicks now submit the option `value` through the existing chat flow.
- Preserved existing confirmation-card rendering and backward compatibility for message-only responses.

Tests added:

- Verified ambiguous graph results expose public clarification payloads.
- Verified public tool results expose only minimal status information and do not leak backend-only emails.
- Kept existing routing, safety, confirmation, and endpoint tests passing.

Verification:

- Passed: `npm run build --workspace server`
- Passed: `npm run test --workspace server`
- Passed: `npm run build --workspace client`
- Passed: `git diff --check`

Next milestone:

- Phase 7: end-to-end assistant test matrix across English, Hebrew, mixed-language, ambiguity, follow-ups, pending confirmations, and preflight flows.

## 2026-05-24 - Phase 7: End-to-End Assistant Test Matrix

Status: implemented.

Files changed:

- `server/src/ai/tests/aiSafety.test.ts`
- `docs/ai-tool-plan-steps.md`

Behavior added:

- Expanded the assistant test matrix across English, Hebrew, and mixed Hebrew/English prompts.
- Added explicit mixed-language coverage for counterparty summary and transfer quote flows.
- Added follow-up coverage proving ordinal replies resolve from clarification options before broader memory.
- Added pending-transfer reference coverage for ordinal selection from pending clarification options.
- Kept the coverage focused on end-to-end assistant behavior rather than changing runtime logic.
- Preserved all prior safety, routing, confirmation, and public contract assertions.

Tests added:

- Mixed Hebrew/English counterparty summary flow.
- Mixed Hebrew/English transfer quote flow.
- Transaction clarification follow-up resolving `the second one` from prior clarification options.
- Pending-transfer clarification follow-up resolving `the second one` from pending options.
- Existing assistant matrix re-verified across ambiguity, list follow-ups, preflight, cross-user isolation, and unsafe requests.

Verification:

- Passed: `npm run test --workspace server`
- Passed: `npm run build --workspace server`
- Passed: `npm run build --workspace client`
- Passed: `git diff --check`

Next milestone:

- No Phase 8 is defined in `docs/ai-tool-plan.md`; the current tool-plan phases are complete.
