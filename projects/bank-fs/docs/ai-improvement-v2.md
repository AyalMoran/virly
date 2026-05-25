# AI Assistant Improvement V2 Patch Plan

This plan upgrades the Virly AI assistant from a mostly intent-and-tool router
into a stronger conversational assistant that can preserve context across
multi-turn banking questions and transfer-preparation drafts.

The core safety boundary stays unchanged:

```text
LLM = language parsing, reference interpretation, response wording
Backend = auth, account facts, recipient validation, transfer validation, confirmation lifecycle, execution
```

Chat text must never execute money movement. Transfers still require an
explicit confirmation card and the confirmation endpoint.

## Current Problems To Fix

Recent conversations exposed a few concrete gaps:

```text
User: בוא נעביר לו שוב את אותה כמות
Assistant: How much should I send to jokic@nuggets.com?

User: how much did he send me?
Assistant: Which recipient should I use for that question?

User: the same amount he sent me
Assistant: How much should I send to jokic@nuggets.com?
```

Root causes:

1. The transfer draft extractor can fail hard when `recipientEmail` contains a
   contextual label instead of a plain email. One invalid field discards the
   whole draft and falls back to deterministic parsing.
2. The deterministic fallback extracts only literal numeric amounts. It does not
   understand `same amount`, `same as last time`, `אותה כמות`, or similar
   contextual amount phrases.
3. `amountReferenceText` exists in the draft contract, but no backend resolver
   turns it into an amount before pending-transfer validation.
4. English pronouns such as `he`, `she`, and `him again` are under-supported in
   deterministic reference resolution.
5. There is no direct read-only capability for "how much did this counterparty
   send me?" as distinct from "how much did I send them?"
6. User-visible full email labels are now supported, but LLM-facing prompts must
   continue to receive masked labels only.

## Design Goals

- Preserve conversational context for people, transactions, date ranges,
  amounts, totals, pending confirmations, and clarification options.
- Handle Hebrew, English, and mixed Hebrew/English requests without making
  translation the main strategy.
- Make extraction failure local to the bad field, not fatal to the whole turn.
- Resolve contextual amounts through backend facts before creating a pending
  confirmation.
- Add read-only coverage for common natural language questions before the
  assistant tries to prepare a transfer.
- Keep deterministic routing and tool allowlisting. The LLM must not choose
  arbitrary tools.
- Keep LLM prompts sanitized. Full emails may be visible to the authenticated
  user, but not sent back into the LLM prompt surface unless the user typed them.
- Add observability that captures why a turn fell back, clarified, or resolved.
- Make the conversation feel natural by using structured clarification and
  context repair instead of repeatedly asking for the same slot.

## Target Graph Shape

The current graph can be evolved without replacing it. The recommended final
shape is:

```text
START
  -> loadAuthenticatedContext
  -> loadConversationContext
  -> normalizeUserMessage
  -> classifyIntent
  -> extractRequestSlots
  -> extractUserRequest
  -> resolveConversationReferences
  -> resolveContextualAmounts
  -> validateResolvedContext
  -> prepareOrModifyTransferConfirmation
  -> routeReadOnlyTools
  -> composeResponse
  -> applyConversationMemoryUpdates
  -> saveConversation
  -> END
```

### LangGraph Features To Use

- **Subgraphs**
  - Transfer preparation subgraph:
    `extract draft -> resolve recipient -> resolve amount -> validate -> create confirmation`
  - Read-only answer subgraph:
    `resolve references -> build tool input -> execute tools -> apply memory`
  - Clarification subgraph:
    `detect clarification reply -> resolve option -> resume original intent`
- **Checkpoints / persisted state**
  - Keep Mongo-backed conversation state as the source of persistence.
  - Optionally wrap it in a LangGraph-compatible checkpointer later if the
    installed package version supports it cleanly.
- **Streaming**
  - Stream response text only after safety-critical nodes have completed.
  - Do not stream transfer confirmation cards until backend validation succeeds.
  - Stream node status events internally for debugging, not as user-visible facts.
- **Interrupts**
  - Use explicit interrupt-like states for missing recipient, missing amount,
    ambiguous counterparty, ambiguous transaction, and ambiguous pending transfer.
  - Persist enough state to resume the original intent after the user's answer.

## Phase 1: Failure Capture And Debuggability

Goal: make every fallback explainable from logs and tests.

Files:

```text
server/src/ai/state.ts
server/src/ai/graph.ts
server/src/ai/llm.ts
server/src/ai/messageNormalization.ts
server/src/services/aiAuditLog.service.ts
server/src/ai/tests/aiSafety.test.ts
```

Patch items:

- Add structured extraction diagnostics:
  - `nodeName`
  - `schemaName`
  - `failedField`
  - `rawValueType`
  - `fallbackUsed`
  - `fallbackReason`
- Keep raw LLM output out of logs by default. Log field names and error codes,
  not full prompts or full user/account data.
- Add a dev-only debug flag, for example `VIRLY_AI_DEBUG_TRACE`, that can emit
  node transitions and sanitized draft snapshots.
- Add `debugTrace?: AiGraphDebugEvent[]` to internal graph state only, not the
  public API by default.
- Track these failure classes:
  - `classifier_failed`
  - `draft_schema_failed`
  - `draft_partial_recovered`
  - `resolver_failed`
  - `deterministic_fallback_used`
  - `contextual_amount_unresolved`
  - `clarification_started`
  - `clarification_resolved`

Tests:

- Extractor schema failure logs only sanitized diagnostics.
- Invalid `recipientEmail` does not leak raw prompt content.
- Graph records fallback reason when deterministic parsing is used.

## Phase 2: Tolerant Transfer Draft Extraction

Goal: one malformed extracted field must not discard the whole draft.

Files:

```text
server/src/ai/llm.ts
server/src/ai/graph.ts
server/src/ai/state.ts
server/src/ai/tests/aiSafety.test.ts
```

Patch items:

- Replace strict all-or-nothing transfer draft parsing with tolerant parsing:
  - parse the raw structured output through a permissive schema first
  - normalize each field independently
  - validate each field independently
  - downgrade invalid `recipientEmail` to `recipientReference`
  - preserve valid `amount`, `amountReferenceText`, `currency`, and `reason`
- Keep the final `TransferDraft` type strict after normalization.
- Change `normalizeEmail()` behavior:
  - if a string contains exactly one email, extract it
  - if no valid email exists, return `null`
  - pass the original text into `recipientReference` when useful
- Teach the prompt not to output display labels as `recipientEmail`.
- Sanitize recent assistant messages before draft extraction and reference
  resolution. Assistant messages may contain full emails for the user, but LLM
  context should receive masked labels.

Examples to support:

```text
send him 50
send jokic@nuggets.com 50
send Nikola Jokic 50
send Nikola Jokic (j***@nuggets.com) 50
בוא נעביר לו 50
תעביר לניקולה 50
```

Tests:

- Invalid LLM `recipientEmail = "Nikola Jokic (jokic@nuggets.com)"` extracts
  `jokic@nuggets.com`.
- Invalid LLM `recipientEmail = "him"` becomes `recipientReference = "him"`.
- If recipient email is invalid but amount is valid, the amount is preserved.
- If amount is contextual, `amountReferenceText` is preserved.

## Phase 3: Unified User Request Object

Goal: move from scattered slots to a single normalized request object.

Files:

```text
server/src/ai/state.ts
server/src/ai/messageNormalization.ts
server/src/ai/graph.ts
server/src/ai/toolInputs.ts
```

Add:

```ts
type AiUserRequest = {
  intent: AssistantIntent;
  language: "he" | "en" | "mixed" | "unknown";
  operation:
    | "read"
    | "prepare_transfer"
    | "modify_pending_transfer"
    | "clarify"
    | "help"
    | "unsafe";

  counterpartyRef?: {
    rawText: string;
    kind:
      | "explicit_email"
      | "visible_label"
      | "name"
      | "pronoun"
      | "ordinal"
      | "last_counterparty"
      | "current_pending_recipient";
    email?: string | null;
    query?: string | null;
    ordinal?: number | null;
  };

  amountRef?: {
    rawText: string;
    kind:
      | "literal"
      | "same_as_last_transfer"
      | "same_as_last_sent_to_counterparty"
      | "same_as_last_received_from_counterparty"
      | "same_as_previous_answer_total"
      | "same_as_pending_transfer"
      | "unknown";
    value?: number | null;
    currency?: "ILS" | "USD" | "EUR" | "UNKNOWN" | null;
  };

  dateRangeRef?: {
    rawText: string;
    kind:
      | "today"
      | "yesterday"
      | "this_week"
      | "last_week"
      | "this_month"
      | "last_month"
      | "relative"
      | "unknown";
    resolvedFrom?: string | null;
    resolvedTo?: string | null;
  };

  direction?: "sent" | "received" | "both" | null;
  reason?: string | null;
};
```

Use this object as the input to resolver and tool-input builders. Keep the
existing slots temporarily as a compatibility layer during migration.

## Phase 4: Better Deterministic Natural-Language Capture

Goal: cover common English/Hebrew expressions before relying on the LLM.

Files:

```text
server/src/ai/messageNormalization.ts
server/src/ai/router.ts
server/src/ai/counterpartyMemory.ts
server/src/ai/tests/aiSafety.test.ts
```

Add deterministic capture for recipient references:

```text
he, him, she, her, they, them
him again, her again, same person, same recipient
the guy, the person from before, the last one
לו, לה, אליו, אליה, איתו, איתה
אותו אחד, אותה אחת, הנמען הקודם, האדם הקודם
```

Add deterministic capture for amount references:

```text
same amount
same amount again
same as before
same as last time
same amount I sent him
same amount he sent me
what he sent me
what I sent him
אותה כמות
אותו סכום
כמו קודם
כמו פעם שעברה
מה שהוא שלח לי
מה ששלחתי לו
```

Add deterministic capture for read-only received-total questions:

```text
how much did he send me?
how much has she paid me?
how much did I receive from him?
כמה הוא שלח לי?
כמה קיבלתי ממנו?
כמה היא העבירה לי?
```

Add deterministic capture for sent-total questions:

```text
how much did I send him?
how much have I paid her?
כמה שלחתי לו?
כמה העברתי אליה?
```

Tests:

- English and Hebrew pronoun references resolve against last counterparty.
- Mixed-language references resolve:
  - `תעביר him again 50`
  - `send לו 50`
  - `same amount שהוא שלח לי`
- Ambiguous pronoun with no memory asks a clarification.

## Phase 5: General Conversation Reference Resolver

Goal: resolve all references in one node, not only counterparties.

Files:

```text
server/src/ai/graph.ts
server/src/ai/conversationReferences.ts
server/src/ai/counterpartyMemory.ts
server/src/ai/toolMemory.ts
server/src/ai/state.ts
```

Create `conversationReferences.ts`:

```ts
type ResolvedConversationReferences = {
  counterparty?: CounterpartyRef;
  amount?: ResolvedAmountRef;
  transactionId?: string;
  pendingTransferId?: string;
  dateRange?: ResolvedDateRange;
  clarification?: ClarificationRequest;
};
```

Resolution order:

1. Current clarification options.
2. Current pending confirmation.
3. Explicit email in user message.
4. Visible user label from memory.
5. Masked label from memory.
6. Display name and aliases.
7. Local-part alias.
8. Last counterparty / pronoun.
9. Answer-frame entities.
10. Backend resolver tools when needed.

For every resolved value, record:

```text
source
confidence
reason
candidate count
```

Do not silently resolve if multiple candidates have similar confidence. Ask a
clarification with structured options.

## Phase 6: Contextual Amount Resolver

Goal: turn `amountReferenceText` into a validated numeric amount before transfer
preparation.

Files:

```text
server/src/ai/amountResolution.ts
server/src/ai/graph.ts
server/src/ai/toolMemory.ts
server/src/services/aiPendingTransfer.service.ts
server/src/ai/tools/transactionHelpers.ts
server/src/ai/tests/aiSafety.test.ts
```

Create `amountResolution.ts`:

```ts
type ResolvedAmountRef = {
  amount: number;
  currency: "ILS";
  source:
    | "literal_user_message"
    | "last_pending_transfer"
    | "last_sent_transaction"
    | "last_received_transaction"
    | "last_answer_total_sent"
    | "last_answer_total_received"
    | "clarification_reply";
  confidence: "low" | "medium" | "high";
  explanation: string;
};
```

Supported amount references:

```text
same amount again
same as last time
same amount I sent him
same amount he sent me
what he sent me
what I sent him
same as this pending transfer
אותה כמות
אותו סכום
כמו קודם
כמו פעם שעברה
מה שהוא שלח לי
מה ששלחתי לו
```

Backend lookup rules:

- Scope all transaction lookup by authenticated `userId`.
- If the reference says "he sent me", use latest or total `credit`
  transaction(s) with the resolved counterparty based on wording.
- If the reference says "I sent him", use latest or total `debit`
  transaction(s) with the resolved counterparty based on wording.
- If the reference says only "same amount again", prefer:
  - active pending confirmation amount
  - last sent transaction to resolved counterparty
  - latest answer-frame amount
- Do not infer from unrelated counterparties.
- If multiple interpretations are plausible, ask:
  `Do you mean the last amount or the total amount?`

Transfer preparation integration:

- `resolveContextualAmounts` runs before `prepareTransferConfirmation`.
- It fills `transferDraft.amount` only after backend resolution.
- `prepareAiPendingTransfer` should receive a numeric amount only.
- If unresolved, do not create `AiPendingTransfer`.

Tests:

- `send him the same amount again` resolves to last sent amount to that
  counterparty.
- `send him the same amount he sent me` resolves from received transactions.
- `send him what I sent him last time` resolves from latest debit.
- Ambiguous "same amount" asks a clarification.
- Insufficient balance still blocks after contextual resolution.

## Phase 7: Add Received-From Counterparty Tools

Goal: answer "how much did they send me?" directly and support transfer amount
references based on received amounts.

Files:

```text
server/src/ai/state.ts
server/src/ai/router.ts
server/src/ai/tools/index.ts
server/src/ai/tools/getTotalReceivedFromCounterparty.ts
server/src/ai/tools/getNetWithCounterparty.ts
server/src/ai/tests/aiSafety.test.ts
openapi.yaml
client/src/lib/types.ts
```

Add intents:

```ts
"counterparty_total_received"
"counterparty_net_total"
```

Add tools:

```ts
"getTotalReceivedFromCounterparty"
"getNetWithCounterparty"
```

Routing:

```text
counterparty_total_received -> resolveCounterpartyCandidates/getTotalReceivedFromCounterparty
counterparty_net_total -> resolveCounterpartyCandidates/getNetWithCounterparty
```

Examples:

```text
how much did he send me?
how much has jokic@nuggets.com paid me?
how much did I receive from Nikola?
what is the net between me and him?
כמה הוא שלח לי?
כמה קיבלתי ממנו?
מה הנטו בינינו?
```

Response behavior:

- Use full emails for user-visible labels.
- Use masked labels in LLM-facing summaries.
- Store totals in answer frames so later transfer references can say:
  `send him that amount`.

## Phase 8: Memory Upgrade For Fluid Conversation

Goal: persist enough structured context to avoid repeated clarification loops.

Files:

```text
server/src/ai/state.ts
server/src/ai/counterpartyMemory.ts
server/src/ai/toolMemory.ts
server/src/services/aiConversation.service.ts
```

Extend memory entities:

```ts
type ConversationEntity =
  | CounterpartyEntity
  | TransactionEntity
  | PendingTransferEntity
  | DateRangeEntity
  | AmountEntity
  | TotalEntity
  | TransferDraftEntity;
```

Add `TotalEntity`:

```ts
type TotalEntity = {
  id: string;
  type: "total";
  counterpartyEmail?: string;
  direction: "sent" | "received" | "net";
  amount: number;
  currency: "ILS";
  sourceToolName: AssistantToolName;
  turnIntroduced: number;
  turnLastReferenced: number;
  aliases: string[];
};
```

Store answer-frame query context:

```ts
queryContext: {
  counterpartyEmail?: string;
  direction?: "sent" | "received" | "both";
  dateRange?: DateRange;
  amountRole?: "literal" | "total" | "last_transaction";
}
```

Memory rules:

- Keep backend identifiers and full emails internal.
- Provide full emails only in user-visible response text.
- Provide masked labels to the responder prompt.
- Trim memory by turn recency and entity type.
- Never let old pending confirmations override current pending confirmations.

## Phase 9: Clarification And Resume Flow

Goal: clarification answers should continue the original task.

Files:

```text
server/src/ai/state.ts
server/src/ai/graph.ts
server/src/ai/conversationReferences.ts
server/src/ai/tests/aiSafety.test.ts
```

Add:

```ts
type ClarificationRequest = {
  reason:
    | "ambiguous_recipient"
    | "ambiguous_amount"
    | "missing_transfer_amount"
    | "missing_transfer_recipient"
    | "ambiguous_transaction"
    | "ambiguous_pending_transfer"
    | "unsupported_currency"
    | "unresolved_reference";

  expectedReplyType:
    | "recipient"
    | "amount"
    | "amount_scope"
    | "currency"
    | "date_range"
    | "transaction"
    | "pending_transfer"
    | "yes_no";

  resumeIntent: AssistantIntent;
  resumeDraft?: TransferDraft;
  options?: ClarificationOption[];
};
```

Supported fluid flows:

```text
User: send him the same amount
Assistant: Do you mean the last amount you sent him, or the total he sent you?
User: the total he sent me
Assistant: [new transfer confirmation card]
```

```text
User: how much did Daniel send me?
Assistant: I found two Daniels. Which one?
User: the Nuggets one
Assistant: Nikola Jokic sent you 120.00 ILS total.
User: send him that amount
Assistant: [new transfer confirmation card for 120.00 ILS]
```

## Phase 10: Safer Response Composition

Goal: improve natural wording without giving the LLM authority over facts.

Files:

```text
server/src/ai/llm.ts
server/src/ai/toolResults.ts
server/src/ai/graph.ts
```

Patch items:

- Split responder input into:
  - `safeToolSummaries`
  - `safeConversationSummary`
  - `safeResolvedReferences`
  - `requiredResponseFacts`
- Make `requiredResponseFacts` deterministic and assert they appear or are not
  contradicted.
- Add a response post-check:
  - must not say transfer was sent unless confirmation endpoint executed
  - must not change amount, recipient, status, balance, or date facts
  - must not expose masked labels to user if a full user label is available
- If post-check fails, use deterministic fallback.

## Phase 11: Streaming Plan

Goal: make the UI feel responsive without streaming unsafe or premature facts.

Files:

```text
server/src/routes/ai.routes.ts
server/src/ai/graph.ts
client/src/components/ui/floating-chat-widget-shadcnui.tsx
client/src/lib/types.ts
openapi.yaml
```

Streaming phases:

```text
1. accepted
2. understanding_request
3. resolving_context
4. checking_account_facts
5. preparing_confirmation
6. composing_response
7. completed
```

Rules:

- Stream status events, not account facts, until tools complete.
- Do not stream a transfer confirmation until backend validation succeeds.
- For read-only answers, stream the final response after tool results are ready.
- Preserve the existing non-streaming endpoint as the compatibility path.

## Phase 12: Natural-Language Scenario Matrix

Goal: create a test matrix that covers realistic phrasing.

Add coverage for:

### Recipient References

```text
him, her, them, that person, same person, last recipient
he, she, the guy, the one from before
לו, לה, אליו, אליה, איתו, איתה, אותו אחד, אותה אחת
Nikola, Nikola Jokic, jokic, jokic@nuggets.com
Nikola Jokic (jokic@nuggets.com)
```

### Amount References

```text
50
50 shekels
₪50
fifty shekels
same amount
same amount again
same as last time
same amount he sent me
what he sent me
what I sent him
אותה כמות
אותו סכום
כמו קודם
מה שהוא שלח לי
מה ששלחתי לו
```

### Read-Only Questions

```text
who did I send money to today?
who sent me money today?
how much did I send him?
how much did he send me?
what is my net with him?
show activity with him
tell me more about the second one
למי העברתי היום?
מי העביר לי היום?
כמה שלחתי לו?
כמה הוא שלח לי?
```

### Transfer Preparation

```text
send him 50
send him the same amount
send him the same amount he sent me
send jokic@nuggets.com what I sent him last time
בוא נעביר לו 50
בוא נעביר לו שוב את אותה כמות
תעביר לו מה שהוא שלח לי
```

### Pending Confirmation

```text
actually make it 70
same recipient but 70
send it to Sarah instead
use the same amount as before
yes
confirm it
deny it
```

Expected rule:

- `yes`, `confirm it`, and similar chat text never executes money movement.
- Pending transfer modification creates a new confirmation card.
- Contextual transfer requests create a card only after recipient and amount are
  resolved by backend-supported logic.

## Phase 13: Evaluation Harness

Goal: make regression detection easier than manual chat testing.

Files:

```text
server/src/ai/evals/
server/src/ai/tests/aiSafety.test.ts
scripts/ai-eval-chat.sh
```

Add fixtures:

```text
server/src/ai/evals/conversations.transfer-context.json
server/src/ai/evals/conversations.counterparty-history.json
server/src/ai/evals/conversations.hebrew-mixed.json
server/src/ai/evals/conversations.pending-confirmations.json
```

Each scenario should specify:

```ts
type AiEvalTurnExpectation = {
  userMessage: string;
  expectedIntent?: AssistantIntent;
  expectedToolCalls?: AssistantToolName[];
  expectedConfirmation?: {
    recipientEmail?: string;
    amount?: number;
  };
  mustInclude?: string[];
  mustNotInclude?: string[];
  mustAskClarification?: boolean;
};
```

Run evals against:

- deterministic-only provider
- configured LLM provider in dev
- seeded Mongo data

## Phase 14: Developer Documentation And Contracts

Goal: make future assistant changes safer.

Files:

```text
docs/ai-assistant.md
docs/ai-tool-plan-steps.md
openapi.yaml
```

Document:

- graph node responsibilities
- subgraph boundaries
- transfer safety boundaries
- LLM-safe vs user-visible label rules
- contextual amount resolution rules
- clarification resume flow
- scenario matrix
- how to run tests and evals

## Implementation Order

Recommended order:

1. Add diagnostics and tests for current failure modes.
2. Make transfer draft extraction tolerant.
3. Add deterministic pronoun and amount-reference capture.
4. Add general reference resolver scaffolding.
5. Add contextual amount resolver.
6. Add received-total and net counterparty tools.
7. Upgrade clarification resume flow.
8. Add streaming endpoint/UI behavior.
9. Add eval harness and documentation.

This order avoids a large rewrite and keeps transfer safety intact at each step.

## Verification Commands

Run after each implementation slice:

```bash
npm run build --workspace server
npm run test --workspace server
git diff --check
```

Run when client or OpenAPI changes are included:

```bash
npm run build --workspace client
```

If the repo adds or exposes an OpenAPI validation command later, include it in
the required verification set.

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
```

## Success Criteria

The following conversation should work naturally:

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

The assistant should not repeatedly ask for the recipient or amount when both
can be resolved from authenticated backend facts and recent conversation memory.
