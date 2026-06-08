# AI Tool Plan Steps V2

This file is a historical milestone log. For current implementation behavior,
use [`docs/ai-current-implementation.md`](ai-current-implementation.md). Older
entries may describe the code state at the time they were written and must not
be treated as current unless the current implementation document agrees.

## 2026-06-06 - Documentation Drift Reset

Status:

- Completed.

Specific task:

- Update assistant documentation so it matches the current implementation and
  clearly separates implemented, partially implemented, planned, deprecated or
  inaccurate, and known mismatch states.

Files changed:

- `docs/ai-current-implementation.md`
- `docs/ai-assistant.md`
- `docs/ai-improvement-v2.md`
- `docs/ai-tool-plan-steps-v2.md`

Current implementation summary:

- `server/src/ai/graph.ts` now uses top-level conditional routing and compiled
  subgraph nodes. It is no longer accurately described as a single broad linear
  graph.
- Implemented subgraphs are:
  - `requestParsingSubgraph`
  - `clarificationResumeSubgraph`
  - `readOnlyAnswerSubgraph`
  - `transferPreparationSubgraph`
  - `pendingModificationSubgraph`
  - `pendingStatusSubgraph`
  - `responseSubgraph`
- Native LangGraph `interrupt()` / `Command({ resume })` behavior is still
  planned or spike-only, not production behavior.
- MCP and LangGraph `ToolNode` behavior are not runtime behavior.
- Chat can prepare or replace pending confirmations, but only
  `POST /api/ai/confirmations/:id` can confirm or deny.
- Read-only tools and resolver tools do not mutate account, transaction,
  balance, or transfer state.
- Transfer limit, eligibility, quote, and daily-usage tools are implemented as
  read-only preflight information. The pending-confirmation creation and final
  confirmation paths do not enforce configured per-transfer or daily limits yet.

Known mismatch summary:

- `getCashflowSummary`, `getMyProfile`, and `getAvailableActions` appear in
  shared contracts, client types, and OpenAPI, but are not registered server
  tool executors.
- Server clarification state can contain resume fields that are not documented
  in the client/OpenAPI clarification schema.
- Client confirmation-card types are looser than the required server/OpenAPI
  card shape.
- `AiPendingTransfer.status` includes `expired`, but current confirmation code
  rejects by `expiresAt` and TTL behavior rather than actively writing
  `status: "expired"`.

Deprecated current-status claims:

- Any older entry saying the current graph has no conditional edges or no
  compiled subgraphs is superseded by the current source code.
- Any older entry implying transfer limits are enforced by confirmation
  creation or execution is inaccurate for the current code.

Tests added or updated:

- None. This was documentation-only.

Planned follow-up work:

- Decide whether clarification resume fields should become public API or be
  filtered from `/api/ai/chat`.
- Decide whether configured transfer limits should be enforced in money-moving
  paths.
- Either implement or remove/mark unavailable the contract-only tool names.
- Spike native LangGraph interrupts before any production use.

## 2026-06-03 - Phase 1: Failure Capture And Debuggability

Status: implemented.

Files changed:

- `server/src/ai/state.ts`
- `server/src/ai/router.ts`
- `server/src/ai/graph.ts`
- `server/src/config.ts`
- `server/src/utils/env.ts`
- `server/src/models/AiAuditLog.ts`
- `server/src/services/aiAuditLog.service.ts`
- `server/src/ai/tests/aiSafety.test.ts`
- `docs/ai-tool-plan-steps-v2.md`

Behavior added:

- Added internal AI graph diagnostics types and `debugTrace` state support.
- Added sanitized diagnostics propagation into `AuditLogInput` and persisted `AiAuditLog.diagnostics`.
- Added `VIRLY_AI_DEBUG_TRACE`, default `false`, for internal node transition and sanitized state snapshot tracing.
- Replaced raw LLM fallback `console.warn` logging in classifier, transfer draft extraction, resolver, and response composition paths with audit-safe diagnostic events.
- Recorded fallback and failure classes for classifier failures, transfer draft schema failures, resolver failures, deterministic fallback usage, contextual amount gaps, and clarification starts.
- Kept `/api/ai/chat` and `RunAssistantResult` public response shape unchanged.
- Kept transfer behavior unchanged; chat text still cannot execute money movement.

Tests added:

- Transfer draft extractor failure records sanitized `draft_schema_failed` and `deterministic_fallback_used` diagnostics.
- Raw prompt text and full emails from thrown LLM errors are not stored in diagnostics.
- Classifier failure records `classifier_failed` and still falls back to deterministic classification.
- Contextual amount references without resolved numeric amounts record `contextual_amount_unresolved`.
- Missing amount clarification records `clarification_started`.
- `VIRLY_AI_DEBUG_TRACE` records node transitions without exposing `debugTrace` in the public graph result.

Verification:

- Passed: `npm run build --workspace server`
- Passed: `npx tsx --test src/ai/tests/aiSafety.test.ts` from `server/` after rerunning outside the sandbox because `tsx` IPC pipe creation under `/tmp` was blocked by sandbox permissions.
- Partial: `npm run test --workspace server` passed all AI/auth diagnostics tests but failed one unrelated existing email test because local `VIRLY_EMAIL_FROM` is `Virly <verify@auth.ayal.online>` while `server/src/email.service.test.ts` expects `Virly <verify@example.com>`.
- Passed: `env VIRLY_EMAIL_FROM='Virly <verify@example.com>' npm run test --workspace server` outside the sandbox, confirming 80/80 tests pass when the email sender is set to the test default.

Next milestone:

- Phase 2: tolerant transfer draft extraction so one malformed extracted field does not discard the whole draft.

## 2026-06-03 - Phase 2: Tolerant Transfer Draft Extraction

Status: implemented.

Task name:

- Phase 2: Tolerant Transfer Draft Extraction.

Planned change:

- Replace strict all-or-nothing transfer draft parsing with field-level normalization.
- Preserve valid transfer slots even when `recipientEmail` is a display label, pronoun, or other non-email reference.
- Keep transfer execution and confirmation behavior unchanged.

Files changed:

- `server/src/ai/llm.ts`
- `server/src/ai/graph.ts`
- `server/src/ai/state.ts`
- `server/src/ai/tests/aiSafety.test.ts`
- `docs/ai-tool-plan-steps-v2.md`

Implementation summary:

- Added `TransferDraftExtraction` for provider output that may carry internal diagnostics before becoming a strict graph draft.
- Replaced the strict LLM transfer draft schema with a permissive raw schema and explicit normalization.
- Added field-level normalization for recipient email, recipient reference, amount, amount reference text, currency, booleans, and reason.
- Extracts exactly one explicit email from display labels such as `Nikola Jokic (jokic@nuggets.com)`.
- Downgrades non-email `recipientEmail` values such as `him` to `recipientReference`.
- Preserves `amount`, `amountReferenceText`, `currency`, and `reason` when recipient extraction is malformed.
- Applies the same normalizer at the graph boundary so custom or fake providers cannot bypass field-level validation.
- Records `draft_partial_recovered` diagnostics when an invalid `recipientEmail` is downgraded.
- Updated the transfer draft prompt to tell the LLM not to put display labels or masked labels in `recipientEmail`.

Tests added or updated:

- `transfer draft normalization extracts a single email from display labels`
- `transfer draft normalization downgrades invalid recipient email to reference`
- `transfer draft normalization preserves contextual amounts when recipient is invalid`
- `malformed llm recipient preserves valid transfer amount in graph`

Commands run:

- `npm run build --workspace server`
- `npx tsx --test src/ai/tests/aiSafety.test.ts`
- `env VIRLY_EMAIL_FROM='Virly <verify@example.com>' npm run test --workspace server`

Results:

- Passed: `npm run build --workspace server`
- Initial focused `npx tsx --test src/ai/tests/aiSafety.test.ts` hit the sandbox `/tmp/tsx-1000/*.pipe` IPC permission issue.
- Passed: `npx tsx --test src/ai/tests/aiSafety.test.ts` outside the sandbox, confirming 74/74 focused AI tests pass.
- Passed: `env VIRLY_EMAIL_FROM='Virly <verify@example.com>' npm run test --workspace server` outside the sandbox, confirming 84/84 server tests pass when the email sender is set to the test default.

Assumptions made:

- Phase 2 should not resolve contextual amounts yet; it only preserves `amountReferenceText` for the later resolver phase.
- The public `/api/ai/chat` response contract remains unchanged.
- Backend transfer validation remains the authority for recipient, amount, currency, limits, and confirmation lifecycle.

Remaining follow-up work:

- Add deterministic pronoun and contextual amount capture from fallback parsing.
- Add backend contextual amount resolution before pending-transfer validation.
- Add broader reference resolution and read-only received-total coverage from later phases.

Blocked questions:

- None.

Next step:

## 2026-06-03 - Phase 12: Read-Only Question Phrase Coverage

Status: implemented.

Task name:

- Phase 12 second slice: cover the remaining read-only English/Hebrew question phrasing from the scenario matrix.

Planned change:

- Add direct regressions for the exact Phase 12 read-only question variants that were still thin in `aiSafety.test.ts`.
- Widen deterministic recent-counterparty routing so literal `today` and `היום` phrasing maps to the existing recent sent/received intents.

Files changed:

- `server/src/ai/router.ts`
- `server/src/ai/tests/aiSafety.test.ts`
- `docs/ai-tool-plan-steps-v2.md`

Implementation summary:

- Extended deterministic routing for:
  - `who did I send money to today?`
  - `who sent me money today?`
  - `למי העברתי היום?`
  - `מי העביר לי היום?`
- Kept the behavior conservative by mapping those phrases onto the existing:
  - `recent_sent_counterparties`
  - `recent_received_counterparties`
- Added direct Phase 12 regressions for exact matrix-style read-only phrasing:
  - English `today` recent-counterparty questions
  - Hebrew `today` recent-counterparty questions
  - Hebrew total follow-ups:
    - `כמה שלחתי לו?`
    - `כמה הוא שלח לי?`
  - memory-backed follow-ups:
    - `what is my net with him?`
    - `show activity with him`
- `tell me more about the second one` was already covered by existing transaction-detail follow-up tests, so this slice focused only on the uncovered matrix entries.

Tests added or updated:

- Added `phase 12 read-only today phrasing routes recent counterparty questions`.
- Added `phase 12 hebrew today phrasing routes recent counterparty questions`.
- Added `phase 12 hebrew read-only follow-ups resolve sent and received totals from memory`.
- Added `phase 12 read-only phrasing resolves net and activity follow-ups from memory`.

Commands run:

- `npx tsx --test src/ai/tests/aiSafety.test.ts`
- `npm run build --workspace server`
- `env VIRLY_EMAIL_FROM='Virly <verify@example.com>' npm run test --workspace server`
- `git diff --check`

Results:

- Passed: `npx tsx --test src/ai/tests/aiSafety.test.ts`, confirming 115/115 focused AI tests pass.
- Passed: `npm run build --workspace server`.
- Passed: `env VIRLY_EMAIL_FROM='Virly <verify@example.com>' npm run test --workspace server`, confirming 125/125 server tests pass.
- Failed: `git diff --check` due to unrelated existing trailing whitespace in `server/src/middleware/auth.ts:19`.

Assumptions made:

- Literal `today` / `היום` phrasing for recent counterparties should reuse the existing recent sent/received read-only flows rather than forcing a separate date-filtered tool path in Phase 12.
- For total, net, and activity follow-ups, existing remembered counterparty context remains the correct deterministic source.

Remaining follow-up work:

- Decide whether any additional Phase 12 recipient-reference phrasing is still missing from direct regression coverage.
- Reassess whether the next aligned move is more matrix coverage or beginning the Phase 13 evaluation harness.

Blocked questions:

- None.

Next step:

- Phase 3 or the next smallest prerequisite from the implementation order: deterministic pronoun and amount-reference capture before contextual amount resolution.

## 2026-06-03 - Implementation Order Step 3: Deterministic Pronoun And Amount-Reference Capture

Status: implemented.

Task name:

- Add deterministic pronoun and amount-reference capture.

Planned change:

- Extend deterministic fallback parsing so transfer requests and follow-ups preserve pronoun references and contextual amount phrases when no LLM extraction is available or when fallback routing is used.
- Keep contextual amount resolution out of scope for this step.

Files changed:

- `server/src/ai/graph.ts`
- `server/src/ai/router.ts`
- `server/src/ai/counterpartyMemory.ts`
- `server/src/ai/tests/aiSafety.test.ts`
- `docs/ai-tool-plan-steps-v2.md`

Implementation summary:

- Added deterministic transfer draft capture for English pronouns and repeated-recipient phrases such as `he`, `she`, `they`, `him again`, `same person`, and `same recipient`.
- Added deterministic amount-reference capture for phrases such as `same amount`, `same amount he sent me`, `what he sent me`, `אותה כמות`, `אותו סכום`, `כמו קודם`, and related Hebrew variants.
- Updated deterministic routing so transfer commands with contextual amount phrases still classify as `transfer_prepare` even when no numeric amount is present.
- Extended deterministic counterparty memory resolution so English pronouns and same-recipient wording resolve to the last remembered counterparty.
- Preserved safety behavior: contextual amount references are stored as text only and still require later backend resolution before any pending transfer can be created.

Tests added or updated:

- `deterministic counterparty resolver handles english pronouns from memory`
- `deterministic mixed-language pronoun transfer resolves last counterparty`
- `deterministic transfer parser preserves contextual amount references`

Commands run:

- `npm run build --workspace server`
- `npx tsx --test src/ai/tests/aiSafety.test.ts`
- `env VIRLY_EMAIL_FROM='Virly <verify@example.com>' npm run test --workspace server`

Results:

- Passed: `npm run build --workspace server`
- Initial focused AI test run exposed a deterministic router gap: `send him the same amount he sent me` classified as `unsupported`.
- Fixed the router gap and reran focused tests.
- Passed: `npx tsx --test src/ai/tests/aiSafety.test.ts`, confirming 77/77 focused AI tests pass.
- Passed: `env VIRLY_EMAIL_FROM='Virly <verify@example.com>' npm run test --workspace server`, confirming 87/87 server tests pass when the email sender is set to the test default.

Assumptions made:

- This step should preserve contextual amount text but not resolve it to a number.
- Ambiguous contextual amount requests should continue to clarify rather than create an `AiPendingTransfer`.
- Read-only received-total tooling remains a later phase.

Remaining follow-up work:

- Add a backend `resolveContextualAmounts` step before pending-transfer validation.
- Add received-from counterparty amount tools for questions like `how much did he send me?`.
- Add broader unified request/reference objects from later phases.

Blocked questions:

- None.

Next step:

- Implement contextual amount resolution through backend-scoped transaction facts, without allowing chat text to execute transfers.

## 2026-06-03 - Phase 6: Contextual Amount Resolver

Status: implemented.

Task name:

- Phase 6: Contextual Amount Resolver.

Planned change:

- Resolve preserved `amountReferenceText` into a numeric ILS amount before transfer preparation.
- Use authenticated, user-scoped backend transaction facts.
- Keep unresolved contextual amounts non-mutating and clarification-only.

Files changed:

- `server/src/ai/amountResolution.ts`
- `server/src/ai/graph.ts`
- `server/src/ai/state.ts`
- `server/src/ai/tests/aiSafety.test.ts`
- `docs/ai-tool-plan-steps-v2.md`

Implementation summary:

- Added `ResolvedAmountRef`, `AmountResolutionInput`, `AmountResolutionResult`, and `AmountResolutionService` contracts.
- Added `resolveContextualAmount`, which classifies contextual amount phrases and resolves:
  - latest received transaction for references like `same amount he sent me`
  - latest sent transaction for references like `what I sent him last time`
  - active pending transfer amount for generic `same amount` when one exists
- Scoped default transaction lookup by authenticated `ownerId`, normalized `counterpartyEmail`, and transaction `type`.
- Added graph node `resolveContextualAmounts` before `prepareTransferConfirmation`.
- The resolver fills `transferDraft.amount` only after backend resolution.
- Unresolved references record diagnostics and continue to the existing missing-amount clarification path without creating an `AiPendingTransfer`.
- Kept `prepareAiPendingTransfer` unchanged so it still receives a numeric amount only.

Tests added or updated:

- `amount reference classifier maps directional references`
- `default contextual amount resolver scopes latest received lookup by user and counterparty`
- `contextual amount resolver fills transfer amount before preparation`
- `unresolved contextual amount does not create a pending transfer`
- Updated the earlier contextual amount preservation test to inject an unresolved resolver instead of accidentally touching Mongo in a unit-style graph test.

Commands run:

- `npm run build --workspace server`
- `npx tsx --test src/ai/tests/aiSafety.test.ts`
- `env VIRLY_EMAIL_FROM='Virly <verify@example.com>' npm run test --workspace server`
- `git diff --check`

Results:

- Passed: `npm run build --workspace server`
- Initial focused AI run exposed that an older preservation test now reached the default Mongo-backed resolver and timed out without a database connection.
- Fixed that test by injecting an unresolved amount resolver.
- Passed: `npx tsx --test src/ai/tests/aiSafety.test.ts`, confirming 81/81 focused AI tests pass.
- Passed: `env VIRLY_EMAIL_FROM='Virly <verify@example.com>' npm run test --workspace server`, confirming 91/91 server tests pass when the email sender is set to the test default.
- Passed: `git diff --check`.

Assumptions made:

- This slice resolves latest matching transaction amounts, not totals; total sent/received support remains a later read-only tooling phase.
- Generic `same amount` prefers active pending transfer amount; otherwise it falls back to latest sent transaction with the resolved counterparty.
- If no resolved counterparty or matching transaction exists, the assistant must clarify and must not create a pending transfer.

Remaining follow-up work:

- Add read-only received-from and net-total tools for questions like `how much did he send me?`.
- Add broader unified request/reference objects and a general conversation reference resolver.
- Add richer ambiguity handling for contextual amounts where multiple interpretations are plausible.

Blocked questions:

- None.

Next step:

- Implement read-only received-from counterparty amount coverage, starting with backend-only intent/tool support for total received from a resolved counterparty.

## 2026-06-03 - Phase 7: Received-From Counterparty Total Tool

Status: implemented.

Task name:

- Phase 7 backend-only slice: total received from a resolved counterparty.

Planned change:

- Add read-only support for questions like `How much did he send me?` and `How much has Daniel paid me?`.
- Reuse existing counterparty memory and resolver behavior.
- Add only a backend aggregate tool; no chat API shape change, no transfer behavior change, and no new money-movement path.

Files changed:

- `server/src/ai/state.ts`
- `server/src/ai/router.ts`
- `server/src/ai/llm.ts`
- `server/src/ai/graph.ts`
- `server/src/ai/toolInputs.ts`
- `server/src/ai/tools/getTotalReceivedFromCounterparty.ts`
- `server/src/ai/tools/index.ts`
- `server/src/ai/tests/aiSafety.test.ts`
- `docs/ai-tool-plan-steps-v2.md`

Implementation summary:

- Added `counterparty_total_received` as an assistant intent.
- Added `getTotalReceivedFromCounterparty` as an allowlisted read-only assistant tool.
- Registered the new tool in the server AI tool registry.
- Implemented the Mongo aggregate as authenticated-user scoped and counterparty scoped:
  - `ownerId` is derived from `context.userId`.
  - `counterpartyEmail` is normalized before matching.
  - `type` is fixed to `credit`.
  - The pipeline returns total amount and count only.
- Added deterministic routing for English and Hebrew received-total questions.
- Extended the LLM classifier prompt with received-total examples and precedence guidance.
- Reused existing graph counterparty resolution:
  - Pronoun and memory references can resolve before tools run.
  - Named received-total requests can run `resolveCounterpartyCandidates` before the total tool.
  - If the graph already resolved the counterparty, the resolver tool is skipped for this intent.
- Added full read-only tool context wiring for `getTotalReceivedFromCounterparty`.
- Kept public chat response shape unchanged.

Tests added or updated:

- `received-total follow-up is read-only and resolves from memory`
- `named received-total request resolves counterparty before total tool`
- `received-total tool aggregates credits by authenticated user and counterparty`
- Updated fake AI tool executors to include `getTotalReceivedFromCounterparty`.

Commands run:

- `npx tsx --test src/ai/tests/aiSafety.test.ts`
- `npm run build --workspace server`
- `npm run build --workspace client`
- `env VIRLY_EMAIL_FROM='Virly <verify@example.com>' npm run test --workspace server`
- `git diff --check`

Results:

- Initial focused AI test run exposed that deterministic received-total routing missed `did he send me` and named wording like `Daniel paid me`.
- Fixed routing to include present-tense `send` and named received-total phrasing.
- Second focused AI run exposed that `getTotalReceivedFromCounterparty` was missing from `buildToolInput` and received only minimal context.
- Fixed tool-input wiring so the new tool receives `resolvedCounterparty`, memory, slots, and date range context.
- Third focused AI run exposed that the pre-tool counterparty resolver clarified before the named received-total resolver tool could run.
- Fixed graph gating so unresolved names can fall through to `resolveCounterpartyCandidates` when that resolver tool is explicitly in the route.
- Passed: `npx tsx --test src/ai/tests/aiSafety.test.ts`, confirming 84/84 focused AI tests pass.
- Passed: `npm run build --workspace server`.
- Passed: `env VIRLY_EMAIL_FROM='Virly <verify@example.com>' npm run test --workspace server`, confirming 94/94 server tests pass when the email sender is set to the test default.
- Passed: `git diff --check`.

Assumptions made:

- This slice should answer total received from one resolved counterparty only.
- Net totals, broader read-only tools, OpenAPI updates, and client typing remain later Phase 7 work.
- Existing user-visible summaries may include full emails where the current app already does that, but tool summaries and metadata continue to use masked/sanitized values for assistant context.

Remaining follow-up work:

- Add net-total or combined sent/received counterparty tooling if Phase 7 still requires it.
- Add OpenAPI/client type coverage for any new public API surface if later phases expose one.
- Continue toward unified request/reference objects and broader conversation reference resolution.

Blocked questions:

- None.

Next step:

- Continue Phase 7 with the next read-only counterparty amount capability or move to the next smallest prerequisite from `docs/ai-improvement-v2.md`.

## 2026-06-03 - Phase 7: Net-With-Counterparty Tool

Status: implemented.

Task name:

- Phase 7 backend-only slice: net total with a resolved counterparty.

Planned change:

- Add read-only support for questions like `What is the net between me and him?`, `What is my net with Daniel?`, and `מה הנטו בינינו?`.
- Reuse existing counterparty memory and resolver behavior.
- Add only a backend aggregate tool; no chat API shape change, no transfer behavior change, and no new money-movement path.

Files changed:

- `server/src/ai/state.ts`
- `server/src/ai/router.ts`
- `server/src/ai/llm.ts`
- `server/src/ai/graph.ts`
- `server/src/ai/toolInputs.ts`
- `server/src/ai/tools/getNetWithCounterparty.ts`
- `server/src/ai/tools/index.ts`
- `server/src/ai/tests/aiSafety.test.ts`
- `docs/ai-tool-plan-steps-v2.md`

Implementation summary:

- Added `counterparty_net_total` as an assistant intent.
- Added `getNetWithCounterparty` as an allowlisted read-only assistant tool.
- Registered the new tool in the server AI tool registry.
- Implemented the Mongo aggregate as authenticated-user scoped and counterparty scoped:
  - `ownerId` is derived from `context.userId`.
  - `counterpartyEmail` is normalized before matching.
  - `type` is limited to `credit` and `debit`.
  - The pipeline groups by transaction type and returns totals and counts only.
- Defined net as `receivedAmount - sentAmount`.
- Added deterministic routing for English and Hebrew net-total questions.
- Extended the LLM classifier prompt with net-total examples and precedence guidance.
- Reused existing graph counterparty resolution:
  - Pronoun and memory references can resolve before tools run.
  - Named net-total requests can run `resolveCounterpartyCandidates` before the net tool.
  - If the graph already resolved the counterparty, the resolver tool is skipped for this intent.
- Added full read-only tool context wiring for `getNetWithCounterparty`.
- Kept public chat response shape unchanged.

Tests added or updated:

- `net-total follow-up is read-only and resolves from memory`
- `named net-total request resolves counterparty before net tool`
- `net-total tool aggregates credits and debits by authenticated user and counterparty`
- Updated fake AI tool executors to include `getNetWithCounterparty`.

Commands run:

- `npx tsx --test src/ai/tests/aiSafety.test.ts`
- `npm run build --workspace server`
- `npm run build --workspace client`
- `env VIRLY_EMAIL_FROM='Virly <verify@example.com>' npm run test --workspace server`
- `git diff --check`

Results:

- Passed: `npx tsx --test src/ai/tests/aiSafety.test.ts`, confirming 87/87 focused AI tests pass.
- Passed: `npm run build --workspace server`.
- Passed: `env VIRLY_EMAIL_FROM='Virly <verify@example.com>' npm run test --workspace server`, confirming 97/97 server tests pass when the email sender is set to the test default.
- Passed: `git diff --check`.

Assumptions made:

- Net total means total received from the counterparty minus total sent to the counterparty.
- Positive net means the counterparty has sent the user more than the user sent them.
- This slice remains backend-only because `/api/ai/chat` already exposes tool call status generically and the public response shape is unchanged.

Remaining follow-up work:

- Store totals and net totals in answer-frame memory so later transfer references can say `send him that amount`.
- Add broader unified request/reference objects and a general conversation reference resolver.
- Revisit OpenAPI/client type coverage only if later phases add a new public API shape.

Blocked questions:

- None.

Next step:

- Move to Phase 8 memory upgrades for answer-frame totals, starting with persisting total/net amount entities from read-only tool results.

## 2026-06-03 - Phase 8: Total Answer Memory Entities

Status: implemented.

Task name:

- Phase 8 backend-only slice: persist total answer-frame memory.

Planned change:

- Store successful read-only total answers as structured internal memory so later phases can resolve follow-ups like `send him that amount`.
- Attach answer-frame query context for counterparty, direction, and amount role.
- Keep this internal-only: no chat API shape change, no transfer behavior change, and no new money-movement path.

Files changed:

- `server/src/ai/state.ts`
- `server/src/ai/toolMemory.ts`
- `server/src/ai/graph.ts`
- `server/src/ai/tools/getTotalSentToCounterparty.ts`
- `server/src/ai/tools/getTotalReceivedFromCounterparty.ts`
- `server/src/ai/tools/getNetWithCounterparty.ts`
- `server/src/ai/tests/aiSafety.test.ts`
- `docs/ai-tool-plan-steps-v2.md`

Implementation summary:

- Extended `AiToolMemoryUpdate` with `totals`.
- Added `total` to `ConversationEntityType`.
- Added total-specific memory fields:
  - `counterpartyEmail`
  - `direction`
  - `sourceToolName`
  - `amount`
  - `currency`
- Added answer-frame query-context fields:
  - `counterpartyEmail`
  - `amountRole`
- Updated `applyToolMemoryUpdates` to persist total entities from read-only tool results.
- Updated total sent, total received, and net-total tools to emit `totals` memory updates only when the aggregate has at least one matching transaction.
- Added deterministic answer-frame query context for successful total sent, total received, and net-total tool answers.
- Kept full counterparty email values internal to persisted memory and used generic or masked aliases for total references.

Tests added or updated:

- `read-only total answers persist total entity and answer-frame query context`
- Updated fake AI total tools to emit total memory updates matching the real tools.

Commands run:

- `npx tsx --test src/ai/tests/aiSafety.test.ts`
- `npm run build --workspace server`
- `env VIRLY_EMAIL_FROM='Virly <verify@example.com>' npm run test --workspace server`
- `git diff --check`

Results:

- Initial focused AI test run failed on a syntax error in the new conditional `totals` memory blocks for received/net tools.
- Fixed the extra bracket in both tools and reran focused tests.
- Passed: `npx tsx --test src/ai/tests/aiSafety.test.ts`, confirming 88/88 focused AI tests pass.
- Passed: `npm run build --workspace server`.
- Passed: `env VIRLY_EMAIL_FROM='Virly <verify@example.com>' npm run test --workspace server`, confirming 98/98 server tests pass when the email sender is set to the test default.
- Passed: `git diff --check`.

Assumptions made:

- `AiConversation.memory.entities` and `answerFrames` already use mixed schemas, so no Mongo migration is required for this internal memory extension.
- Total memory entities should be recorded only for successful aggregate answers with at least one matching transaction.
- Net-total answer-frame direction is stored as `both` because the query context direction type does not need a separate public `net` direction for this slice.

Remaining follow-up work:

- Teach contextual amount resolution to use the latest total answer entity for references like `that amount`.
- Add clarification/resume support for ambiguous amount scope from Phase 9.
- Continue toward broader unified request/reference objects from Phases 3 and 5.

Blocked questions:

- None.

Next step:

- Implement the next Phase 8/Phase 6 bridge: resolve `that amount` or `that total` from the latest total answer entity without creating a transfer unless backend validation and confirmation creation succeed.

## 2026-06-03 - Phase 8/6 Bridge: Resolve Total Answer Amount References

Status: implemented.

Task name:

- Resolve `that amount` / `that total` from total answer memory.

Planned change:

- Use the total entities added in Phase 8 to resolve transfer follow-ups such as `send him that amount`.
- Keep transfer safety unchanged: chat text can only prepare a pending confirmation through backend validation and cannot execute money movement.

Files changed:

- `server/src/ai/state.ts`
- `server/src/ai/amountResolution.ts`
- `server/src/ai/graph.ts`
- `server/src/ai/router.ts`
- `server/src/ai/tests/aiSafety.test.ts`
- `docs/ai-tool-plan-steps-v2.md`

Implementation summary:

- Added `last_answer_total_net` to `ResolvedAmountRef.source`.
- Extended `classifyAmountReference` to recognize:
  - `that amount`
  - `that total`
  - `that net`
  - `the last amount`
  - `the previous total`
  - Hebrew variants such as `הסכום הזה`, `הסכום האחרון`, and `הנטו הזה`
- Added resolver support for `last_answer_total` references.
- The resolver now searches persisted `total` entities by recency.
- If a counterparty is resolved, total lookup is scoped to that counterparty and does not infer from unrelated counterparties.
- Only positive total amounts are usable for transfer preparation; zero or negative totals remain unresolved.
- Added deterministic transfer extraction for total-answer amount phrases.
- Updated deterministic transfer routing so `send him that amount` classifies as `transfer_prepare` even without a numeric amount.

Tests added or updated:

- Extended `amount reference classifier maps directional references` to include `that amount` and `that total`.
- `contextual amount resolver uses latest positive total answer for resolved counterparty`
- `transfer can resolve that amount from latest total answer memory`

Commands run:

- `npx tsx --test src/ai/tests/aiSafety.test.ts`
- `npm run build --workspace server`
- `env VIRLY_EMAIL_FROM='Virly <verify@example.com>' npm run test --workspace server`
- `git diff --check`

Results:

- Passed: `npx tsx --test src/ai/tests/aiSafety.test.ts`, confirming 90/90 focused AI tests pass.
- Passed: `npm run build --workspace server`.
- Passed: `env VIRLY_EMAIL_FROM='Virly <verify@example.com>' npm run test --workspace server`, confirming 100/100 server tests pass when the email sender is set to the test default.
- Passed: `git diff --check`.

Assumptions made:

- `that amount` should use the latest positive matching total entity.
- If a resolved counterparty exists, totals from other counterparties must not be used.
- Signed net totals are safe for transfer preparation only when the stored amount is positive.

Remaining follow-up work:

- Add explicit clarification/resume behavior for ambiguous amount scope from Phase 9.
- Expand amount-reference handling for `the total he sent me` as a clarification reply after ambiguity.
- Continue toward broader unified request/reference objects from Phases 3 and 5.

Blocked questions:

- None.

Next step:

- Move to Phase 9 clarification/resume flow for amount scope and ambiguous references.

## 2026-06-03 - Phase 9: Amount-Scope Clarification Resume Metadata

Status: implemented.

Task name:

- Phase 9 first slice: amount-scope clarification with resume metadata.

Planned change:

- Start the clarification/resume flow by preserving enough state when a transfer amount reference is ambiguous.
- If a user asks for `same amount` while a prior total-answer memory exists, ask which amount scope they mean instead of silently choosing one.
- Keep transfer safety unchanged: no pending transfer is created until an amount is resolved and backend transfer validation succeeds.

Files changed:

- `server/src/ai/state.ts`
- `server/src/ai/amountResolution.ts`
- `server/src/ai/graph.ts`
- `server/src/ai/tests/aiSafety.test.ts`
- `docs/ai-tool-plan-steps-v2.md`

Implementation summary:

- Added optional `resumeIntent` and `resumeDraft` to `ClarificationRequest`.
- Added `amount_scope` as a supported clarification reply type.
- Added resolver detection for `ambiguous_amount_scope` when:
  - the request is a generic same-amount reference
  - there is no active pending transfer amount to reuse
  - a positive matching total answer entity exists
- Added graph handling for `ambiguous_amount_scope`.
- The graph now asks an `ambiguous_amount` clarification with:
  - `expectedReplyType: "amount_scope"`
  - options for `last_sent_transaction` and `last_answer_total`
  - `resumeIntent: "transfer_prepare"`
  - the current `resumeDraft`
- The clarification is saved into conversation memory through the existing conversation save path.

Tests added or updated:

- `contextual amount resolver flags same-amount ambiguity when total answer exists`
- `ambiguous same-amount transfer stores amount-scope clarification with resume draft`

Commands run:

- `npx tsx --test src/ai/tests/aiSafety.test.ts`
- `npm run build --workspace server`
- `env VIRLY_EMAIL_FROM='Virly <verify@example.com>' npm run test --workspace server`
- `git diff --check`

Results:

- Passed: `npx tsx --test src/ai/tests/aiSafety.test.ts`, confirming 92/92 focused AI tests pass.
- Passed: `npm run build --workspace server`.
- Passed: `env VIRLY_EMAIL_FROM='Virly <verify@example.com>' npm run test --workspace server`, confirming 102/102 server tests pass when the email sender is set to the test default.
- Passed: `git diff --check`.

Assumptions made:

- This slice records enough structured state to resume later, but does not yet interpret the user's follow-up clarification answer.
- An active pending transfer amount remains the highest-priority interpretation for generic `same amount`.
- When no active pending transfer exists and a total answer exists, generic `same amount` is ambiguous enough to require clarification.

Remaining follow-up work:

- Implement the next Phase 9 slice: consume `amount_scope` clarification replies and resume the saved transfer draft.
- Add clarification resolution diagnostics for `clarification_resolved`.
- Continue toward broader unified request/reference objects from Phases 3 and 5.

Blocked questions:

- None.

Next step:

- Implement amount-scope clarification answer handling so replies like `the previous answer total` resume the saved transfer preparation safely.

## 2026-06-03 - Phase 9: Amount-Scope Clarification Answer Handling

Status: implemented.

Task name:

- Consume `amount_scope` clarification replies and resume transfer preparation.

Planned change:

- When the prior turn stored an `amount_scope` clarification with a saved transfer draft, interpret replies such as `the previous answer total`.
- Resume the saved `transfer_prepare` draft through the normal backend amount resolution and transfer preparation path.
- Preserve transfer safety: the resumed flow can create only a pending confirmation card and cannot execute money movement from chat text.

Files changed:

- `server/src/ai/graph.ts`
- `server/src/ai/tests/aiSafety.test.ts`
- `docs/ai-tool-plan-steps-v2.md`

Implementation summary:

- Added `resolveClarificationReply` graph node after conversation loading and before intent classification.
- The node recognizes `amount_scope` clarification replies when memory includes:
  - `expectedReplyType: "amount_scope"`
  - `resumeIntent: "transfer_prepare"`
  - a saved `resumeDraft`
- Added deterministic amount-scope selection for:
  - previous answer total / that total / that amount
  - last sent amount / last transfer
  - Hebrew variants for total and last-transfer wording
- For previous-answer-total selection, the node rewrites the saved draft amount reference to `that amount`.
- For last-sent selection, the node rewrites the saved draft amount reference to `what I sent him last time`.
- The node restores the saved recipient reference against counterparty memory before preparation.
- Classification and transfer-draft extraction now skip when the resume node has already restored an intent and draft.
- Added `clarification_resolved` diagnostics for successful clarification reply handling.
- Cleared saved clarification state after successful resume.

Tests added or updated:

- `amount-scope clarification reply resumes transfer with previous answer total`

Commands run:

- `npx tsx --test src/ai/tests/aiSafety.test.ts`
- `npm run build --workspace server`
- `env VIRLY_EMAIL_FROM='Virly <verify@example.com>' npm run test --workspace server`
- `git diff --check`

Results:

- Initial focused AI test run showed the resumed amount resolved, but recipient resolution was missing because the follow-up reply text did not contain the saved pronoun.
- Fixed the resume node to resolve the saved draft recipient reference from conversation memory.
- Passed: `npx tsx --test src/ai/tests/aiSafety.test.ts`, confirming 93/93 focused AI tests pass.
- Passed: `npm run build --workspace server`.
- Passed: `env VIRLY_EMAIL_FROM='Virly <verify@example.com>' npm run test --workspace server`, confirming 103/103 server tests pass when the email sender is set to the test default.
- Passed: `git diff --check`.

Assumptions made:

- This slice handles `amount_scope` clarification replies only; broader recipient and transaction clarification resume remains existing behavior or later work.
- The saved resume draft is authoritative for transfer intent after an `amount_scope` reply.
- The resumed transfer still goes through contextual amount resolution and `prepareAiPendingTransfer`.

Remaining follow-up work:

- Add broader clarification resume handling for recipient and amount-scope wording like `the total he sent me`.
- Continue toward a general conversation reference resolver from Phase 5.
- Add safer response post-checks from Phase 10.

Blocked questions:

- None.

Next step:

- Move to Phase 10 response safety: add deterministic response fact checks so the LLM cannot contradict transfer/account facts.

## 2026-06-03 - Phase 10: Response Post-Check Safety

Status: implemented.

Task name:

- Phase 10 first slice: deterministic response post-check.

Planned change:

- Add a backend post-check at the LLM response boundary.
- Reject LLM responses that claim chat text sent, confirmed, approved, completed, submitted, or processed money movement.
- Reject LLM responses that still expose a known masked label when a full user-visible label is available.
- Fall back to deterministic response wording when the post-check fails.

Files changed:

- `server/src/ai/graph.ts`
- `server/src/ai/tests/aiSafety.test.ts`
- `docs/ai-tool-plan-steps-v2.md`

Implementation summary:

- Added response post-check helpers in `graph.ts`:
  - `hasUnsafeMoneyMovementClaim`
  - `hasMaskedLabelLeak`
  - `getResponsePostCheckFailure`
- Applied the post-check after LLM response composition and after user-visible label hydration.
- If the check fails, the graph uses the deterministic fallback response.
- Added a `deterministic_fallback_used` diagnostic with `response_post_check_failed:<reason>`.
- Kept deterministic transfer-preparation and transfer-modification response behavior unchanged.

Tests added or updated:

- `llm response post-check rejects chat-confirmation money movement claims`

Commands run:

- `npx tsx --test src/ai/tests/aiSafety.test.ts`
- `npm run build --workspace server`
- `env VIRLY_EMAIL_FROM='Virly <verify@example.com>' npm run test --workspace server`
- `git diff --check`

Results:

- Passed: `npx tsx --test src/ai/tests/aiSafety.test.ts`, confirming 94/94 focused AI tests pass.
- Passed: `npm run build --workspace server`.
- Passed: `env VIRLY_EMAIL_FROM='Virly <verify@example.com>' npm run test --workspace server`, confirming 104/104 server tests pass when the email sender is set to the test default.
- Passed: `git diff --check`.

Assumptions made:

- This is the first Phase 10 slice, not the full required-facts framework.
- The money-movement claim check targets present-tense/completion claims, not historical summaries such as `you sent 42.00 in total`.
- Label hydration runs before masked-label leak checking.

Remaining follow-up work:

- Split responder input into `safeToolSummaries`, `safeConversationSummary`, `safeResolvedReferences`, and `requiredResponseFacts`.
- Add deterministic required-fact checks for balances, amounts, recipients, dates, and statuses.
- Add broader response contradiction tests for read-only tool facts.

Blocked questions:

- None.

Next step:

- Continue Phase 10 with required response facts for read-only tool amounts and balances.

## 2026-06-03 - Phase 10: Required Read-Only Amount Facts

Status: implemented.

Task name:

- Phase 10 second slice: required response facts for read-only amounts and balances.

Planned change:

- Make successful read-only tool amounts deterministic response facts.
- Reject LLM-composed responses that omit or change required balance and aggregate amount values.
- Keep the public chat response shape unchanged and use deterministic wording as the fallback.

Files changed:

- `server/src/ai/graph.ts`
- `server/src/ai/tools/getAccountBalance.ts`
- `server/src/ai/tests/aiSafety.test.ts`
- `docs/ai-tool-plan-steps-v2.md`

Implementation summary:

- Added `amount` metadata to `getAccountBalance` so account balances are available as structured backend facts.
- Added response post-check helpers that collect finite numeric values from successful tool result metadata fields:
  - `amount`
  - `sentAmount`
  - `receivedAmount`
  - `netAmount`
- Normalized response numbers to cents for exact matching across forms such as `125` and `125.00`.
- If an LLM response misses a required amount fact, the graph falls back to the deterministic response and records `response_post_check_failed:missing_required_amount_fact`.
- Kept this check internal to response composition; `/api/ai/chat` output shape is unchanged.

Tests added or updated:

- `llm response post-check preserves required balance amount facts`
- `llm response post-check preserves required aggregate amount facts`
- Updated the fake account balance tool to emit `metadata.amount`.

Commands run:

- `npx tsx --test src/ai/tests/aiSafety.test.ts`
- `npm run build --workspace server`
- `env VIRLY_EMAIL_FROM='Virly <verify@example.com>' npm run test --workspace server`
- `git diff --check`

Results:

- Passed: `npx tsx --test src/ai/tests/aiSafety.test.ts`, confirming 96/96 focused AI tests pass.
- Passed: `npm run build --workspace server`.
- Passed: `env VIRLY_EMAIL_FROM='Virly <verify@example.com>' npm run test --workspace server`, confirming 106/106 server tests pass when the email sender is set to the test default.
- Passed: `git diff --check`.

Assumptions made:

- This slice checks successful tool-result numeric facts only.
- It intentionally does not yet split responder input into separate `safeToolSummaries`, `safeConversationSummary`, `safeResolvedReferences`, and `requiredResponseFacts` objects.
- The first contradiction guard is exact required-fact presence; richer date, recipient, status, and semantic contradiction checks remain later Phase 10 work.

Remaining follow-up work:

- Add required fact checks for recipients, dates, statuses, and transfer-confirmation details.
- Split the response composer input into explicit safe summaries and required facts.
- Add tests for read-only date/status/recipient contradiction.

Blocked questions:

- None.

Next step:

- Continue Phase 10 with response fact checks for recipients, dates, statuses, and explicit transfer-confirmation details.

## 2026-06-03 - Phase 10: Safe Responder Input Split

Status: implemented.

Task name:

- Phase 10 third slice: split responder input into safe summaries and deterministic required facts.

Planned change:

- Replace the broad response prompt surface with explicit safe responder inputs.
- Move masked tool summaries, sanitized conversation snippets, safe resolved references, and deterministic required facts into graph-built input fields.
- Keep the existing response post-check as the backend fallback guard.

Files changed:

- `server/src/ai/state.ts`
- `server/src/ai/toolResults.ts`
- `server/src/ai/graph.ts`
- `server/src/ai/llm.ts`
- `server/src/ai/tests/aiSafety.test.ts`
- `docs/ai-tool-plan-steps-v2.md`

Implementation summary:

- Added responder-input types:
  - `SafeToolSummary`
  - `SafeConversationSummary`
  - `SafeResolvedReferences`
  - `RequiredResponseFact`
- Moved sanitized tool-summary building into `toolResults.ts` so the graph can hand the responder pre-sanitized metadata instead of raw tool results.
- Added graph helpers to build:
  - masked recent conversation snippets via `sanitizeMessagesForLlm`
  - masked transfer-draft and confirmation references
  - deterministic required amount facts from successful tool-result metadata
- Updated `ComposeAssistantResponseInput` so `composeResponse` now receives only the explicit safe fields plus `fallbackMessage`.
- Switched the LLM response prompt to use:
  - `safeToolSummaries`
  - `safeConversationSummary`
  - `safeResolvedReferences`
  - `requiredResponseFacts`
- Reused the new `requiredResponseFacts` list in the amount post-check so the prompt contract and contradiction guard share one deterministic fact source.

Tests added or updated:

- Updated `llm sees masked assistant context and masked tool summaries while the user sees full emails` to assert the new safe conversation summary is masked.
- Added `llm responder input includes deterministic required amount facts`.

Commands run:

- `npx tsx --test src/ai/tests/aiSafety.test.ts`
- `npm run build --workspace server`
- `env VIRLY_EMAIL_FROM='Virly <verify@example.com>' npm run test --workspace server`
- `git diff --check`

Results:

- Passed: `npx tsx --test src/ai/tests/aiSafety.test.ts`, confirming 97/97 focused AI tests pass.
- Passed: `npm run build --workspace server`.
- Passed: `env VIRLY_EMAIL_FROM='Virly <verify@example.com>' npm run test --workspace server`, confirming 107/107 server tests pass when the email sender is set to the test default.
- Passed: `git diff --check`.

Assumptions made:

- This slice formalizes safe responder inputs but still limits `requiredResponseFacts` to deterministic amount facts for now.
- The responder no longer needs raw `messages`, `toolResults`, `resolvedCounterparty`, `transferDraft`, or `confirmation` because the graph now provides their masked/safe equivalents.
- Existing response post-check behavior remains the enforcement boundary if the LLM still contradicts facts.

Remaining follow-up work:

- Extend `requiredResponseFacts` beyond amounts to recipients, dates, statuses, and explicit transfer-confirmation details.
- Add contradiction checks for those new fact kinds.
- Add focused tests for recipient/date/status contradiction and confirmation-detail wording.

Blocked questions:

- None.

Next step:

- Continue Phase 10 by extending deterministic required response facts and post-check coverage to recipients, dates, statuses, and confirmation details.

## 2026-06-03 - Phase 10: Recipient Date And Status Fact Checks

Status: implemented.

Task name:

- Phase 10 fourth slice: deterministic recipient/date/status facts and contradiction checks.

Planned change:

- Extend `requiredResponseFacts` beyond amounts to structured recipient, date, and status facts.
- Source those facts from transaction rows, pending-transfer rows, and pending confirmation state instead of parsing summaries.
- Reject only explicit contradictions in LLM responses, not omissions.

Files changed:

- `server/src/ai/state.ts`
- `server/src/ai/tools/transactionHelpers.ts`
- `server/src/ai/tools/pendingTransferHelpers.ts`
- `server/src/ai/graph.ts`
- `server/src/ai/tests/aiSafety.test.ts`
- `docs/ai-tool-plan-steps-v2.md`

Implementation summary:

- Extended `ToolResultMetadata.transactions` and `ToolResultMetadata.pendingTransfers` to carry structured `status` fields where available.
- Extended `RequiredResponseFact` with:
  - `recipient`
  - `date`
  - `status`
- Added graph-side fact extraction from structured tool `data` objects and arrays:
  - transaction rows contribute recipient, occurred-at date, and completed status facts
  - pending-transfer rows contribute recipient, expires-at date, and pending status facts
  - active pending confirmation state contributes recipient, pending status, and expiry facts
- Added contradiction-only post-check helpers:
  - reject full-email mentions that do not match required recipient emails
  - reject explicit status words that contradict required statuses
  - reject explicit ISO-style dates that contradict required dates
- Kept the existing amount fact check unchanged and preserved deterministic fallback as the backend enforcement boundary.

Tests added or updated:

- Added `llm responder input includes deterministic recipient date and status facts`
- Added `llm response post-check rejects contradictory transaction status and date facts`
- Added `llm response post-check rejects contradictory pending-transfer recipient facts`
- Updated phase-three and phase-four fake tool payloads so transaction receipt and pending-transfer results expose the same structured fields the real graph now reads.

Commands run:

- `npx tsx --test src/ai/tests/aiSafety.test.ts`
- `npm run build --workspace server`
- `env VIRLY_EMAIL_FROM='Virly <verify@example.com>' npm run test --workspace server`
- `git diff --check`

Results:

- Passed: `npx tsx --test src/ai/tests/aiSafety.test.ts`, confirming 100/100 focused AI tests pass.
- Passed: `npm run build --workspace server`.
- Passed: `env VIRLY_EMAIL_FROM='Virly <verify@example.com>' npm run test --workspace server`, confirming 110/110 server tests pass when the email sender is set to the test default.
- Passed: `git diff --check`.

Assumptions made:

- This slice treats recipient/date/status checks as contradiction guards only; the LLM may omit those facts as long as it does not state conflicting ones.
- Recipient contradiction currently keys off explicit full-email mentions because that is deterministic and lower risk than name-only matching.
- Date contradiction currently keys off ISO-style dates already used in deterministic tool/user summaries.

Remaining follow-up work:

- Extend contradiction checks to richer recipient-label and non-ISO date wording if the product needs looser natural phrasing without losing backend guarantees.
- Add deterministic fact coverage for confirmation-detail wording that is still skipped today because transfer-prepare responses bypass the responder.
- Continue Phase 10 with any remaining confirmation-detail and recipient-label checks, or move to Phase 11 streaming once the response-safety boundary is judged sufficient.

Blocked questions:

- None.

Next step:

- Continue Phase 10 with any remaining confirmation-detail safety checks, then reassess whether Phase 11 streaming can start without weakening the backend safety boundary.

## 2026-06-03 - Phase 10: Currency Fact Checks

Status: implemented.

Task name:

- Phase 10 sixth slice: deterministic currency facts and contradiction checks.

Planned change:

- Extend `requiredResponseFacts` with structured currency facts.
- Source currency facts from read-only transaction data and pending confirmation state.
- Reject explicit contradictory currency mentions in LLM-composed responses while keeping omission tolerance unchanged.

Files changed:

- `server/src/ai/state.ts`
- `server/src/ai/graph.ts`
- `server/src/ai/tests/aiSafety.test.ts`
- `docs/ai-tool-plan-steps-v2.md`

Implementation summary:

- Added `kind: "currency"` to `RequiredResponseFact`.
- Extended structured fact collection so transaction and pending-transfer tool `data` can contribute deterministic `currency` facts.
- Extended pending confirmation fact building so confirmation state contributes `confirmation.currency`.
- Added a currency detector for explicit `ILS`/`NIS`/`shekel`, `USD`/`dollar`/`$`, and `EUR`/`euro`/`€` mentions.
- Added a response post-check branch for `contradicting_required_currency_fact`, so the responder can still omit currency wording but cannot explicitly swap one supported currency for another.
- Kept the Phase 10 safety boundary internal only: no `/api/ai/chat` response shape changes and no new user-visible debug channel.

Tests added or updated:

- Updated `llm responder input includes deterministic recipient date and status facts` to assert `getTransactionReceipt.currency`.
- Updated `llm responder input includes pending confirmation memory facts` to assert `confirmation.currency`.
- Added `llm response post-check rejects contradictory transaction currency facts`.
- Added `llm response post-check rejects contradictory pending confirmation currency facts`.

Commands run:

- `npx tsx --test src/ai/tests/aiSafety.test.ts`
- `npm run build --workspace server`
- `env VIRLY_EMAIL_FROM='Virly <verify@example.com>' npm run test --workspace server`
- `git diff --check`

Results:

- Passed: `npx tsx --test src/ai/tests/aiSafety.test.ts`, confirming 104/104 focused AI tests pass.
- Passed: `npm run build --workspace server`.
- Passed: `env VIRLY_EMAIL_FROM='Virly <verify@example.com>' npm run test --workspace server`, confirming 114/114 server tests pass when the email sender is set to the test default.
- Failed: `git diff --check` due to unrelated existing trailing whitespace in `server/src/middleware/auth.ts:19`.

Assumptions made:

- Phase 10 only needs contradiction checks for explicitly mentioned supported currencies; silence is still allowed.
- Normalizing common currency aliases and symbols into `ILS`, `USD`, and `EUR` is sufficient for the current assistant domain.
- Unsupported or ambiguous currency wording should continue to fall through without adding new inference behavior in this phase.

Remaining follow-up work:

- Extend contradiction checks to richer recipient-label and non-ISO date wording if the product needs broader natural-language guarantees.
- Decide whether pending confirmation status should get a richer deterministic fallback that restates safe details instead of the current generic reminder.
- Reassess whether any material Phase 10 response-safety gaps remain before starting Phase 11 streaming.

Blocked questions:

- None.

Next step:

- Audit the remaining Phase 10 gaps and decide whether one more confirmation-detail slice is warranted before moving to Phase 11 streaming.

## 2026-06-03 - Phase 10: Pending Confirmation Memory Fact Coverage

Status: implemented.

Task name:

- Phase 10 fifth slice: use persisted pending confirmation memory as a deterministic responder fact source.

Planned change:

- Feed `counterpartyMemory.pendingConfirmation` into the same safe responder-input path as fresh `state.confirmation`.
- Add required amount/recipient/status/date facts from pending confirmation memory when no fresh confirmation object exists.
- Reuse the existing contradiction checks so `pending_confirmation_status` cannot hallucinate conflicting details.

Files changed:

- `server/src/ai/state.ts`
- `server/src/ai/graph.ts`
- `server/src/ai/tests/aiSafety.test.ts`
- `docs/ai-tool-plan-steps-v2.md`

Implementation summary:

- Broadened `SafeTransferConfirmation.status` so it can represent persisted confirmation-memory statuses, not only fresh `pending` confirmation objects.
- Updated the graph confirmation sanitizer to accept either:
  - the current-turn `state.confirmation`
  - the persisted `counterpartyMemory.pendingConfirmation`
- When building `safeResolvedReferences`, the graph now falls back to pending confirmation memory if no fresh confirmation object exists.
- Extended `buildRequiredResponseFacts` so pending confirmation memory contributes:
  - `confirmation.amount`
  - `confirmation.recipient`
  - `confirmation.status`
  - `confirmation.expiresAt`
- Preserved source precedence: if `state.confirmation` exists in the current turn, it remains the authoritative source over persisted memory.

Tests added or updated:

- Added `llm responder input includes pending confirmation memory facts`
- Added `llm response post-check rejects contradictory pending confirmation memory facts`

Commands run:

- `npx tsx --test src/ai/tests/aiSafety.test.ts`
- `npm run build --workspace server`
- `env VIRLY_EMAIL_FROM='Virly <verify@example.com>' npm run test --workspace server`
- `git diff --check`

Results:

- Passed: `npx tsx --test src/ai/tests/aiSafety.test.ts`, confirming 102/102 focused AI tests pass.
- Passed: `npm run build --workspace server`.
- Passed: `env VIRLY_EMAIL_FROM='Virly <verify@example.com>' npm run test --workspace server`, confirming 112/112 server tests pass when the email sender is set to the test default.
- Passed: `git diff --check`.

Assumptions made:

- Pending confirmation memory is a valid deterministic source for response-safety checks during `pending_confirmation_status`.
- Contradiction checks remain omission-tolerant; this slice prevents conflicting details but does not require the LLM to restate the pending confirmation facts.
- For the current safety boundary, the generic deterministic fallback message for `pending_confirmation_status` is acceptable when contradiction is detected.

Remaining follow-up work:

- Consider whether `pending_confirmation_status` should eventually have a richer deterministic fallback that repeats safe confirmation details instead of the current generic non-authorization reminder.
- Extend recipient contradiction checks beyond explicit full-email mentions if richer label-level guarantees are needed.
- Reassess whether any material Phase 10 safety gaps remain before starting Phase 11 streaming.

Blocked questions:

- None.

Next step:

- Audit the remaining Phase 10 requirements against the current code and decide whether one more confirmation-detail slice is needed or whether the next aligned move is Phase 11 streaming.

## 2026-06-03 - Phase 10: Currency Fact Checks

Status: implemented.

Task name:

- Phase 10 sixth slice: deterministic currency facts and contradiction checks.

Planned change:

- Extend `requiredResponseFacts` with explicit currency facts from structured tool data and confirmation state.
- Reject LLM responses that restate the correct amount with the wrong currency.
- Keep the existing contradiction-only model: missing currency restatement is allowed, conflicting currency restatement is not.

Files changed:

- `server/src/ai/state.ts`
- `server/src/ai/graph.ts`
- `server/src/ai/tests/aiSafety.test.ts`
- `docs/ai-tool-plan-steps-v2.md`

Implementation summary:

- Added `currency` as a `RequiredResponseFact` kind.
- Extended graph-side fact extraction so structured tool `data` objects contribute currency facts when they expose `currency`.
- Added confirmation currency facts from both:
  - fresh `state.confirmation`
  - persisted `counterpartyMemory.pendingConfirmation`
- Added a currency contradiction check that maps explicit response mentions to canonical currencies:
  - `ILS` / `NIS` / `shekel` / `₪`
  - `USD` / `dollar` / `$`
  - `EUR` / `euro` / `€`
- If the LLM mentions an explicit currency that does not match the deterministic allowed currency facts, the graph falls back with `response_post_check_failed:contradicting_required_currency_fact`.

Tests added or updated:

- Extended `llm responder input includes deterministic recipient date and status facts` to assert `getTransactionReceipt.currency`.
- Extended `llm responder input includes pending confirmation memory facts` to assert `confirmation.currency`.
- Added `llm response post-check rejects contradictory transaction currency facts`.
- Added `llm response post-check rejects contradictory pending confirmation currency facts`.

Commands run:

- `npx tsx --test src/ai/tests/aiSafety.test.ts`
- `npm run build --workspace server`
- `env VIRLY_EMAIL_FROM='Virly <verify@example.com>' npm run test --workspace server`
- `git diff --check`

Results:

- Passed: `npx tsx --test src/ai/tests/aiSafety.test.ts`, confirming 104/104 focused AI tests pass.
- Passed: `npm run build --workspace server`.
- Passed: `env VIRLY_EMAIL_FROM='Virly <verify@example.com>' npm run test --workspace server`, confirming 114/114 server tests pass when the email sender is set to the test default.
- Failed: `git diff --check` due to unrelated existing trailing whitespace in `server/src/middleware/auth.ts:19`.

Assumptions made:

- Currency contradiction should key off explicit currency mentions only; silence is still allowed.
- Canonical currency detection for Phase 10 can stay narrow and deterministic instead of attempting fuzzy natural-language parsing.
- The unrelated whitespace issue in `server/src/middleware/auth.ts` should not be edited as part of this AI-response safety slice.

Remaining follow-up work:

- Decide whether Phase 10 needs stronger recipient-label and non-ISO date contradiction coverage before moving to streaming.
- Decide whether `pending_confirmation_status` should eventually use a richer deterministic fallback that includes safe confirmation details.
- Reassess whether any material response-safety gaps remain, or whether the next aligned move is Phase 11 streaming.

Blocked questions:

- None.

Next step:

- Audit the remaining Phase 10 requirements against the current code and choose between one final response-safety slice or starting Phase 11 streaming.

## 2026-06-03 - Phase 10: Masked Recipient Hydration Coverage

Status: implemented.

Task name:

- Phase 10 seventh slice: close masked-recipient leak paths in responder hydration and post-check coverage.

Planned change:

- Extend user-visible response hydration to replace bare masked recipient emails when tool data or confirmation state already has a fuller user label.
- Expand masked-label leak detection to inspect tool result data and active confirmation state, not only resolved/memorized counterparties.
- Add focused regressions for pending-transfer rows and pending confirmation memory.

Files changed:

- `server/src/ai/graph.ts`
- `server/src/ai/tests/aiSafety.test.ts`
- `docs/ai-tool-plan-steps-v2.md`

Implementation summary:

- Added `buildUserVisibleRecipientLabel(...)` in the graph to deterministically derive a user-visible recipient label from confirmation state.
- Extended `collectResponseLabelReplacements(...)` to map `recipientEmailMasked` to `recipientLabel` when tool data exposes both fields.
- Extended `hydrateUserVisibleResponse(...)` so active confirmation state contributes:
  - bare masked email -> full user label
  - masked name-plus-email label -> full user label
- Expanded `hasMaskedLabelLeak(...)` so it now checks masked labels coming from:
  - resolved counterparty state
  - conversation memory counterparties
  - tool result data replacements
  - active confirmation state
- This closes the concrete leak where the LLM could answer with bare `a***@example.com` for a pending transfer or pending confirmation even though the backend already knew `Alex Example (alex@example.com)`.

Tests added or updated:

- Updated the fake pending-transfer fixture to include `recipientEmailMasked`, matching the real row shape used by the hydration fix.
- Added `llm response hydration replaces bare masked pending-transfer recipients`.
- Added `llm response hydration replaces bare masked pending confirmation recipients`.

Commands run:

- `npx tsx --test src/ai/tests/aiSafety.test.ts`
- `npm run build --workspace server`
- `env VIRLY_EMAIL_FROM='Virly <verify@example.com>' npm run test --workspace server`
- `git diff --check`

Results:

- Passed: `npx tsx --test src/ai/tests/aiSafety.test.ts`, confirming 106/106 focused AI tests pass.
- Passed: `npm run build --workspace server`.
- Passed: `env VIRLY_EMAIL_FROM='Virly <verify@example.com>' npm run test --workspace server`, confirming 116/116 server tests pass when the email sender is set to the test default.
- Failed: `git diff --check` due to unrelated existing trailing whitespace in `server/src/middleware/auth.ts:19`.

Assumptions made:

- If backend state already contains a full recipient label, replacing a masked email with that label is correct for user-visible output.
- Pending confirmation memory without a stored name should still hydrate to the full email, since that is the deterministic backend-known user label.
- The unrelated whitespace issue in `server/src/middleware/auth.ts` should remain untouched during AI response-safety work.

Remaining follow-up work:

- Reassess whether Phase 10 still needs broader recipient-label contradiction checks beyond exact masked-email replacement.
- Decide whether `pending_confirmation_status` should use a richer deterministic fallback that restates safe confirmation details instead of the current generic reminder.
- If the remaining Phase 10 gaps are now minor, start the Phase 11 streaming compatibility path next.

Blocked questions:

- None.

Next step:

- Audit the remaining Phase 10 requirements against the current code and decide whether to take one final small response-safety slice or start Phase 11 streaming.

## 2026-06-03 - Phase 11: Streaming Compatibility Path

Status: implemented.

Task name:

- Phase 11 first slice: add a compatibility-safe backend streaming path with progress phases and final result delivery.

Planned change:

- Preserve the existing `POST /api/ai/chat` JSON endpoint unchanged.
- Add a new streaming endpoint that emits status-only phase events during graph execution and the final assistant result after completion.
- Keep streamed progress deterministic and non-sensitive: no account facts, no premature transfer claims, and no confirmation execution from chat text.

Files changed:

- `server/src/ai/state.ts`
- `server/src/ai/graph.ts`
- `server/src/routes/ai.routes.ts`
- `server/src/ai/tests/aiSafety.test.ts`
- `client/src/lib/types.ts`
- `openapi.yaml`
- `docs/ai-tool-plan-steps-v2.md`

Implementation summary:

- Added shared server-side streaming phase types:
  - `accepted`
  - `understanding_request`
  - `resolving_context`
  - `checking_account_facts`
  - `preparing_confirmation`
  - `composing_response`
  - `completed`
- Added `RunAssistantOptions.onProgress` and wired graph node execution to emit deterministic progress callbacks without changing the existing `RunAssistantResult`.
- Mapped graph nodes to user-safe phases:
  - intent parsing nodes -> `understanding_request`
  - transfer/reference/context resolution nodes -> `resolving_context`
  - read-only tool execution -> `checking_account_facts`
  - transfer preparation/modification nodes -> `preparing_confirmation`
  - response generation -> `composing_response`
- Added `POST /api/ai/chat/stream` as an SSE endpoint that:
  - emits `status` events for unique phases
  - emits a final `result` event with the same payload shape as `POST /api/ai/chat`
  - emits `completed` only after the final result event
- Kept the existing `POST /api/ai/chat` route and response contract unchanged.
- Added client-facing stream event types in `client/src/lib/types.ts` and documented the streaming route in `openapi.yaml`.
- Deliberately left the floating chat widget unwired in this slice; this step establishes the backend contract and shared types first.

Tests added or updated:

- Added `assistant graph progress reports ordered streaming-safe phases`.
- Added `missing authentication fails safely on the chat stream endpoint`.
- Added `chat stream endpoint rejects an invalid assistant id`.

Commands run:

- `npx tsx --test src/ai/tests/aiSafety.test.ts`
- `npm run build --workspace server`
- `env VIRLY_EMAIL_FROM='Virly <verify@example.com>' npm run test --workspace server`
- `git diff --check`

Results:

- Passed: `npx tsx --test src/ai/tests/aiSafety.test.ts`, confirming 109/109 focused AI tests pass.
- Passed: `npm run build --workspace server`.
- Passed: `npm run build --workspace client`.
- Passed: `env VIRLY_EMAIL_FROM='Virly <verify@example.com>' npm run test --workspace server`, confirming 119/119 server tests pass when the email sender is set to the test default.
- Failed: `git diff --check` due to unrelated existing trailing whitespace in `server/src/middleware/auth.ts:19`.

Assumptions made:

- For the first streaming slice, phase-only progress events are sufficient; no partial assistant text is streamed yet.
- Progress phases may be deduplicated at the route layer even if multiple graph nodes map to the same phase.
- The floating chat widget should not consume the stream until the backend event contract is stable enough to wire safely.

Remaining follow-up work:

- Wire the floating chat widget to the new stream endpoint while preserving the existing non-streaming fallback path.
- Decide whether the client should render all stream phases or collapse some of them for a tighter UX.
- Extend streaming tests once the client integration exists, especially around confirmation cards and read-only result completion timing.

Blocked questions:

- None.

Next step:

- Implement the Phase 11 client-side stream consumer in the floating chat widget, using the new event types and preserving the existing `POST /api/ai/chat` fallback.

## 2026-06-03 - Phase 11: Floating Chat Stream Consumer

Status: implemented.

Task name:

- Phase 11 second slice: wire the floating chat widget to the streaming endpoint with a safe fallback to the existing JSON chat request.

Planned change:

- Add a client API helper for `POST /api/ai/chat/stream`.
- Show phase-only progress in the floating chat widget while a request is in flight.
- Use streaming only when browser stream support is available; otherwise keep using `POST /api/ai/chat`.

Files changed:

- `client/src/lib/api.ts`
- `client/src/components/ui/floating-chat-widget-shadcnui.tsx`
- `docs/ai-tool-plan-steps-v2.md`

Implementation summary:

- Added shared client-side SSE handling in `client/src/lib/api.ts`:
  - reused the same auth/CSRF header preparation as the JSON client
  - parsed `status`, `result`, and `error` SSE events
  - returned the final assistant result only after the stream completes successfully
- Added `supportsAiChatStreaming()` so the widget chooses the stream path only when browser stream primitives are available.
- Updated the floating chat widget request flow:
  - if streaming is supported, call `api.aiChatStream(...)`
  - if streaming is not supported, fall back to `api.aiChat(...)`
  - do not retry a started stream request through JSON, avoiding duplicate backend side effects such as repeated transfer-preparation cards
- Added in-flight phase labels to the existing typing indicator so the user sees:
  - starting
  - understanding request
  - resolving context
  - checking account facts
  - preparing confirmation
  - composing response
- Kept the existing assistant-message rendering behavior unchanged for final results, clarifications, and confirmation cards: they still appear only after the final response payload arrives.

Tests added or updated:

- No dedicated client test harness was evident for this widget flow, so this slice used build verification instead of adding a new ad hoc frontend test framework.
- Reused the existing server regression suite to confirm the new stream contract still matches the server behavior.

Commands run:

- `npm run build --workspace client`
- `npm run build --workspace server`
- `env VIRLY_EMAIL_FROM='Virly <verify@example.com>' npm run test --workspace server`
- `git diff --check`

Results:

- Passed: `npm run build --workspace client`.
- Passed: `npm run build --workspace server`.
- Passed: `env VIRLY_EMAIL_FROM='Virly <verify@example.com>' npm run test --workspace server`, confirming 119/119 server tests pass.
- Failed: `git diff --check` due to unrelated existing trailing whitespace in `server/src/middleware/auth.ts:19`.

Assumptions made:

- Browser stream support detection via `ReadableStream` and `TextDecoder` is sufficient for this client-side compatibility gate.
- Showing phase text next to the existing typing indicator is enough for the first UX pass; richer progress presentation can wait for a later refinement.
- Falling back only when stream support is unavailable is safer than retrying after a stream request has already started, because retrying could duplicate deterministic backend work.

Remaining follow-up work:

- Decide whether the widget should visually collapse or rename some phases for a shorter user-facing sequence.
- Consider adding a focused frontend test harness for the stream parser and widget request flow if this UI grows more complex.
- Extend the stream UX to handle future partial-text or richer event types only if the backend contract expands beyond phase-only progress.

Blocked questions:

- None.

Next step:

- Reassess whether Phase 11 needs any more UX polish now, or move on to Phase 12 scenario-matrix coverage.

## 2026-06-03 - Phase 12: Pending Confirmation Phrase Coverage

Status: implemented.

Task name:

- Phase 12 first slice: expand scenario-matrix coverage for pending confirmation phrasing and missing directional amount-reference phrases.

Planned change:

- Let contextual amount resolution run for `transfer_modify_pending` when the draft contains an amount reference but no numeric amount.
- Add regression coverage for:
  - `same recipient but 70`
  - `use the same amount as before`
  - missing English/Hebrew directional amount-reference phrases like `what he sent me` and `מה ששלחתי לו`

Files changed:

- `server/src/ai/graph.ts`
- `server/src/ai/tests/aiSafety.test.ts`
- `docs/ai-tool-plan-steps-v2.md`

Implementation summary:

- Extended `resolveContextualAmounts` so it runs for both:
  - `transfer_prepare`
  - `transfer_modify_pending`
- This enables safe reuse of the active pending confirmation amount when a modification request carries a contextual amount reference such as `same as before`.
- Added scenario-matrix regressions proving:
  - `same recipient but 70` updates only the amount while preserving the active pending recipient
  - `use the same amount as before` reuses the active pending confirmation amount through deterministic backend resolution
  - `classifyAmountReference(...)` recognizes additional English/Hebrew directional variants:
    - `what he sent me`
    - `מה שהוא שלח לי`
    - `מה ששלחתי לו`
    - `same as before`

Tests added or updated:

- Extended `amount reference classifier maps directional references`.
- Added `pending transfer modification keeps the same recipient when the user says same recipient but 70`.
- Added `pending transfer modification can reuse the same amount as before`.

Commands run:

- `npx tsx --test src/ai/tests/aiSafety.test.ts`
- `npm run build --workspace server`
- `env VIRLY_EMAIL_FROM='Virly <verify@example.com>' npm run test --workspace server`
- `git diff --check`

Results:

- Passed: `npx tsx --test src/ai/tests/aiSafety.test.ts`, confirming 111/111 focused AI tests pass.
- Passed: `npm run build --workspace server`.
- Passed: `env VIRLY_EMAIL_FROM='Virly <verify@example.com>' npm run test --workspace server`, confirming 121/121 server tests pass.
- Failed: `git diff --check` due to unrelated existing trailing whitespace in `server/src/middleware/auth.ts:19`.

Assumptions made:

- For `transfer_modify_pending`, `same as before` should resolve against the active pending confirmation amount before any broader memory-based interpretation.
- Preserving the current pending recipient when the modification request does not supply a resolved replacement recipient is the correct deterministic behavior.
- This slice stays focused on phrasing coverage and a small deterministic resolution gap; broader eval harness work remains a later phase.

Remaining follow-up work:

- Expand Phase 12 coverage to the remaining read-only Hebrew/English natural-language matrix entries.
- Add scenario coverage for recipient-change modification phrasing such as `send it to Sarah instead`.
- Decide when to start Phase 13 eval fixtures versus continuing to widen direct `aiSafety.test.ts` scenario coverage.

Blocked questions:

- None.

Next step:

- Continue Phase 12 by covering more realistic read-only and transfer-preparation phrasing from the scenario matrix, or start Phase 13 if the direct regression matrix is broad enough.

## 2026-06-03 - Phase 12: Pending Recipient Replacement Coverage

Status: implemented.

Task name:

- Phase 12 third slice: support and cover pending-confirmation recipient replacement phrasing such as `send it to Sarah instead`.

Planned change:

- Verify whether `transfer_modify_pending` can resolve a new named recipient safely.
- If unresolved recipient references currently bypass modification checks, route them through the existing read-only counterparty resolver before any modification service call.
- Add regressions for both successful and ambiguous recipient replacement.

Files changed:

- `server/src/ai/graph.ts`
- `server/src/ai/router.ts`
- `server/src/ai/tests/aiSafety.test.ts`
- `docs/ai-tool-plan-steps-v2.md`

Implementation summary:

- Added a graph-local requested-tool helper so `transfer_modify_pending` can dynamically request `resolveCounterpartyCandidates` when:
  - the modification draft contains a recipient reference
  - there is no explicit recipient email
  - no recipient has already been resolved
- Moved `routeReadOnlyTools` earlier in the graph so any read-only resolution needed for the current turn happens before transfer preparation or pending-transfer modification.
- Added a deterministic pending-confirmation recipient fallback for phrases like `same recipient`, so pending modification can safely reuse the active confirmation recipient without depending on generic counterparty history.
- Fixed a real classifier bug where `send it to Sarah instead` was being swallowed by the generic `pending_confirmation_status` rule because `send it` matched before the modification rule.
- Added regressions proving:
  - a named replacement recipient can be resolved through the read-only resolver before modification
  - an ambiguous replacement recipient stops before modification and asks for clarification
  - the existing `same recipient but 70` modification path still resolves to the active pending recipient after the new routing changes

Tests added or updated:

- Added `pending transfer modification can change recipient when the user says send it to Sarah instead`.
- Added `ambiguous pending transfer recipient replacement asks for clarification before modification`.
- Updated `pending transfer modification keeps the same recipient when the user says same recipient but 70`.

Commands run:

- `npx tsx --test src/ai/tests/aiSafety.test.ts`
- `npm run build --workspace server`
- `env VIRLY_EMAIL_FROM='Virly <verify@example.com>' npm run test --workspace server`
- `git diff --check`

Results:

- Passed: `npx tsx --test src/ai/tests/aiSafety.test.ts`, confirming 117/117 focused AI tests pass.
- Passed: `npm run build --workspace server`.
- Passed: `env VIRLY_EMAIL_FROM='Virly <verify@example.com>' npm run test --workspace server`, confirming 127/127 server tests pass.
- Failed: `git diff --check` due to unrelated existing trailing whitespace in `server/src/middleware/auth.ts:19`.

Assumptions made:

- Using the existing read-only `resolveCounterpartyCandidates` tool inside `transfer_modify_pending` is acceptable because it does not mutate state and only resolves the intended recipient before a still-confirmation-gated modification.
- Dynamic resolver routing is safer than broadening the static `transfer_modify_pending` tool map because the resolver is only needed when a new recipient reference is actually present.
- When a pending modification says `same recipient`, the active pending confirmation recipient is the correct deterministic source of truth even if that recipient is not present in broader counterparty memory.

Remaining follow-up work:

- Verify whether any additional Phase 12 recipient-reference phrases still need direct regressions once this replacement path is covered.
- Reassess whether the next aligned step is more scenario-matrix coverage or starting the Phase 13 evaluation harness.

Blocked questions:

- None.

Next step:

- Either finish any remaining Phase 12 recipient-reference matrix gaps, or start Phase 13 by scaffolding the eval fixtures and runner if the direct scenario coverage is broad enough.

## 2026-06-03 - Phase 13: Deterministic Eval Scaffold

Status: implemented.

Task name:

- Phase 13 first slice: scaffold deterministic eval fixtures and a runnable harness so regression detection is easier than manual chat testing.

Planned change:

- Add typed eval fixture support under `server/src/ai/evals/`.
- Create the four planned conversation fixture files from `docs/ai-improvement-v2.md`.
- Add a deterministic eval test that loads the fixtures and runs them against the current graph using the existing fake tool/test harness.
- Add a shell wrapper script so the eval suite can be run directly without remembering the focused test command.

Files changed:

- `server/src/ai/evals/types.ts`
- `server/src/ai/evals/loadFixtures.ts`
- `server/src/ai/evals/conversations.transfer-context.json`
- `server/src/ai/evals/conversations.counterparty-history.json`
- `server/src/ai/evals/conversations.hebrew-mixed.json`
- `server/src/ai/evals/conversations.pending-confirmations.json`
- `server/src/ai/tests/aiSafety.test.ts`
- `scripts/ai-eval-chat.sh`
- `docs/ai-tool-plan-steps-v2.md`

Implementation summary:

- Added typed eval fixture definitions covering:
  - per-turn expectations from the Phase 13 plan
  - optional remembered-counterparty setup
  - optional pending-confirmation setup
  - optional counterparty-resolver override for deterministic recipient-change scenarios
- Added a fixture loader that reads and validates the planned JSON fixture files.
- Added the first deterministic fixture suites for:
  - transfer context
  - counterparty history
  - Hebrew/mixed phrasing
  - pending confirmations
- Added a focused regression test, `phase 13 deterministic eval fixtures pass against graph`, that:
  - loads the fixture files
  - builds scenario-specific fake tools and memory
  - runs each turn through `runAssistantGraph(...)`
  - asserts intent, tool calls, confirmation fields, clarification presence, and required/forbidden message fragments
- Added `scripts/ai-eval-chat.sh` as a wrapper for the focused deterministic eval suite.

Tests added or updated:

- Added `phase 13 deterministic eval fixtures pass against graph`.

Commands run:

- `npx tsx --test src/ai/tests/aiSafety.test.ts`
- `npm run build --workspace server`
- `chmod +x scripts/ai-eval-chat.sh`
- `./scripts/ai-eval-chat.sh`
- `env VIRLY_EMAIL_FROM='Virly <verify@example.com>' npm run test --workspace server`
- `git diff --check`

Results:

- Passed: `npx tsx --test src/ai/tests/aiSafety.test.ts`, confirming 118/118 focused AI tests pass after adding the deterministic eval suite.
- Passed: `npm run build --workspace server`.
- Passed: `./scripts/ai-eval-chat.sh` after rerunning unsandboxed because `tsx` IPC pipe creation under `/tmp` was blocked by the sandbox.
- Passed: `env VIRLY_EMAIL_FROM='Virly <verify@example.com>' npm run test --workspace server`, confirming 128/128 server tests pass.
- Failed: `git diff --check` due to unrelated existing trailing whitespace in `server/src/middleware/auth.ts:19`.

Assumptions made:

- The first Phase 13 slice can be deterministic-only; configured-LLM and seeded-Mongo eval modes can follow once the fixture format and baseline runner exist.
- It is acceptable for the deterministic fixture harness to live in `aiSafety.test.ts` initially, because it reuses the existing fake tools and keeps the first eval slice small and reviewable.
- Additional setup fields beyond the minimal per-turn expectation type are acceptable in the local fixture format when they are needed to model pending confirmations and deterministic resolver overrides.

Remaining follow-up work:

- Add the configured-LLM dev mode and seeded-Mongo mode promised by the Phase 13 plan.
- Decide whether to split the deterministic eval runner out of `aiSafety.test.ts` into a dedicated test or CLI module as the harness grows.
- Continue Phase 13 by widening fixture coverage to more multi-turn transfer-context and transaction-detail follow-up scenarios.

Blocked questions:

- None.

Next step:

- Extend Phase 13 beyond deterministic mode: either add a dedicated CLI runner around the same fixtures, or add the configured-LLM/seeded-data execution paths called for in the plan.

## 2026-06-03 - Phase 13: Shared Eval Runner And CLI Modes

Status: implemented.

Task name:

- Phase 13 second slice: move the deterministic fixture execution into a reusable runner and add a CLI entrypoint that can grow into deterministic and `llm-dev` eval modes.

Planned change:

- Add a shared eval runner under `server/src/ai/evals/runner.ts` instead of keeping all fixture execution logic embedded in `aiSafety.test.ts`.
- Add a small CLI entrypoint so the eval harness can be run directly from `scripts/ai-eval-chat.sh`.
- Keep deterministic mode as the default execution path.
- Scaffold `llm-dev` mode behind an explicit opt-in gate so live-provider evals do not run accidentally in tests or local shells that already have API credentials.

Files changed:

- `server/src/ai/evals/runner.ts`
- `server/src/ai/evals/cli.ts`
- `server/src/ai/tests/aiSafety.test.ts`
- `scripts/ai-eval-chat.sh`
- `docs/ai-tool-plan-steps-v2.md`

Implementation summary:

- Added `runAiEvalFixtures({ mode })` in `server/src/ai/evals/runner.ts`.
- Moved fixture execution concerns out of `aiSafety.test.ts`, including:
  - scenario conversation-store setup
  - fake tool selection
  - deterministic fake LLM behavior for pending-modification scenarios
  - fake transfer preparation/modification services
  - per-turn failure collection and summary reporting
- Added `server/src/ai/evals/cli.ts` with `--mode deterministic|llm-dev`.
- Updated `scripts/ai-eval-chat.sh` to call the new CLI and default to `deterministic`.
- Fixed a real runner regression where the pending recipient-replacement fixture was using the default fake tool set and therefore never exposed `resolveCounterpartyCandidates`.
- The runner now auto-enables the richer counterparty-resolution fake tools when:
  - the scenario setup includes `counterpartyResolver`, or
  - a turn expects `resolveCounterpartyCandidates`
- Added an explicit guard for live-provider evals:
  - `llm-dev` now requires `VIRLY_AI_EVAL_ENABLE_LLM_DEV=true`
  - after that gate, it still requires a configured OpenAI provider from the existing backend config
- Kept the deterministic fixture test, but changed it to call the shared runner instead of duplicating eval wiring inside the test file.

Tests added or updated:

- Updated `phase 13 deterministic eval fixtures pass against graph` to use `runAiEvalFixtures({ mode: "deterministic" })`.
- Added `phase 13 llm-dev eval mode fails clearly when no configured provider is available`, covering the explicit live-eval guard/config failure path.

Commands run:

- `npx tsx --test src/ai/tests/aiSafety.test.ts`
- `node --import tsx ./src/ai/evals/cli.ts --mode deterministic`
- `npm run build --workspace server`
- `./scripts/ai-eval-chat.sh deterministic`
- `env VIRLY_EMAIL_FROM='Virly <verify@example.com>' npm run test --workspace server`
- `git diff --check`

Results:

- Passed: `npx tsx --test src/ai/tests/aiSafety.test.ts`, confirming 119/119 focused AI tests pass after switching to the shared runner.
- Passed: `node --import tsx ./src/ai/evals/cli.ts --mode deterministic`, confirming the reusable runner returns `failedTurns: 0` across 4 fixture files, 8 scenarios, and 8 turns.
- Passed: `npm run build --workspace server`.
- Passed: `./scripts/ai-eval-chat.sh deterministic`.
- Passed: `env VIRLY_EMAIL_FROM='Virly <verify@example.com>' npm run test --workspace server`, confirming 129/129 server tests pass.
- Failed: `git diff --check` due to unrelated existing trailing whitespace in `server/src/middleware/auth.ts:19`.

Assumptions made:

- Requiring `VIRLY_AI_EVAL_ENABLE_LLM_DEV=true` is acceptable for the Phase 13 dev-provider path because it prevents accidental live eval execution in shells that already expose `OPENAI_API_KEY`.
- Auto-selecting the counterparty-resolution fake tools based on scenario setup or expected tool calls is safer than forcing every resolver-dependent fixture to opt into a different preset manually.
- Keeping `llm-dev` as a scaffolded mode is sufficient for this slice even though the current verification only exercises the explicit guard path and deterministic mode.

Remaining follow-up work:

- Add a verified happy-path `llm-dev` run once you want live-provider evals in the normal workflow.
- Add the seeded-Mongo execution path promised by the Phase 13 plan.
- Expand fixture coverage beyond the current 8 deterministic turns as more transfer and read-only scenarios are locked down.

Blocked questions:

- None.

Next step:

- Continue Phase 13 by adding either the seeded-Mongo eval mode or the first explicitly enabled `llm-dev` happy-path run, depending on whether backend-state realism or live-model behavior is the next priority.

## 2026-06-04 - Phase 13: Seeded Mongo Eval Mode Scaffold

Status: implemented.

Task name:

- Phase 13 third slice: add a safe seeded-Mongo eval mode that uses real read-only tools and Mongo-backed conversation state, while failing closed unless a dedicated eval database is explicitly enabled.

Planned change:

- Extend the eval runner and CLI with a `seeded-mongo` mode.
- Move shared eval helpers out of `runner.ts` so deterministic and seeded modes can reuse the same conversation bootstrap and fake transfer services.
- Add a seeded Mongo helper that:
  - requires explicit opt-in
  - requires a dedicated `VIRLY_AI_EVAL_MONGO_URI`
  - seeds a minimal user/counterparty/transaction dataset that matches the current fixture expectations
  - uses the real Mongo conversation store plus the real read-only tool executors
- Add focused tests for the seeded-mode guard path and the seed-data shape.

Files changed:

- `server/src/ai/evals/support.ts`
- `server/src/ai/evals/seededMongo.ts`
- `server/src/ai/evals/runner.ts`
- `server/src/ai/evals/cli.ts`
- `server/src/ai/tests/aiSafety.test.ts`
- `docs/ai-tool-plan-steps-v2.md`

Implementation summary:

- Added `server/src/ai/evals/support.ts` for shared eval helpers:
  - remembered-counterparty memory bootstrap
  - pending-confirmation memory bootstrap
  - in-memory conversation store
  - fake transfer preparation/modification services
- Added `server/src/ai/evals/seededMongo.ts`.
- `seeded-mongo` now:
  - requires `VIRLY_AI_EVAL_ENABLE_MONGO=true`
  - requires `VIRLY_AI_EVAL_MONGO_URI`
  - seeds a minimal dataset with:
    - one authenticated eval user
    - named counterparties for Alex, Daniel, Sarah, and Maya
    - personal details used by label/display helpers
    - transactions that satisfy the current eval fixtures, including:
      - Alex total received = `35.00`
      - Daniel sent/received activity
      - a recent Sarah credit for the Hebrew recent-received case
  - seeds Mongo-backed conversation memory per scenario through `mongoConversationStore`
  - runs fixtures with the real read-only tool executors and the shared fake transfer confirmation services
  - drops the dedicated eval database before and after the run
- Extended `runAiEvalFixtures(...)` and the CLI parser to accept `seeded-mongo`.
- Tightened the seeded conversation bootstrap to use a full `CounterpartyMemory` shape after the first build exposed a partial-memory type mismatch.

Tests added or updated:

- Added `phase 13 seeded-mongo eval mode fails closed without explicit dedicated db opt-in`
- Added `phase 13 seeded-mongo seed data matches current fixture expectations`

Commands run:

- `npx tsx --test src/ai/tests/aiSafety.test.ts`
- `node --import tsx ./src/ai/evals/cli.ts --mode deterministic`
- `node --import tsx ./src/ai/evals/cli.ts --mode seeded-mongo`
- `npm run build --workspace server`
- `env VIRLY_EMAIL_FROM='Virly <verify@example.com>' npm run test --workspace server`
- `git diff --check`

Results:

- Passed: `npx tsx --test src/ai/tests/aiSafety.test.ts`, confirming `121/121` focused AI tests pass after adding the seeded-mode coverage.
- Passed: `node --import tsx ./src/ai/evals/cli.ts --mode deterministic`, confirming deterministic evals still return `failedTurns: 0` across `4` fixture files, `8` scenarios, and `8` turns.
- Passed: `node --import tsx ./src/ai/evals/cli.ts --mode seeded-mongo` in the expected fail-closed path, returning `Seeded Mongo eval mode requires VIRLY_AI_EVAL_ENABLE_MONGO=true.` because no dedicated eval DB was enabled in this shell.
- Passed: `npm run build --workspace server`.
- Passed: `env VIRLY_EMAIL_FROM='Virly <verify@example.com>' npm run test --workspace server`, confirming `131/131` server tests pass.
- Failed: `git diff --check` due to unrelated existing trailing whitespace in `server/src/middleware/auth.ts:19`.

Assumptions made:

- Seeded evals should never touch the default development database; requiring a dedicated `VIRLY_AI_EVAL_MONGO_URI` is safer than silently reusing `config.mongoUri`.
- For this slice, using real read-only tools and real Mongo conversation persistence is enough progress even though transfer confirmation preparation/modification still uses the shared fake services.
- A fail-closed seeded-Mongo CLI verification is acceptable in the current environment because no reachable dedicated Mongo eval database is configured, and the shell’s default localhost Mongo endpoint is not available.

Remaining follow-up work:

- Run a happy-path seeded-Mongo eval against an actual dedicated eval database once `VIRLY_AI_EVAL_ENABLE_MONGO=true` and `VIRLY_AI_EVAL_MONGO_URI` are available.
- Decide whether the next highest-value Phase 13 slice is:
  - a live `llm-dev` happy-path run, or
  - widening the seeded Mongo dataset and fixtures to more multi-turn read-only scenarios
- Consider whether pending-transfer database state should also be seeded later so more confirmation-list scenarios can use the real Mongo path end-to-end.

Blocked questions:

- None.

Next step:

- Continue Phase 13 with the first happy-path seeded-Mongo run against a dedicated eval database, or add the first explicitly enabled `llm-dev` happy-path run if live-model behavior is the higher priority.

## 2026-06-04 - Phase 13: Multi-Turn Fixture Expansion

Status: implemented.

Task name:

- Phase 13 fourth slice: widen deterministic eval coverage with multi-turn scenarios that exercise shared runner state, phase-three transaction tools, and transfer follow-ups from prior read-only answers.

Planned change:

- Add a phase-three transaction fake tool preset to the shared eval runner.
- Expand the deterministic fixture files beyond the initial single-turn coverage.
- Add at least one multi-turn transaction-detail follow-up scenario and one multi-turn transfer-follow-up scenario that depends on conversation memory.
- Keep the seeded-Mongo and `llm-dev` guard paths unchanged.

Files changed:

- `server/src/ai/evals/runner.ts`
- `server/src/ai/evals/conversations.transfer-context.json`
- `server/src/ai/evals/conversations.counterparty-history.json`
- `docs/ai-tool-plan-steps-v2.md`

Implementation summary:

- Added `createPhaseThreeTransactionTools(...)` to the shared eval runner, covering:
  - `searchTransactions`
  - `getTransactionStats`
  - `resolveTransactionReference`
  - `getTransactionReceipt`
- Extended `createToolsForScenario(...)` so fixture scenarios with `toolPreset: "phase_three_transactions"` now use the dedicated phase-three fake tool path.
- Added a new multi-turn transfer-context scenario:
  - turn 1: `how much did he send me?`
  - turn 2: `send him that amount`
- Added a new multi-turn transaction-detail scenario:
  - turn 1: `Show transfers over 100 from last week`
  - turn 2: `Tell me more about the second one`
- While verifying the new transfer follow-up scenario, found a real eval-harness mismatch:
  - the fake total tools returned amount summaries but did not emit the `memoryUpdates.totals` entries that the real graph uses to resolve `that amount`
  - fixed the fake `getTotalSentToCounterparty`, `getTotalReceivedFromCounterparty`, and `getNetWithCounterparty` implementations so the shared runner now mirrors the real memory behavior more closely

Tests added or updated:

- No new named `node:test` cases were needed.
- Expanded `phase 13 deterministic eval fixtures pass against graph` coverage from:
  - `4` fixture files, `8` scenarios, `8` turns
  to:
  - `4` fixture files, `10` scenarios, `12` turns

Commands run:

- `npx tsx --test src/ai/tests/aiSafety.test.ts`
- `node --import tsx ./src/ai/evals/cli.ts --mode deterministic`
- `npm run build --workspace server`
- `env VIRLY_EMAIL_FROM='Virly <verify@example.com>' npm run test --workspace server`
- `git diff --check`

Results:

- Passed: `npx tsx --test src/ai/tests/aiSafety.test.ts`, confirming focused AI tests remain green after the expanded fixture matrix.
- Passed: `node --import tsx ./src/ai/evals/cli.ts --mode deterministic`, confirming deterministic evals now return `failedTurns: 0` across `4` fixture files, `10` scenarios, and `12` turns.
- Passed: `npm run build --workspace server`.
- Passed: `env VIRLY_EMAIL_FROM='Virly <verify@example.com>' npm run test --workspace server`, confirming `131/131` server tests pass.
- Failed: `git diff --check` due to unrelated existing trailing whitespace in `server/src/middleware/auth.ts:19`.

Assumptions made:

- Expanding the existing deterministic fixture test is sufficient for this slice; separate named tests for each new fixture scenario would be redundant with the current harness design.
- The phase-three fake tool preset should mirror the existing direct `aiSafety.test.ts` fake transaction-tool behavior closely so the eval runner and focused direct tests do not drift.
- Updating fake total-tool memory writes is the correct fix because the regression was in harness fidelity, not in the backend graph behavior.

Remaining follow-up work:

- Run the first happy-path seeded-Mongo eval against a dedicated eval database.
- Run the first explicitly enabled `llm-dev` happy-path eval if live-model verification becomes available.
- Continue widening fixture coverage to more clarification resumes, pending-transfer list resolution, and transaction-detail follow-ups once the environment-backed eval modes are exercised.

Blocked questions:

- None.

Next step:

- Continue Phase 13 with either a dedicated-db seeded-Mongo happy-path run or a live `llm-dev` happy-path run, depending on which environment dependency becomes available first.

## 2026-06-04 - Phase 14: Assistant Contract Documentation

Status: implemented.

Task name:

- Phase 14 first slice: document the current assistant safety boundaries, graph subgraphs, scenario matrix, and eval runbook so future changes are less likely to drift from the implemented backend contract.

Planned change:

- Update `docs/ai-assistant.md` to describe:
  - graph subgraph boundaries
  - LLM-safe vs user-visible label rules
  - contextual amount resolution rules
  - clarification resume flow
  - the current scenario matrix
  - how to run focused assistant tests and eval modes
- Update `openapi.yaml` descriptions so the public AI routes describe the streaming progress contract and confirmation-only execution boundary more explicitly.
- Keep the slice documentation-only; do not claim unavailable env-backed eval happy paths are already operational.

Files changed:

- `docs/ai-assistant.md`
- `openapi.yaml`
- `docs/ai-tool-plan-steps-v2.md`

Implementation summary:

- Expanded `docs/ai-assistant.md` with new sections for:
  - `Subgraph Boundaries`
  - `Label Safety Rules`
  - `Contextual Amount Resolution Rules`
  - `Clarification Resume Flow`
  - `Scenario Matrix`
- Updated the doc’s route structure and API sections to include `POST /api/ai/chat/stream`.
- Added a concrete local runbook for:
  - focused AI assistant tests
  - deterministic eval fixtures
  - guarded `llm-dev` eval mode
  - guarded `seeded-mongo` eval mode
- Tightened `openapi.yaml` route descriptions for:
  - `POST /api/ai/chat`
  - `POST /api/ai/chat/stream`
  - `POST /api/ai/confirmations/{id}`
- Fixed one YAML syntax issue discovered during verification by quoting the clarification example string that contained a colon.

Tests added or updated:

- No code tests were added because this slice is documentation-only.
- Verification for this slice used contract/syntax checks instead of code tests.

Commands run:

- `ruby -e 'require "yaml"; YAML.load_file("openapi.yaml")'`
- `git diff --check`

Results:

- Passed: `ruby -e 'require "yaml"; YAML.load_file("openapi.yaml")'`
- Failed: `git diff --check` due to unrelated existing trailing whitespace in `server/src/middleware/auth.ts:19`

Assumptions made:

- A documentation-only Phase 14 slice does not require server or client test runs when no executable code changes are made.
- The current environment-backed eval limits should be documented as guarded modes, not as routinely runnable happy-path commands.
- `docs/ai-tool-plan-steps.md` can remain unchanged in this slice because the current safety-contract documentation work is centered in `docs/ai-assistant.md` and the active implementation log is tracked in `docs/ai-tool-plan-steps-v2.md`.

Remaining follow-up work:

- Continue Phase 14 by documenting any remaining OpenAPI schema-level AI contract details if needed.
- Return to Phase 13 environment-backed verification once a dedicated Mongo eval DB or live `llm-dev` path is available.
- Decide whether `docs/ai-tool-plan-steps.md` needs a brief pointer to the newer v2 implementation log or whether it should stay as historical phase history only.

Blocked questions:

- None.

Next step:

- Either continue Phase 14 with any remaining contract-doc cleanup, or resume Phase 13 by running the first happy-path seeded-Mongo or `llm-dev` eval once the required environment dependency is available.

## 2026-06-04 - Phase 14: Contract Drift Cleanup

Status: implemented.

Task name:

- Phase 14 second slice: fix documentation and OpenAPI drift so the published assistant contract matches the current graph order, supported intents, and tool surface.

Planned change:

- Compare `docs/ai-assistant.md` and `openapi.yaml` against the actual graph and state enums.
- Fix only real mismatches:
  - graph node order
  - supported intent list
  - counterparty resolver scope wording
  - OpenAPI assistant intent enum
  - OpenAPI tool enum
- Keep this slice documentation/contract-only.

Files changed:

- `docs/ai-assistant.md`
- `openapi.yaml`
- `docs/ai-tool-plan-steps-v2.md`

Implementation summary:

- Updated the graph-order section in `docs/ai-assistant.md` to match the current graph:
  - added `resolveClarificationReply`
  - added `resolveContextualAmounts`
  - corrected the ordering so `routeReadOnlyTools` happens before transfer preparation/modification
- Expanded the supported-intents list in `docs/ai-assistant.md` to include the currently implemented intents that were missing from the doc:
  - `transaction_stats`
  - `cashflow_summary`
  - `recent_sent_counterparties`
  - `recent_received_counterparties`
  - `counterparty_summary`
  - `counterparty_activity_timeline`
  - `counterparty_total_received`
  - `counterparty_net_total`
  - `recipient_profile`
  - `transfer_eligibility`
  - `transfer_quote`
  - `daily_transfer_usage`
  - `pending_ai_transfers`
- Expanded the `resolveCounterpartyReference` section to reflect that it also supports summary/activity and received/net-total counterparty intents.
- Updated the transfer-preparation flow doc to mention contextual amount resolution before backend preparation.
- Fixed OpenAPI enum drift:
  - added `counterparty_total_received`
  - added `counterparty_net_total`
  - added `getTotalReceivedFromCounterparty`
  - added `getNetWithCounterparty`

Tests added or updated:

- No code tests were added because this slice is documentation/contract-only.
- Verification used syntax and contract checks.

Commands run:

- `ruby -e 'require "yaml"; YAML.load_file("openapi.yaml")'`
- `git diff --check`
- `rg -n "resolveClarificationReply|resolveContextualAmounts|counterparty_total_received|counterparty_net_total|getTotalReceivedFromCounterparty|getNetWithCounterparty" docs/ai-assistant.md openapi.yaml`

Results:

- Passed: `ruby -e 'require "yaml"; YAML.load_file("openapi.yaml")'`
- Passed: contract grep checks confirming the updated nodes, intents, and tool names are present in docs and OpenAPI
- Failed: `git diff --check` due to unrelated existing trailing whitespace in `server/src/middleware/auth.ts:19`

Assumptions made:

- This slice should correct only current-state drift, not expand the public contract beyond what the backend already supports.
- Syntax validation plus targeted grep checks are sufficient verification for a doc/OpenAPI enum alignment slice.

Remaining follow-up work:

- Continue Phase 14 if more AI contract cleanup is needed.
- Return to Phase 13 happy-path environment-backed eval runs once the required DB or live-model environment becomes available.

Blocked questions:

- None.

Next step:

- Either continue Phase 14 with any remaining contract cleanup, or resume Phase 13 by running the first happy-path seeded-Mongo or `llm-dev` eval when the environment dependency is available.

## 2026-06-04 - Phase 14: OpenAPI Contract Parity Tests

Status: implemented.

Task name:

- Phase 14 third slice: add regression tests that keep the OpenAPI AI contract enums aligned with the backend state contracts.

Planned change:

- Add focused tests in `server/src/ai/tests/aiSafety.test.ts` that read `openapi.yaml` and assert exact parity for:
  - `AssistantIntent`
  - `AiToolName`
- Keep the test narrow and deterministic so future enum drift fails fast during normal server test runs.

Files changed:

- `server/src/ai/tests/aiSafety.test.ts`
- `docs/ai-tool-plan-steps-v2.md`

Implementation summary:

- Added a small helper in `aiSafety.test.ts` that reads `openapi.yaml` and extracts enum entries by schema name.
- Added `openapi assistant intent enum stays in sync with state contracts`.
- Added `openapi ai tool enum stays in sync with state contracts`.
- The tests compare the extracted OpenAPI enum arrays directly against:
  - `assistantIntentValues`
  - `assistantToolNames`
- This closes the gap exposed by the previous contract-drift cleanup: future backend enum changes now require matching OpenAPI updates or the server test suite fails.

Tests added or updated:

- Added `openapi assistant intent enum stays in sync with state contracts`
- Added `openapi ai tool enum stays in sync with state contracts`

Commands run:

- `npx tsx --test src/ai/tests/aiSafety.test.ts`
- `npm run build --workspace server`
- `env VIRLY_EMAIL_FROM='Virly <verify@example.com>' npm run test --workspace server`
- `git diff --check`

Results:

- Passed: `npx tsx --test src/ai/tests/aiSafety.test.ts`, confirming `123/123` focused AI tests pass.
- Passed: `npm run build --workspace server`.
- Passed: `env VIRLY_EMAIL_FROM='Virly <verify@example.com>' npm run test --workspace server`, confirming `133/133` server tests pass.
- Failed: `git diff --check` due to unrelated existing trailing whitespace in `server/src/middleware/auth.ts:19`.

Assumptions made:

- Regex-based enum extraction is sufficient here because the OpenAPI schemas use a stable simple YAML enum shape and the test only needs parity for two string enums.
- Keeping the test in `aiSafety.test.ts` is acceptable because this file already acts as the assistant contract/regression suite.

Remaining follow-up work:

- Add similar parity checks for any additional AI contract surfaces if they become drift-prone.
- Resume Phase 13 environment-backed eval runs once the required live model or dedicated Mongo eval environment is available.

Blocked questions:

- None.

Next step:

- Either continue Phase 14 with any remaining contract parity checks, or resume Phase 13 with the first happy-path seeded-Mongo or `llm-dev` eval when the environment dependency is available.

## 2026-06-04 - Phase 14: Clarification Contract Parity

Status: implemented.

Task name:

- Phase 14 fourth slice: align `AiClarificationRequest` OpenAPI enums with the backend clarification contract and add parity tests so the drift cannot recur silently.

Planned change:

- Export clarification reason and reply-type values from `server/src/ai/state.ts`.
- Update `openapi.yaml` so `AiClarificationRequest.expectedReplyType` includes `amount_scope` and enum ordering matches the backend contract.
- Add focused parity tests in `server/src/ai/tests/aiSafety.test.ts` for:
  - `AiClarificationRequest.reason`
  - `AiClarificationRequest.expectedReplyType`

Files changed:

- `server/src/ai/state.ts`
- `server/src/ai/tests/aiSafety.test.ts`
- `openapi.yaml`
- `docs/ai-tool-plan-steps-v2.md`

Implementation summary:

- Added `clarificationReasonValues` and `clarificationReplyTypeValues` exports in `server/src/ai/state.ts` and wired `ClarificationRequest` to those exported tuples.
- Fixed the real OpenAPI drift where `AiClarificationRequest.expectedReplyType` was missing `amount_scope`.
- Aligned the OpenAPI clarification reason enum order with the backend export so the contract stays exact, not just set-equal.
- Added a property-level OpenAPI enum extractor in `aiSafety.test.ts`.
- Added:
  - `openapi clarification reason enum stays in sync with state contracts`
  - `openapi clarification expectedReplyType enum stays in sync with state contracts`
- Tightened the test helper after the first run exposed a schema-block parsing bug; the helper now matches the property enum directly from the YAML text instead of truncating nested schema content.

Tests added or updated:

- Added `openapi clarification reason enum stays in sync with state contracts`
- Added `openapi clarification expectedReplyType enum stays in sync with state contracts`

Commands run:

- `npx tsx --test src/ai/tests/aiSafety.test.ts`
- `ruby -e 'require "yaml"; YAML.load_file("openapi.yaml")'`
- `npm run build --workspace server`
- `env VIRLY_EMAIL_FROM='Virly <verify@example.com>' npm run test --workspace server`
- `git diff --check`

Results:

- Passed: `ruby -e 'require "yaml"; YAML.load_file("openapi.yaml")'`
- Passed: `npm run build --workspace server`
- Passed: `npx tsx --test src/ai/tests/aiSafety.test.ts`, confirming `125/125` focused AI tests pass.
- Passed: `env VIRLY_EMAIL_FROM='Virly <verify@example.com>' npm run test --workspace server`, confirming `135/135` server tests pass.
- Failed: `git diff --check` due to unrelated existing trailing whitespace in `server/src/middleware/auth.ts:19`.

Assumptions made:

- `server/src/ai/state.ts` is the authoritative source for clarification enum values, so OpenAPI and parity tests should follow its ordering exactly.
- Property-level regex extraction remains acceptable here because `AiClarificationRequest` still uses the stable simple YAML shape already validated by the syntax parse check.

Remaining follow-up work:

- Continue Phase 14 if more AI contract surfaces look drift-prone enough to justify parity checks.
- Otherwise resume Phase 13 when the environment-backed `seeded-mongo` or `llm-dev` happy-path runs become available.

Blocked questions:

- None.

Next step:

- Either continue Phase 14 with any remaining contract parity cleanup, or resume Phase 13 with the first happy-path `seeded-mongo` or `llm-dev` eval when the environment dependency is available.

## 2026-06-04 - Phase 14: Client AI Contract Parity

Status: implemented.

Task name:

- Phase 14 fifth slice: align the client-side AI contract unions with the backend/OpenAPI contract and add parity tests so the drift cannot recur silently.

Planned change:

- Update `client/src/lib/types.ts` so the client AI contract includes the backend-supported values that were missing:
  - `counterparty_total_received`
  - `counterparty_net_total`
  - `getTotalReceivedFromCounterparty`
  - `getNetWithCounterparty`
  - `getAvailableActions`
  - `unsupported`
  - `unresolved_reference`
  - `amount_scope`
  - `free_text`
- Add focused regression tests in `server/src/ai/tests/aiSafety.test.ts` that read `client/src/lib/types.ts` and assert exact parity for:
  - `AssistantIntent`
  - `AiToolName`
  - `AiClarificationReason`
  - `AiClarificationExpectedReplyType`

Files changed:

- `client/src/lib/types.ts`
- `server/src/ai/tests/aiSafety.test.ts`
- `docs/ai-tool-plan-steps-v2.md`

Implementation summary:

- Fixed real client contract drift in `client/src/lib/types.ts`:
  - added missing read-only counterparty intents and tool names
  - added the missing clarification reply type `amount_scope`
  - added the missing clarification reason `unresolved_reference`
  - added the missing final literals `unsupported`, `getAvailableActions`, and `free_text`
- Preserved backend ordering for the client unions so parity stays exact rather than set-equal.
- Added a small helper in `aiSafety.test.ts` that extracts literal unions from `client/src/lib/types.ts`.
- Added strict client parity tests for assistant intents, tool names, clarification reasons, and clarification reply types.
- The first pass exposed two issues:
  - the client patch had duplicated final union lines, which broke client TypeScript build
  - the new extractor helper did not include the semicolon-terminated final literal in each union
- Fixed both issues instead of weakening the tests, so the parity checks now verify the complete client union surface.

Tests added or updated:

- Added `client assistant intent union stays in sync with state contracts`
- Added `client ai tool union stays in sync with state contracts`
- Added `client clarification reason union stays in sync with state contracts`
- Added `client clarification expectedReplyType union stays in sync with state contracts`

Commands run:

- `npx tsx --test src/ai/tests/aiSafety.test.ts`
- `npm run build --workspace client`
- `npm run build --workspace server`
- `env VIRLY_EMAIL_FROM='Virly <verify@example.com>' npm run test --workspace server`
- `git diff --check`

Results:

- Passed: `npx tsx --test src/ai/tests/aiSafety.test.ts`, confirming `129/129` focused AI tests pass.
- Passed: `npm run build --workspace client`
- Passed: `npm run build --workspace server`
- Passed: `env VIRLY_EMAIL_FROM='Virly <verify@example.com>' npm run test --workspace server`, confirming `139/139` server tests pass.
- Failed: `git diff --check` due to unrelated existing trailing whitespace in `server/src/middleware/auth.ts:19`.

Assumptions made:

- Keeping client unions manually declared is still acceptable for now as long as parity tests enforce alignment.
- Reading the client type file from the server-side contract test is a reasonable temporary safeguard until there is a stronger shared type-generation path.

Remaining follow-up work:

- Continue Phase 14 if more drift-prone AI contract surfaces remain, especially any client-visible stream/event contract that is still duplicated manually.
- Otherwise resume Phase 13 when a dedicated happy-path `seeded-mongo` or `llm-dev` eval environment is available.

Blocked questions:

- None.

Next step:

- Either continue Phase 14 with any remaining client/server contract parity cleanup, or resume Phase 13 with the first happy-path `seeded-mongo` or `llm-dev` eval when the environment dependency is available.

## 2026-06-04 - Phase 14: Assistant Id And Stream Contract Parity

Status: implemented.

Task name:

- Phase 14 sixth slice: add parity guards for assistant ids and stream phases across backend, client, and OpenAPI.

Planned change:

- Extend the AI contract parity coverage to another duplicated surface:
  - OpenAPI `AiChatRequest.assistantId`
  - OpenAPI `AiChatResponse.assistantId`
  - client `AssistantId`
  - client `AiChatStreamPhase`
- Keep the slice test-only unless the checks expose a real drift.

Files changed:

- `server/src/ai/tests/aiSafety.test.ts`
- `docs/ai-tool-plan-steps-v2.md`

Implementation summary:

- Imported `assistantIds` from `server/src/ai/assistants.ts` and `aiStreamPhases` from `server/src/ai/state.ts` into the AI safety contract tests.
- Added OpenAPI parity tests for:
  - `AiChatRequest.assistantId`
  - `AiChatResponse.assistantId`
- Added client parity tests for:
  - `AssistantId`
  - `AiChatStreamPhase`
- The first run exposed a real limitation in the new client-union extractor:
  - it only handled multiline literal unions
  - `client/src/lib/types.ts` defines `AssistantId` as a single-line union
- Fixed the extractor to support both multiline and inline union declarations, then reran the full verification pass.

Tests added or updated:

- Added `openapi ai chat request assistantId enum stays in sync with assistant ids`
- Added `openapi ai chat response assistantId enum stays in sync with assistant ids`
- Added `client assistant id union stays in sync with assistant ids`
- Added `client ai stream phase union stays in sync with backend stream phases`

Commands run:

- `npx tsx --test src/ai/tests/aiSafety.test.ts`
- `npm run build --workspace client`
- `npm run build --workspace server`
- `env VIRLY_EMAIL_FROM='Virly <verify@example.com>' npm run test --workspace server`
- `git diff --check`

Results:

- Passed: `npx tsx --test src/ai/tests/aiSafety.test.ts`, confirming `133/133` focused AI tests pass.
- Passed: `npm run build --workspace client`
- Passed: `npm run build --workspace server`
- Passed: `env VIRLY_EMAIL_FROM='Virly <verify@example.com>' npm run test --workspace server`, confirming `143/143` server tests pass.
- Failed: `git diff --check` due to unrelated existing trailing whitespace in `server/src/middleware/auth.ts:19`.

Assumptions made:

- Assistant ids and stream phases are contract-critical enough to justify exact parity tests because both are duplicated manually across backend, client, and OpenAPI-facing surfaces.
- Supporting both inline and multiline client unions in the extractor is sufficient for the current type file style and avoids unnecessary changes to runtime code.

Remaining follow-up work:

- Continue Phase 14 if any remaining duplicated AI contract surfaces are still unguarded by parity tests.
- Otherwise resume Phase 13 when a happy-path `seeded-mongo` or `llm-dev` environment is available.

Blocked questions:

- None.

Next step:

- Either continue Phase 14 with any remaining AI contract parity cleanup, or resume Phase 13 with the first happy-path `seeded-mongo` or `llm-dev` eval when the environment dependency is available.

## 2026-06-04 - Phase 13: Injected LLM-Dev Happy Path Testability

Status: implemented.

Task name:

- Phase 13 fifth slice: make the `llm-dev` eval mode testable on a happy path without requiring a real configured model.

Planned change:

- Add test-only injection hooks to `runAiEvalFixtures(...)` for:
  - fixture files
  - configured-provider factory
- Keep default runtime behavior unchanged.
- Add a focused happy-path test proving that `llm-dev` mode runs when opt-in is enabled and an injected provider is supplied.

Files changed:

- `server/src/ai/evals/runner.ts`
- `server/src/ai/tests/aiSafety.test.ts`
- `docs/ai-tool-plan-steps-v2.md`

Implementation summary:

- Extended `runAiEvalFixtures(...)` to accept optional:
  - `fixtures`
  - `createConfiguredProvider`
- Preserved existing behavior when those options are omitted:
  - fixtures still load from disk
  - configured provider still comes from `createConfiguredAssistantLlmProvider()`
- Threaded the optional provider factory into the `llm-dev` mode branch so tests can exercise that path without a live OpenAI configuration.
- Added a focused `llm-dev` happy-path test that:
  - temporarily enables `VIRLY_AI_EVAL_ENABLE_LLM_DEV=true`
  - injects a tiny one-scenario fixture
  - injects a fake configured provider
  - verifies the eval summary succeeds with `0` failed turns
- Kept the existing fail-closed `llm-dev` test in place so both failure and success paths are now covered.

Tests added or updated:

- Added `phase 13 llm-dev eval mode can run with an injected configured provider`
- Kept `phase 13 llm-dev eval mode fails clearly when no configured provider is available`

Commands run:

- `npx tsx --test src/ai/tests/aiSafety.test.ts`
- `npm run build --workspace server`
- `env VIRLY_EMAIL_FROM='Virly <verify@example.com>' npm run test --workspace server`
- `git diff --check`

Results:

- Passed: `npx tsx --test src/ai/tests/aiSafety.test.ts`, confirming `158/158` focused AI tests pass.
- Passed: `npm run build --workspace server`
- Passed: `env VIRLY_EMAIL_FROM='Virly <verify@example.com>' npm run test --workspace server`, confirming `168/168` server tests pass.
- Failed: `git diff --check` due to unrelated existing trailing whitespace in `server/src/middleware/auth.ts:19`.

Assumptions made:

- Test-only injection hooks in the eval runner are acceptable as long as the default CLI/runtime path is unchanged when no hooks are supplied.
- A minimal injected fixture is enough to prove the `llm-dev` branch wiring works without needing a live model or network access.

Remaining follow-up work:

- Resume Phase 13 with either:
  - the first happy-path `seeded-mongo` eval against a dedicated eval database, or
  - the first true configured-model `llm-dev` run when the environment dependency is available
- Continue widening fixture coverage once those environment-backed modes are exercised.

Blocked questions:

- None.

Next step:

- Best next move is a real environment-backed Phase 13 run: happy-path `seeded-mongo` or live `llm-dev`, depending on which environment becomes available first.

## 2026-06-04 - Phase 14: Stream Event Contract Schemas

Status: implemented.

Task name:

- Phase 14 ninth slice: formalize the streaming event payload contract and add parity checks for stream event schemas.

Planned change:

- Export backend stream event type literals.
- Add explicit client stream event type aliases.
- Add reusable OpenAPI schemas for:
  - `AiChatStreamStatusEvent`
  - `AiChatStreamResultEvent`
  - `AiChatStreamErrorEvent`
- Add parity checks for stream event types and stream phases across backend, client, and OpenAPI.

Files changed:

- `server/src/ai/state.ts`
- `client/src/lib/types.ts`
- `openapi.yaml`
- `server/src/ai/tests/aiSafety.test.ts`
- `docs/ai-tool-plan-steps-v2.md`

Implementation summary:

- Added backend enum-source exports in `server/src/ai/state.ts` for:
  - `aiStreamStatusEventTypeValues`
  - `aiStreamResultEventTypeValues`
  - `aiStreamErrorEventTypeValues`
- Added explicit client aliases in `client/src/lib/types.ts` for:
  - `AiChatStreamStatusEventType`
  - `AiChatStreamResultEventType`
  - `AiChatStreamErrorEventType`
- Updated the client stream event object types to use those aliases instead of repeating bare string literals.
- Replaced the `text/event-stream` response schema in `openapi.yaml` with a `oneOf` over reusable event payload schemas and added:
  - `AiChatStreamStatusEvent`
  - `AiChatStreamResultEvent`
  - `AiChatStreamErrorEvent`
- Added parity tests for:
  - OpenAPI stream event `type` enums
  - OpenAPI stream `phase` enum
  - client stream event type unions
- This slice does not change streaming behavior; it makes the existing SSE payload contract explicit and regression-checked.

Tests added or updated:

- Added `openapi stream status event type stays in sync with state contracts`
- Added `openapi stream status phase stays in sync with state contracts`
- Added `openapi stream result event type stays in sync with state contracts`
- Added `openapi stream error event type stays in sync with state contracts`
- Added `client stream status event type stays in sync with state contracts`
- Added `client stream result event type stays in sync with state contracts`
- Added `client stream error event type stays in sync with state contracts`

Commands run:

- `npx tsx --test src/ai/tests/aiSafety.test.ts`
- `npm run build --workspace client`
- `npm run build --workspace server`
- `env VIRLY_EMAIL_FROM='Virly <verify@example.com>' npm run test --workspace server`
- `git diff --check`

Results:

- Passed: `npx tsx --test src/ai/tests/aiSafety.test.ts`, confirming `157/157` focused AI tests pass.
- Passed: `npm run build --workspace client`
- Passed: `npm run build --workspace server`
- Passed: `env VIRLY_EMAIL_FROM='Virly <verify@example.com>' npm run test --workspace server`, confirming `167/167` server tests pass.
- Failed: `git diff --check` due to unrelated existing trailing whitespace in `server/src/middleware/auth.ts:19`.

Assumptions made:

- It is acceptable for the OpenAPI `text/event-stream` schema to describe the per-event JSON payload shape rather than the raw full SSE text framing, since the examples still show the wire format.
- Stream event payload literals are stable enough to justify backend-exported enum sources and parity tests.

Remaining follow-up work:

- Continue Phase 14 only if another duplicated AI contract surface is still unguarded.
- Otherwise resume Phase 13 when a happy-path `seeded-mongo` or `llm-dev` environment is available.

Blocked questions:

- None.

Next step:

- Either continue Phase 14 with any remaining AI contract parity cleanup, or resume Phase 13 with the first happy-path `seeded-mongo` or `llm-dev` eval when the environment dependency is available.

## 2026-06-04 - Phase 14: Confirmation Response And Error Parity

Status: implemented.

Task name:

- Phase 14 eighth slice: cover the remaining confirmation-response contract drift with explicit client types and parity checks for confirmation response statuses and superseded-confirmation errors.

Planned change:

- Export the backend superseded-confirmation error code source.
- Add explicit client unions for:
  - confirmation response status
  - superseded confirmation error code
- Add parity checks for:
  - OpenAPI `AiConfirmationResponse` status values from `oneOf`
  - OpenAPI `AiSupersededConfirmationError.error`
  - client confirmation response status union
  - client superseded confirmation error union

Files changed:

- `server/src/ai/state.ts`
- `client/src/lib/types.ts`
- `server/src/ai/tests/aiSafety.test.ts`
- `docs/ai-tool-plan-steps-v2.md`

Implementation summary:

- Added `confirmationSupersededErrorValues` to `server/src/ai/state.ts`.
- Added explicit client unions in `client/src/lib/types.ts` for:
  - `AiConfirmationResponseStatus`
  - `AiConfirmationConfirmedStatus`
  - `AiConfirmationDeniedStatus`
  - `AiSupersededConfirmationErrorCode`
- Kept the confirmation response as a discriminated union by using exact branch-specific status aliases after the first pass showed that widening both branches to the shared union broke widget narrowing on `newBalance`.
- Added a dedicated `extractOpenApiOneOfPropertyEnumValues(...)` helper in the AI safety tests so `AiConfirmationResponse.oneOf[*].properties.status.enum` can be checked directly.
- Added OpenAPI/client parity tests for the confirmation response statuses and the superseded error code.

Tests added or updated:

- Added `openapi confirmation response status values stay in sync with state contracts`
- Added `openapi superseded confirmation error enum stays in sync with state contracts`
- Added `client confirmation response status union stays in sync with state contracts`
- Added `client superseded confirmation error union stays in sync with state contracts`

Commands run:

- `npx tsx --test src/ai/tests/aiSafety.test.ts`
- `npm run build --workspace client`
- `npm run build --workspace server`
- `env VIRLY_EMAIL_FROM='Virly <verify@example.com>' npm run test --workspace server`
- `git diff --check`

Results:

- Passed: `npx tsx --test src/ai/tests/aiSafety.test.ts`, confirming `150/150` focused AI tests pass.
- Passed: `npm run build --workspace client`
- Passed: `npm run build --workspace server`
- Passed: `env VIRLY_EMAIL_FROM='Virly <verify@example.com>' npm run test --workspace server`, confirming `160/160` server tests pass.
- Failed: `git diff --check` due to unrelated existing trailing whitespace in `server/src/middleware/auth.ts:19`.

Assumptions made:

- It is worth keeping separate exact client aliases for `confirmed` and `denied` because the widget relies on discriminated-union narrowing for confirmation results.
- A dedicated `oneOf` enum extractor is justified here because the response-status contract is explicit in OpenAPI but not representable by the simpler single-property enum helper.

Remaining follow-up work:

- Continue Phase 14 if any remaining duplicated AI contract surfaces are still unguarded.
- Otherwise resume Phase 13 when a happy-path `seeded-mongo` or `llm-dev` environment is available.

Blocked questions:

- None.

Next step:

- Either continue Phase 14 with any remaining AI contract parity cleanup, or resume Phase 13 with the first happy-path `seeded-mongo` or `llm-dev` eval when the environment dependency is available.

## 2026-06-04 - Phase 14: Confirmation Contract Parity

Status: implemented.

Task name:

- Phase 14 seventh slice: tighten the client transfer-confirmation contract and add parity checks for confirmation-related enums across backend, client, and OpenAPI.

Planned change:

- Export the backend confirmation-contract literals from `server/src/ai/state.ts`.
- Narrow the client confirmation types in `client/src/lib/types.ts` so confirmation metadata does not stay as broad `string` fields.
- Add parity tests for:
  - OpenAPI `AiToolStatus`
  - OpenAPI `AiTransferConfirmation.type`
  - OpenAPI `AiTransferConfirmation.status`
  - OpenAPI `AiTransferConfirmation.currency`
  - OpenAPI nested warning codes
  - OpenAPI confirmation action method and action
  - client confirmation type/status/currency/warning/method/action unions

Files changed:

- `server/src/ai/state.ts`
- `client/src/lib/types.ts`
- `server/src/ai/tests/aiSafety.test.ts`
- `docs/ai-tool-plan-steps-v2.md`

Implementation summary:

- Added backend enum-source exports in `server/src/ai/state.ts` for:
  - `transferConfirmationTypeValues`
  - `transferConfirmationStatusValues`
  - `transferConfirmationCurrencyValues`
  - `transferWarningCodeValues`
  - `confirmationActionMethodValues`
  - `confirmationActionValues`
  - `confirmationResponseStatusValues`
- Rewired `TransferConfirmation` to use those exported literal sources instead of repeating inline string unions.
- Tightened the client confirmation contract in `client/src/lib/types.ts` with explicit unions for:
  - `AiTransferConfirmationType`
  - `AiTransferConfirmationStatus`
  - `AiTransferConfirmationCurrency`
  - `AiTransferWarningCode`
  - `AiConfirmationMethod`
- Updated `AiTransferConfirmation` to use those narrower client types instead of plain `string` fields where the contract is fixed.
- Added OpenAPI and client parity tests for the confirmation-contract surfaces listed above.
- The first pass exposed a real test-helper gap: the nested OpenAPI enum extractor was too strict about indentation and could not match `warnings -> items -> properties -> code`.
- Fixed that helper to use whitespace-tolerant ordered-path matching instead of exact-indent matching, then reran the full verification pass.

Tests added or updated:

- Added `openapi ai tool status enum stays in sync with client contract`
- Added `openapi transfer confirmation type enum stays in sync with state contracts`
- Added `openapi transfer confirmation status enum stays in sync with state contracts`
- Added `openapi transfer confirmation currency enum stays in sync with state contracts`
- Added `openapi transfer confirmation warning code enum stays in sync with state contracts`
- Added `openapi confirmation action method enum stays in sync with state contracts`
- Added `openapi confirmation action enum stays in sync with state contracts`
- Added `client transfer confirmation type union stays in sync with state contracts`
- Added `client transfer confirmation status union stays in sync with state contracts`
- Added `client transfer confirmation currency union stays in sync with state contracts`
- Added `client transfer warning code union stays in sync with state contracts`
- Added `client confirmation method union stays in sync with state contracts`
- Added `client confirmation action union stays in sync with state contracts`

Commands run:

- `npx tsx --test src/ai/tests/aiSafety.test.ts`
- `npm run build --workspace client`
- `npm run build --workspace server`
- `env VIRLY_EMAIL_FROM='Virly <verify@example.com>' npm run test --workspace server`
- `git diff --check`

Results:

- Passed: `npx tsx --test src/ai/tests/aiSafety.test.ts`, confirming `146/146` focused AI tests pass.
- Passed: `npm run build --workspace client`
- Passed: `npm run build --workspace server`
- Passed: `env VIRLY_EMAIL_FROM='Virly <verify@example.com>' npm run test --workspace server`, confirming `156/156` server tests pass.
- Failed: `git diff --check` due to unrelated existing trailing whitespace in `server/src/middleware/auth.ts:19`.

Assumptions made:

- The current confirmation card contract remains intentionally narrow:
  - `type` is only `transfer`
  - `status` is only `pending`
  - confirmation card currency remains `ILS`
- It is acceptable for this slice to improve client type precision without changing any runtime payload shape.

Remaining follow-up work:

- Continue Phase 14 if any remaining duplicated AI contract surfaces are still unguarded.
- Otherwise resume Phase 13 when a happy-path `seeded-mongo` or `llm-dev` environment is available.

Blocked questions:

- None.

Next step:

- Either continue Phase 14 with any remaining AI contract parity cleanup, or resume Phase 13 with the first happy-path `seeded-mongo` or `llm-dev` eval when the environment dependency is available.

## 2026-06-04 - Phase 13: Clarification And Pending Fixture Expansion

Status: implemented.

Task name:

- Phase 13 ninth slice: expand deterministic eval coverage for amount-scope clarification resume and pending-confirmation list memory fidelity while leaving product behavior unchanged.

Planned change:

- Add a deterministic multi-turn fixture for a contextual amount clarification that resumes with the previous answer total.
- Add a deterministic pending-confirmation list fixture.
- Make the default eval fake for `getPendingAiTransfers` return production-shaped pending-transfer data, metadata, and memory updates.
- Probe whether a pending-list follow-up can currently resolve "the first one" through pending-transfer memory before adding any follow-up fixture.

Files changed:

- `server/src/ai/evals/conversations.transfer-context.json`
- `server/src/ai/evals/conversations.pending-confirmations.json`
- `server/src/ai/evals/runner.ts`
- `docs/ai-tool-plan-steps-v2.md`

Implementation summary:

- Added `amount-scope-clarification-resume`, a three-turn deterministic fixture that:
  - asks for the total received from Alex
  - asks to send the same amount and expects an amount-scope clarification
  - answers `previous answer total` and expects a prepared 35.00 ILS transfer to `alex@example.com`
- Added `pending-list-current-conversation`, a read-only fixture for `Show my pending confirmations` that expects `pending_ai_transfers` and `getPendingAiTransfers`.
- Updated the default eval fake `getPendingAiTransfers` result to include:
  - user-facing `data` rows
  - sanitized `metadata.pendingTransfers`
  - `memoryUpdates.pendingTransfers` for future reference-resolution fixtures
- Ran a focused behavior probe for `Show my pending confirmations` followed by `what about the first one`; current routing treats the follow-up as `transaction_detail` and does not use pending-transfer memory, so no product behavior change or unsupported fixture was added in this slice.

Tests added or updated:

- Added deterministic eval scenario `transfer-context/amount-scope-clarification-resume`.
- Added deterministic eval scenario `pending-confirmations/pending-list-current-conversation`.
- Updated the existing `phase 13 deterministic eval fixtures pass against graph` test through fixture coverage.

Commands run:

- `node --import tsx ./src/ai/evals/cli.ts --mode deterministic`
- `node --import tsx --input-type=module -e "<pending-reference behavior probe>"`
- `npx tsx --test src/ai/tests/aiSafety.test.ts`
- `npm run build --workspace server`
- `env VIRLY_EMAIL_FROM='Virly <verify@example.com>' npm run test --workspace server`
- `git diff --check`

Results:

- Passed: deterministic eval CLI, confirming `4` fixture files, `12` scenarios, `16` turns, and `0` failed turns.
- Probe result: first pending-list turn returned `pending_ai_transfers` with `getPendingAiTransfers`; follow-up `what about the first one` returned `transaction_detail` with no tool calls, confirming pending-reference follow-ups are not currently wired through this route.
- Passed: `npx tsx --test src/ai/tests/aiSafety.test.ts`, confirming `158/158` focused AI tests pass.
- Passed: `npm run build --workspace server`.
- Passed: `env VIRLY_EMAIL_FROM='Virly <verify@example.com>' npm run test --workspace server`, confirming `168/168` server tests pass.
- Passed: `git diff --check`.

Assumptions made:

- Fixture expansion should not change intent routing or graph behavior.
- It is useful for the eval fake to carry production-shaped pending-transfer memory even before a supported follow-up route consumes it.

Remaining follow-up work:

- Add a pending-transfer follow-up fixture only after the graph has a clear supported route for resolving pending-transfer memory references such as "the first one".
- Resume true Phase 13 happy-path `seeded-mongo` or `llm-dev` evals when the required environment is available.

Blocked questions:

- None.

Next step:

- Continue with the next small Phase 13 eval-readiness slice, or move back to Phase 14 only if another duplicated AI contract surface remains unguarded.

## 2026-06-04 - Phase 5/9/13: Pending Reference Follow-Up Resolution

Status: implemented.

Task name:

- Phase 5 and Phase 9 pending-transfer reference support, with Phase 13 fixture coverage: resolve ordinal follow-ups after a pending-confirmation list without changing transfer execution semantics.

Planned change:

- Route pending-list follow-ups such as `what about the first one` to the pending-confirmation status path when recent conversation memory shows the previous answer listed pending transfer confirmations.
- Execute only the allowlisted read-only `resolvePendingTransferReference` tool for that contextual status path.
- Return the resolver's user-visible summary for the pending transfer reference.
- Preserve the existing safety behavior where `yes`, `confirm it`, and similar chat text execute no tools and cannot move money.
- Keep ordinary transaction-detail follow-ups routed to transaction detail, including Hebrew transaction detail phrasing.

Files changed:

- `server/src/ai/router.ts`
- `server/src/ai/graph.ts`
- `server/src/ai/evals/runner.ts`
- `server/src/ai/evals/conversations.pending-confirmations.json`
- `server/src/ai/tests/aiSafety.test.ts`
- `docs/ai-tool-plan-steps-v2.md`

Implementation summary:

- Added contextual pending-transfer follow-up detection in deterministic intent classification.
- The classifier now returns `pending_confirmation_status` for ordinal/detail follow-ups only when:
  - pending-transfer clarification is active, or
  - the latest answer frame was `pending_ai_transfers`, or
  - the user explicitly says pending/confirmation wording.
- Added graph-side resolver selection for `pending_confirmation_status` when the message is an ordinal pending-transfer reference.
- Kept chat confirmation wording non-mutating by requiring an ordinal pending reference before running `resolvePendingTransferReference`.
- Updated deterministic response composition to return read-only resolver summaries when the pending status path executed a tool.
- Tightened the routing guard after the first focused test run showed that broad Hebrew transfer wording could steal transaction-detail follow-ups; the final guard no longer treats bare transfer/payment wording as pending context.
- Extended the default eval fake with production-shaped `resolvePendingTransferReference` output.
- Extended the pending-confirmations fixture so the pending-list scenario includes `what about the first one`.

Tests added or updated:

- Added `pending transfer list follow-up resolves ordinal read-only`.
- Updated the fake pending-reference resolver summary in `aiSafety.test.ts` to include the pending-transfer amount and user-visible full email.
- Updated deterministic eval scenario `pending-confirmations/pending-list-current-conversation` with a follow-up turn expecting `resolvePendingTransferReference`.
- Existing transaction-detail regressions cover that transaction follow-ups still route to transaction tools.

Commands run:

- `node --import tsx ./src/ai/evals/cli.ts --mode deterministic`
- `npx tsx --test src/ai/tests/aiSafety.test.ts`
- `npm run build --workspace server`
- `env VIRLY_EMAIL_FROM='Virly <verify@example.com>' npm run test --workspace server`
- `git diff --check`

Results:

- Passed: deterministic eval CLI, confirming `4` fixture files, `12` scenarios, `17` turns, and `0` failed turns.
- Initial focused AI test run failed because the first routing guard treated Hebrew bare transfer wording as pending context and changed a transaction-detail test from `transaction_detail` to `pending_confirmation_status`.
- Fixed by requiring explicit pending/confirmation wording unless the latest answer frame was `pending_ai_transfers`.
- Passed: `npx tsx --test src/ai/tests/aiSafety.test.ts`, confirming `159/159` focused AI tests pass.
- Passed: `npm run build --workspace server`.
- Passed: `env VIRLY_EMAIL_FROM='Virly <verify@example.com>' npm run test --workspace server`, confirming `169/169` server tests pass.
- Passed: `git diff --check`.

Assumptions made:

- A pending-list ordinal follow-up is a read-only status/reference question, not a request to confirm or modify the transfer.
- `resolvePendingTransferReference` remains safe for this path because it is allowlisted, read-only, user-scoped by its tool context, and does not create or execute transfers.
- Bare `transfer` or Hebrew `העברה` wording should not imply pending context unless recent conversation state already points to a pending-confirmations list.

Remaining follow-up work:

- Consider adding a Hebrew pending-list follow-up fixture once the deterministic phrasing matrix needs another pending-transfer scenario.
- Resume true Phase 13 happy-path `seeded-mongo` or `llm-dev` evals when the required environment is available.

Blocked questions:

- None.

Next step:

- Continue Phase 13 with another deterministic eval-readiness slice, or run the first environment-backed `seeded-mongo`/`llm-dev` happy path once credentials and a dedicated eval database are available.

## 2026-06-04 - Phase 12/13: Hebrew Pending Reference Follow-Up Coverage

Status: implemented.

Task name:

- Phase 12 Hebrew scenario coverage and Phase 13 eval coverage for pending-transfer ordinal follow-ups after a Hebrew pending-confirmations list.

Planned change:

- Support Hebrew detail follow-up phrasing such as `מה לגבי הראשון` after a pending-confirmations list.
- Keep the route contextual so Hebrew transaction-detail follow-ups remain transaction-detail requests unless recent conversation state points to pending confirmations.
- Add direct AI safety coverage and deterministic eval coverage for the Hebrew two-turn flow.

Files changed:

- `server/src/ai/router.ts`
- `server/src/ai/tests/aiSafety.test.ts`
- `server/src/ai/evals/conversations.pending-confirmations.json`
- `docs/ai-tool-plan-steps-v2.md`

Implementation summary:

- Extended the pending-reference follow-up detector to recognize Hebrew `מה לגבי` and `מה עם` detail phrasing.
- Kept the detector behind the existing pending-reference guard:
  - ordinal is required
  - explicit transaction/receipt wording still wins against pending status
  - pending context must come from the latest `pending_ai_transfers` answer frame, pending-transfer clarification, or explicit pending/confirmation wording
- Added a direct two-turn regression:
  - `תראה לי אישורים ממתינים`
  - `מה לגבי הראשון`
- Added a matching deterministic eval scenario, `hebrew-pending-list-follow-up`.

Tests added or updated:

- Added `hebrew pending transfer list follow-up resolves ordinal read-only`.
- Added deterministic eval scenario `pending-confirmations/hebrew-pending-list-follow-up`.
- Existing Hebrew transaction-detail tests continue to cover that bare Hebrew transfer/detail wording does not get stolen by the pending-reference path.

Commands run:

- `node --import tsx ./src/ai/evals/cli.ts --mode deterministic`
- `npx tsx --test src/ai/tests/aiSafety.test.ts`
- `npm run build --workspace server`
- `env VIRLY_EMAIL_FROM='Virly <verify@example.com>' npm run test --workspace server`
- `git diff --check`

Results:

- Passed: deterministic eval CLI, confirming `4` fixture files, `13` scenarios, `19` turns, and `0` failed turns.
- Passed: `npx tsx --test src/ai/tests/aiSafety.test.ts`, confirming `160/160` focused AI tests pass.
- Passed: `npm run build --workspace server`.
- Passed: `env VIRLY_EMAIL_FROM='Virly <verify@example.com>' npm run test --workspace server`, confirming `170/170` server tests pass.
- Passed: `git diff --check`.

Assumptions made:

- Hebrew `מה לגבי הראשון` after a pending-confirmations list is a read-only pending-reference question, not a request to confirm or modify a transfer.
- It is safer to add only narrow Hebrew detail phrasing and keep broad Hebrew transfer words out of the pending-reference detector.

Remaining follow-up work:

- Continue widening deterministic eval coverage for any remaining high-value multi-turn scenarios.
- Resume true Phase 13 happy-path `seeded-mongo` or `llm-dev` evals when the required environment is available.

Blocked questions:

- None.

Next step:

- Continue Phase 13 with another small deterministic eval-readiness slice, or run the first environment-backed `seeded-mongo`/`llm-dev` happy path once credentials and a dedicated eval database are available.

## 2026-06-04 - Phase 12/13: Success-Criteria Context Chain Eval

Status: implemented.

Task name:

- Phase 13 deterministic eval coverage for the plan's final Hebrew/English success-criteria conversation, plus Phase 12 routing support for `בוא נעביר`.

Planned change:

- Add deterministic eval coverage for a Hebrew/English multi-turn chain:
  - Hebrew recent sent counterparties
  - Hebrew same-amount transfer using the remembered counterparty
  - English received-total follow-up
  - English transfer using the same received amount
- Make the deterministic eval fake closer to production by emitting recent-counterparty `memoryUpdates`.
- Add a deterministic eval-only amount resolver so latest sent/received amount references do not query Mongo during deterministic fixture runs.
- Add focused AI safety coverage for `בוא נעביר לו שוב את אותה כמות`.

Files changed:

- `server/src/ai/router.ts`
- `server/src/ai/evals/runner.ts`
- `server/src/ai/evals/conversations.hebrew-mixed.json`
- `server/src/ai/tests/aiSafety.test.ts`
- `docs/ai-tool-plan-steps-v2.md`

Implementation summary:

- Added `נעביר` and `אעביר` to deterministic transfer-preparation routing, covering the success-criteria phrase `בוא נעביר לו...`.
- Updated deterministic eval recent sent/received fake tools to emit production-shaped:
  - `metadata.counterparties`
  - `memoryUpdates.counterparties`
  - user-visible full-email summaries and LLM-safe masked summaries
- Added `createDeterministicAmountResolutionService()` in the eval runner:
  - resolves latest sent references to `42.00 ILS`
  - resolves latest received references to `35.00 ILS`
  - resolves latest answer totals from memory
  - preserves the existing ambiguous same-amount behavior when a total answer is present
- Wired that resolver into deterministic and injected `llm-dev` fixture runs.
- Added `hebrew-mixed-success-criteria-chain` to the Hebrew/mixed fixture suite.
- Added a direct regression proving recent sent counterparty memory can drive `בוא נעביר לו שוב את אותה כמות` without Mongo and without executing money movement.

Tests added or updated:

- Added deterministic eval scenario `hebrew-mixed/hebrew-mixed-success-criteria-chain`.
- Added `hebrew same amount transfer can reuse recent sent counterparty memory`.
- Existing `phase 13 deterministic eval fixtures pass against graph` now covers `14` scenarios and `23` turns.

Commands run:

- `node --import tsx ./src/ai/evals/cli.ts --mode deterministic`
- `npx tsx --test src/ai/tests/aiSafety.test.ts`
- `npm run build --workspace server`
- `env VIRLY_EMAIL_FROM='Virly <verify@example.com>' npm run test --workspace server`
- `git diff --check`

Results:

- Initial deterministic eval run failed on `בוא נעביר לו שוב את אותה כמות` because deterministic routing returned `unsupported`.
- Fixed by adding `נעביר` and `אעביר` to the Hebrew transfer-preparation route.
- Passed: deterministic eval CLI, confirming `4` fixture files, `14` scenarios, `23` turns, and `0` failed turns.
- Passed: `npx tsx --test src/ai/tests/aiSafety.test.ts`, confirming `161/161` focused AI tests pass.
- Passed: `npm run build --workspace server`.
- Passed: `env VIRLY_EMAIL_FROM='Virly <verify@example.com>' npm run test --workspace server`, confirming `171/171` server tests pass.
- Passed: `git diff --check`.

Assumptions made:

- The deterministic fixture can use existing fake counterparties and amounts instead of exact Nikola/Jokic names; seeded-Mongo or live dev evals should cover exact seeded names when the environment is available.
- An eval-only amount resolver is safer than allowing deterministic fixtures to hit Mongo for latest sent/received transaction references.
- Adding `נעביר` and `אעביר` to transfer routing is aligned with the plan's Hebrew transfer-preparation examples and does not authorize any state-changing action.

Remaining follow-up work:

- Run true Phase 13 happy-path `seeded-mongo` or `llm-dev` evals when the required environment is available.
- Consider exact-name seeded success-criteria coverage with Nikola/Jokic in the seeded-Mongo eval path.

Blocked questions:

- None.

Next step:

- Continue Phase 13 with environment-backed eval verification when credentials and a dedicated eval database are available, or add another small deterministic fixture only if a remaining high-value matrix gap is found.

## 2026-06-04 - Phase 14: Eval Documentation Drift Cleanup

Status:

- Completed.

Specific task:

- Update the assistant developer documentation so it matches the pending-reference follow-up routing and Hebrew/English success-chain deterministic eval coverage already implemented.

Planned change:

- Document `pending_confirmation_status` ordinal/detail follow-ups after pending-confirmation list answers.
- Document that pending-list follow-ups use only read-only `resolvePendingTransferReference` behavior.
- Document the deterministic Hebrew/English success-chain fixture and the limits of deterministic eval coverage.
- Record guarded eval environment variables needed for seeded Mongo and live LLM eval modes.

Files changed:

- `docs/ai-assistant.md`
- `docs/ai-tool-plan-steps-v2.md`

Implementation summary:

- Added `pending_confirmation_status` resolver notes for ordinal pending-transfer references such as `what about the first one` and `מה לגבי הראשון`.
- Added scenario-matrix entries for English and Hebrew pending-list follow-ups.
- Added the Hebrew transfer-preparation phrase `בוא נעביר לו שוב את אותה כמות` to the transfer-preparation scenario list.
- Documented the deterministic mixed Hebrew/English success-chain eval and clarified that seeded Mongo or live LLM evals are still required for real database/model coverage.
- Added guarded eval environment variables to the local-development runbook.

Tests added or updated:

- None. This slice is documentation-only.

Commands run:

- `node --input-type=module -e "<environment variable availability check>"`
- `git diff --check`

Results:

- Environment check found no configured `VIRLY_AI_EVAL_ENABLE_MONGO`, `VIRLY_AI_EVAL_MONGO_URI`, `VIRLY_AI_EVAL_ENABLE_LLM_DEV`, `OPENAI_API_KEY`, or `VIRLY_AI_MODEL`, so no environment-backed eval could run in this shell.
- Passed: `git diff --check`.

Assumptions made:

- Documentation drift cleanup is the safest Phase 14 slice while seeded Mongo and live LLM eval dependencies are unavailable.
- No OpenAPI change is needed because this slice does not change `/api/ai/chat`, confirmation response shapes, or tool contracts.

Remaining follow-up work:

- Run true Phase 13 happy-path `seeded-mongo` or `llm-dev` evals when credentials and a dedicated eval database are available.
- Consider exact-name seeded success-criteria coverage with Nikola/Jokic in the seeded-Mongo eval path.

Blocked questions:

- None.

Next step:

- Continue Phase 13 with environment-backed eval verification when available, or continue Phase 14 only if another concrete documentation or contract drift item is found.

## 2026-06-04 - Phase 3: Unified User Request Compatibility Slice

Status:

- Completed.

Specific task:

- Start Phase 3 by adding a single normalized `AiUserRequest` object while keeping existing `requestSlots`, routing, resolver, transfer, and response behavior intact.

Planned change:

- Add the `AiUserRequest` type from the Phase 3 plan to backend AI state.
- Build `userRequest` from `NormalizedUserMessage` plus existing deterministic `RequestSlots`.
- Store `userRequest` on internal graph state.
- Pass `userRequest` into read-only tool context as internal compatibility data.
- Add focused tests for received-total pronouns, contextual transfer amount references, and tool-context propagation.

Files changed:

- `server/src/ai/state.ts`
- `server/src/ai/messageNormalization.ts`
- `server/src/ai/graph.ts`
- `server/src/ai/toolInputs.ts`
- `server/src/ai/tests/aiSafety.test.ts`
- `docs/ai-tool-plan-steps-v2.md`

Implementation summary:

- Added `AiUserRequest` with Phase 3 fields:
  - `intent`
  - `language`
  - `operation`
  - `counterpartyRef`
  - `amountRef`
  - `dateRangeRef`
  - `direction`
  - `reason`
- Added `buildAiUserRequest()` in `messageNormalization.ts`.
- Mapped existing intents to request operations:
  - read-only intents -> `read`
  - `transfer_prepare` -> `prepare_transfer`
  - pending transfer changes/cancel -> `modify_pending_transfer`
  - `general_help`/`unsupported` -> `help`
  - `unsafe_request` -> `unsafe`
- Added deterministic unified-request capture for:
  - explicit emails
  - ordinals
  - English/Hebrew pronouns and contextual recipient references
  - literal amounts
  - contextual amount references such as `same amount he sent me`, `what I sent him`, `that amount`, `אותה כמות`, and related Hebrew phrases
  - common date-range references
- Added `userRequest` to `AssistantGraphState` and the LangGraph annotation.
- Updated `extractRequestSlotsNode` to produce both `requestSlots` and `userRequest`.
- Added `userRequest` to `ToolContext` and `buildToolInput()` so future tools/resolvers can migrate incrementally.
- Fixed a deterministic direction-capture gap for `how much did he send me?` and the matching Hebrew shape so the unified request can represent received-total questions correctly.
- Preserved the public `/api/ai/chat` result shape; `userRequest` remains internal only.

Tests added or updated:

- Added `phase 3 user request captures read-only received-total pronouns`.
- Added `phase 3 user request captures contextual transfer amount references`.
- Added `graph passes phase 3 user request to read-only tools without public response changes`.
- Existing focused AI safety tests and server tests were rerun.

Commands run:

- `npx tsx --test src/ai/tests/aiSafety.test.ts`
- `npm run build --workspace server`
- `env VIRLY_EMAIL_FROM='Virly <verify@example.com>' npm run test --workspace server`
- `git diff --check`

Results:

- Initial focused test run failed because `how much did he send me?` still produced `transactionDirection: null`.
- Fixed by expanding deterministic received-direction capture for English `how much did he/she/they send me?` phrasing and matching Hebrew `כמה ... שלח/העביר ... לי` phrasing.
- Passed: `npx tsx --test src/ai/tests/aiSafety.test.ts`, confirming `164/164` focused AI tests pass.
- Passed: `npm run build --workspace server`.
- Passed: `env VIRLY_EMAIL_FROM='Virly <verify@example.com>' npm run test --workspace server`, confirming `174/174` server tests pass.
- Passed: `git diff --check`.

Assumptions made:

- This Phase 3 slice should be a compatibility layer first, not a full migration of all resolver and tool-input logic in one step.
- `transfer_cancel_pending` maps to `modify_pending_transfer` for now because it refers to pending-transfer state but still must not execute money movement from chat text.
- `general_help` and `unsupported` map to `help` because neither should run account-fact tools or transfer preparation as a normalized operation.
- Generic `same amount` maps to `same_as_last_transfer` in the unified request as a structured phrase classification only; existing backend amount-resolution and clarification rules still decide whether it is safe to use.

Remaining follow-up work:

- Continue Phase 3 by migrating specific resolver/tool-input paths to consume `userRequest` where it removes duplicated parsing.
- Consider moving the regex-heavy `AiUserRequest` builder into a dedicated file if it grows further.
- Run true Phase 13 happy-path `seeded-mongo` or `llm-dev` evals when credentials and a dedicated eval database are available.

Blocked questions:

- None.

Next step:

- Continue Phase 3 with a small migration that uses `userRequest` in one backend decision path, or resume Phase 13 environment-backed eval verification when the required environment is available.

## 2026-06-06 - Plan Rewrite: Subgraphs, Conditional Edges, And Interrupts

Status:

- Completed, but the current-state snapshot in this entry has been superseded
  by later runtime graph changes. Use
  `docs/ai-current-implementation.md` for current topology.

Specific task:

- Overhaul `docs/ai-improvement-v2.md` so the future implementation plan is built around LangGraph subgraphs, conditional edges, and interrupt/resume semantics.

Planned change:

- Replace the older linear phase list with a graph-architecture plan grounded in the current implementation.
- Document the graph state that existed during this plan rewrite. That
  single-linear-graph description is no longer current.
- Document the target top-level graph with conditional `authGate`, `resumeGate`, and `intentGate` routing.
- Define subgraph contracts for auth/persistence, request parsing, reference resolution, read-only answers, transfer preparation, pending modification, pending status, clarification interrupts, and response composition.
- Add an interrupt migration strategy that keeps Mongo conversation persistence as the durable source of truth while evaluating native LangGraph `interrupt()` and `Command`.
- Add a new implementation order that starts with conditional-edge skeleton work before subgraph extraction and native interrupt integration.

Files changed:

- `docs/ai-improvement-v2.md`
- `docs/ai-tool-plan-steps-v2.md`

Implementation summary:

- Rewrote `docs/ai-improvement-v2.md` as `AI Assistant Graph Architecture Plan V2`.
- Added a current implementation snapshot for that point in time:
  - the graph then used one `StateGraph` with linear `addEdge(...)` sequencing
  - installed `@langchain/langgraph` was `1.3.2`
  - local exports included `StateGraph`, `Command`, `interrupt`, and `MemorySaver`
- Replaced the previous target graph with a conditional top-level topology:
  - `authGate`
  - `resumeGate`
  - `intentGate`
  - subgraph routes for read-only, transfer preparation, pending modification, pending status, unsafe/help, response, audit, and save
- Added explicit subgraph contracts and safety rules.
- Added a conditional-edge migration plan with route value types.
- Added a three-stage interrupt plan:
  - interrupt-compatible state first
  - isolated native LangGraph interrupt spike
  - production resume bridge only after package behavior and persistence behavior are proven
- Added implementation phases A through J for documentation reset, conditional edges, subgraph extraction, interrupt migration, and streaming/eval alignment.

Tests added or updated:

- None. This slice is documentation-only.

Commands run:

- `rg -n "bank-fs|AI|assistant|graph|LangGraph|transfer|pending" /home/moranayal/.codex/memories/MEMORY.md`
- `sed -n ... docs/ai-improvement-v2.md`
- `sed -n ... docs/ai-tool-plan-steps-v2.md`
- `sed -n ... server/src/ai/graph.ts`
- `cat server/package.json`
- `node --input-type=module -e "<inspect @langchain/langgraph package version>"`
- `node --input-type=module -e "<inspect @langchain/langgraph exports>"`
- `git diff --check`

Results:

- Verified graph evidence for that point in time: `server/src/ai/graph.ts`
  still used linear `addEdge(...)` sequencing and no `addConditionalEdges`.
  This evidence is superseded by the current implementation, which has
  conditional edges and compiled subgraph nodes.
- Verified local LangGraph package evidence: `@langchain/langgraph 1.3.2` exports `Command`, `interrupt`, and `MemorySaver`.
- Passed: `git diff --check`.

Assumptions made:

- The rewrite should not change runtime behavior; it is an implementation-plan update only.
- Native LangGraph interrupts should be introduced through a spike and compatibility layer, not directly into production chat flow, because current persistence is Mongo-backed conversation memory across separate HTTP turns.
- Mongo conversation memory should remain authoritative unless a LangGraph-compatible checkpointer proves a concrete advantage.

Remaining follow-up work:

- Start Phase B from the rewritten plan: add top-level conditional edge skeletons without changing observable assistant behavior.
- Add tests proving irrelevant nodes no longer run for unauthenticated, unsafe, read-only, and transfer turns once Phase B begins.
- Superseded: the runtime graph has since moved from the older broad linear
  chain to conditional routing with compiled subgraphs, and the docs were
  reset in the 2026-06-06 documentation drift entry above.

Blocked questions:

- None.

Next step:

- Implement Phase B: conditional edge skeleton in `server/src/ai/graph.ts`, with focused behavior-preservation tests.
