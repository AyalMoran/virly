Below is a full roadmap for implementing the assistant response upgrade as one coherent change:

```txt
Goal:
Move Virly AI assistant responses from fragile free-form personality Markdown into a structured, situation-aware response system.

Main outcomes:
1. Hebrew/RTL formatting works correctly.
2. Financial data is rendered by deterministic UI cards.
3. Assistant personality vocabulary is applied only in valid contexts.
4. Transfer wording does not accidentally imply money moved before confirmation.
5. Existing business logic, transfer confirmation rules, auth, audit, and persistence stay unchanged.
```

# 1. Problem summary

You currently have two related issues.

## Issue A: Formatting and RTL rendering

The LLM returns something like:

```md
**היסטוריה:** שלחת **₪ 23,364.07** ל...
```

LangSmith shows it nicely because it understands Markdown. The live website renders raw Markdown or bad mixed-direction Hebrew/English text.

The result:

```txt
**היסטוריה:** שלחת **₪ 23,364.07**
```

Instead of clean UI.

## Issue B: Personality vocabulary is global and context-blind

Your personality config has one global `vocabulary` array per assistant.

Example:

```ts
vocabulary: [
  "יאללה",
  "הכסף כבר בדרך",
  "הכול עבר חלק",
  "שנייה אני מציץ במספרים"
]
```

The model sees all of these as allowed Oshri phrases, so it may use:

```txt
הכסף כבר בדרך
```

during:

```txt
balance inquiry
transfer modification
pending confirmation
failed transfer
insufficient funds
```

That is wrong because the phrase only makes sense after a backend-confirmed successful transfer.

# 2. Target architecture

The correct architecture is:

```txt
User message
  ↓
Intent classifier
  ↓
Auth/context checks
  ↓
Tool/subgraph execution
  ↓
Resolve response situation
  ↓
Build structured responseBlocks from trusted tool results
  ↓
Build situation-specific personality style context
  ↓
LLM generates short responseMessage only
  ↓
Personality phrase linter
  ↓
Return responseMessage + responseBlocks
  ↓
Frontend renders cards or sanitized Markdown fallback
```

The important separation:

```txt
Backend tools / services decide facts.
Response block builders shape facts.
Frontend renders facts.
LLM writes short natural-language framing.
Personality system controls tone, not financial truth.
```

# 3. Non-negotiable constraints

Do not change:

```txt
authentication
authorization
transfer validation
transfer execution
transfer confirmation semantics
audit logging
conversation persistence
source-of-truth hierarchy
database schema unless strictly needed
existing public API behavior unless backward compatible
```

Keep:

```ts
responseMessage: string
```

Add:

```ts
responseFormatVersion?: 1;
responseBlocks?: AssistantResponseBlock[];
```

Old frontend behavior must still work if `responseBlocks` is missing.

# 4. New backend response contract

Add a versioned response model.

```ts
export interface AssistantRunResult {
  responseMessage: string;
  responseFormatVersion?: 1;
  responseBlocks?: AssistantResponseBlock[];
  debugTrace?: DebugTraceItem[];
}
```

Define block types:

```ts
export type AssistantResponseBlock =
  | TextBlock
  | AccountSummaryBlock
  | TransactionListBlock
  | TransactionDetailBlock
  | TransactionStatsBlock
  | PendingTransfersBlock
  | TransferQuoteBlock
  | TransferConfirmationBlock
  | TransferStatusBlock
  | TransferLimitsBlock
  | EmptyStateBlock
  | NoticeBlock;
```

Base types:

```ts
export interface BaseBlock {
  id: string;
  type: string;
  title?: LocalizedText;
}

export interface LocalizedText {
  text: string;
  dir?: "rtl" | "ltr" | "auto";
}

export interface MoneyValue {
  amount: number;
  currency: "ILS";
  formatted?: string;
}
```

Example transaction block:

```ts
export interface TransactionListBlock extends BaseBlock {
  type: "transaction_list";
  title: LocalizedText;
  subtitle?: LocalizedText;
  transactions: TransactionListItem[];
  summary?: {
    totalCount?: number;
    totalAmount?: MoneyValue;
  };
}

export interface TransactionListItem {
  id: string;
  direction: "sent" | "received";
  counterpartyName: string;
  counterpartyEmail?: string;
  amount: MoneyValue;
  status?: "pending" | "completed" | "failed" | "cancelled";
  createdAt: string;
  reference?: string;
  description?: string;
}
```

# 5. New personality model

Replace global `vocabulary` with contextual phrase packs.

## Current shape

```ts
export interface AssistantPersonality {
  id: AssistantId;
  name: string;
  role: string;
  traits: string[];
  vocabulary: string[];
  responseGuidance: string;
}
```

## New shape

```ts
export interface AssistantPersonalityV2 {
  id: AssistantId;
  name: string;
  role: string;
  traits: string[];
  globalGuidance: string;
  phrasePacks: Partial<Record<ResponseSituation, PhrasePack>>;
}
```

Types:

```ts
export type AssistantId =
  | "oshri"
  | "chaya"
  | "yehuda"
  | "yohai_daniel";

export type ResponseSituation =
  | "balance_inquiry_success"
  | "account_summary_success"
  | "transaction_history_success"
  | "transaction_stats_success"
  | "transfer_prepare_needs_confirmation"
  | "transfer_modify_pending_success"
  | "transfer_confirmed_success"
  | "transfer_cancelled_success"
  | "transfer_status_success"
  | "transfer_limits_success"
  | "missing_required_transfer_details"
  | "insufficient_funds"
  | "transfer_failed"
  | "security_sensitive"
  | "general_help";

export type RiskLevel =
  | "low"
  | "medium"
  | "high"
  | "blocked";

export interface PhrasePack {
  maxPhrases: number;
  openings?: string[];
  resultIntros?: string[];
  closings?: string[];
  flavor?: string[];
  forbidden?: string[];
  guidance: string;
}
```

Key rule:

```txt
A phrase is not just an Oshri phrase.
A phrase is an Oshri phrase allowed for a specific response situation.
```

Example:

```txt
"הכסף כבר בדרך"
```

Allowed only for:

```txt
transfer_confirmed_success
```

Forbidden for:

```txt
balance_inquiry_success
transfer_prepare_needs_confirmation
transfer_modify_pending_success
insufficient_funds
security_sensitive
```

# 6. Response situation resolver

Create a deterministic function that maps intent and execution outcome into a response situation.

Suggested file:

```txt
server/src/ai/response/resolve-response-situation.ts
```

Implementation:

```ts
export interface ResolveResponseSituationInput {
  intent: string;
  riskLevel?: RiskLevel;
  toolSucceeded?: boolean;
  requiresConfirmation?: boolean;
  transferStatus?: string;
  missingFields?: string[];
  failureReason?: string;
}

export function resolveResponseSituation(
  input: ResolveResponseSituationInput
): ResponseSituation {
  if (input.riskLevel === "high" || input.riskLevel === "blocked") {
    return "security_sensitive";
  }

  if (!input.toolSucceeded) {
    if (input.failureReason === "insufficient_funds") {
      return "insufficient_funds";
    }

    return "transfer_failed";
  }

  if (input.missingFields && input.missingFields.length > 0) {
    return "missing_required_transfer_details";
  }

  switch (input.intent) {
    case "balance_inquiry":
      return "balance_inquiry_success";

    case "account_summary":
      return "account_summary_success";

    case "recent_transactions":
    case "transaction_search":
    case "counterparty_transactions":
      return "transaction_history_success";

    case "transaction_stats":
    case "cashflow_summary":
      return "transaction_stats_success";

    case "transfer_prepare":
      return "transfer_prepare_needs_confirmation";

    case "transfer_modify_pending":
      return "transfer_modify_pending_success";

    case "transfer_cancel_pending":
      return "transfer_cancelled_success";

    case "transfer_status":
    case "pending_ai_transfers":
    case "pending_confirmation_status":
      return "transfer_status_success";

    case "transfer_limits":
    case "transfer_eligibility":
    case "daily_transfer_usage":
      return "transfer_limits_success";

    default:
      return "general_help";
  }
}
```

This function must not query the database or change transfer state. It only labels the response.

# 7. Style context builder

Suggested file:

```txt
server/src/ai/personality/build-response-style-context.ts
```

```ts
export interface ResponseStyleContext {
  assistantId: AssistantId;
  assistantName: string;
  situation: ResponseSituation;
  riskLevel: RiskLevel;
  maxPersonalityPhrases: number;
  allowedPhrases: string[];
  forbiddenPhrases: string[];
  guidance: string;
}

export function buildResponseStyleContext(
  personality: AssistantPersonalityV2,
  situation: ResponseSituation,
  riskLevel: RiskLevel
): ResponseStyleContext {
  const pack = personality.phrasePacks[situation];

  if (!pack) {
    return {
      assistantId: personality.id,
      assistantName: personality.name,
      situation,
      riskLevel,
      maxPersonalityPhrases: 0,
      allowedPhrases: [],
      forbiddenPhrases: [],
      guidance:
        personality.globalGuidance +
        "\nNo situation-specific phrase pack is available. Use clear, neutral wording."
    };
  }

  const highRisk = riskLevel === "high" || riskLevel === "blocked";

  const allowedPhrases = highRisk
    ? []
    : [
        ...(pack.openings ?? []),
        ...(pack.resultIntros ?? []),
        ...(pack.closings ?? []),
        ...(pack.flavor ?? [])
      ];

  return {
    assistantId: personality.id,
    assistantName: personality.name,
    situation,
    riskLevel,
    maxPersonalityPhrases: highRisk ? 0 : pack.maxPhrases,
    allowedPhrases,
    forbiddenPhrases: pack.forbidden ?? [],
    guidance:
      personality.globalGuidance +
      "\n\nSituation guidance:\n" +
      pack.guidance
  };
}
```

# 8. Prompt changes

The LLM should not receive the full vocabulary anymore.

It should receive only the active style context.

```ts
export function buildPersonalityPromptSection(
  style: ResponseStyleContext
): string {
  return `
Assistant personality: ${style.assistantName}
Response situation: ${style.situation}
Risk level: ${style.riskLevel}

Tone guidance:
${style.guidance}

Allowed personality phrases for this response:
${style.allowedPhrases.length > 0 ? style.allowedPhrases.map((p) => `- ${p}`).join("\n") : "- None"}

Forbidden phrases for this response:
${style.forbiddenPhrases.length > 0 ? style.forbiddenPhrases.map((p) => `- ${p}`).join("\n") : "- None"}

Rules:
- Use at most ${style.maxPersonalityPhrases} personality phrase(s).
- Do not force personality phrasing.
- Do not use phrases from the global personality unless they appear in the allowed list above.
- Do not use any forbidden phrase.
- Put the financial fact, required confirmation, missing detail, status, or next step first.
- If structured response blocks exist, do not duplicate the full financial data in prose.
- Never imply that a transfer completed unless backend state confirms execution success.
`.trim();
}
```

Also add a response-block instruction:

```txt
When structured response blocks are available, write only a short localized introduction or conclusion.
Do not manually format transaction lists, account summaries, pending transfers, money amounts, or financial tables as Markdown.
The UI will render structured financial data from trusted backend blocks.
```

# 9. Personality phrase linter

Suggested file:

```txt
server/src/ai/personality/personality-linter.ts
```

```ts
export interface PersonalityLintResult {
  valid: boolean;
  disallowedPhrases: string[];
  tooManyPersonalityPhrases: boolean;
}

export function collectAllKnownPersonalityPhrases(
  personalities: Record<AssistantId, AssistantPersonalityV2>
): string[] {
  const phrases = new Set<string>();

  for (const personality of Object.values(personalities)) {
    for (const pack of Object.values(personality.phrasePacks)) {
      if (!pack) {
        continue;
      }

      for (const phrase of [
        ...(pack.openings ?? []),
        ...(pack.resultIntros ?? []),
        ...(pack.closings ?? []),
        ...(pack.flavor ?? []),
        ...(pack.forbidden ?? [])
      ]) {
        phrases.add(phrase);
      }
    }
  }

  return Array.from(phrases);
}

export function lintPersonalityUsage(
  responseText: string,
  style: ResponseStyleContext,
  allKnownPhrases: string[]
): PersonalityLintResult {
  const usedKnownPhrases = allKnownPhrases.filter((phrase) =>
    responseText.includes(phrase)
  );

  const allowedSet = new Set(style.allowedPhrases);

  const disallowedPhrases = usedKnownPhrases.filter(
    (phrase) => !allowedSet.has(phrase)
  );

  const allowedUsedCount = usedKnownPhrases.filter((phrase) =>
    allowedSet.has(phrase)
  ).length;

  return {
    valid:
      disallowedPhrases.length === 0 &&
      allowedUsedCount <= style.maxPersonalityPhrases,
    disallowedPhrases,
    tooManyPersonalityPhrases:
      allowedUsedCount > style.maxPersonalityPhrases
  };
}
```

Recommended behavior:

```txt
1. Generate response once.
2. Lint personality usage.
3. If invalid, regenerate once with stricter instruction.
4. If still invalid, return deterministic neutral fallback.
```

# 10. Response block builders

Suggested files:

```txt
server/src/ai/response-blocks/types.ts
server/src/ai/response-blocks/build-response-blocks.ts
server/src/ai/response-blocks/build-account-summary-block.ts
server/src/ai/response-blocks/build-transaction-list-block.ts
server/src/ai/response-blocks/build-transfer-blocks.ts
server/src/ai/response-blocks/build-notice-block.ts
```

Main dispatcher:

```ts
export function buildAssistantResponseBlocks(
  state: AssistantGraphState
): AssistantResponseBlock[] {
  switch (state.intent) {
    case "balance_inquiry":
    case "account_summary":
      return buildAccountSummaryBlocks(state);

    case "recent_transactions":
    case "transaction_search":
    case "counterparty_transactions":
      return buildTransactionListBlocks(state);

    case "transaction_detail":
      return buildTransactionDetailBlocks(state);

    case "transaction_stats":
    case "cashflow_summary":
      return buildTransactionStatsBlocks(state);

    case "pending_ai_transfers":
    case "pending_confirmation_status":
      return buildPendingTransferBlocks(state);

    case "transfer_prepare":
      return buildTransferConfirmationBlocks(state);

    case "transfer_modify_pending":
      return buildTransferModificationBlocks(state);

    case "transfer_quote":
      return buildTransferQuoteBlocks(state);

    case "transfer_status":
      return buildTransferStatusBlocks(state);

    case "transfer_limits":
    case "transfer_eligibility":
    case "daily_transfer_usage":
      return buildTransferLimitsBlocks(state);

    default:
      return [];
  }
}
```

Rules:

```txt
Block builders consume existing tool results.
Block builders do not call mutation services.
Block builders do not invent missing values.
Block builders return empty_state or notice when data is empty.
Block builders preserve raw numeric values and let frontend format display.
```

# 11. Frontend renderer

Current behavior probably renders one `responseMessage`.

Change to:

```tsx
export function AssistantMessage({ message }: { message: AssistantMessageModel }) {
  if (message.responseBlocks?.length) {
    return (
      <div className="assistant-message" dir="auto">
        {message.responseMessage && (
          <AssistantText text={message.responseMessage} />
        )}

        <AssistantBlocks blocks={message.responseBlocks} />
      </div>
    );
  }

  return <AssistantMarkdown text={message.responseMessage} />;
}
```

Components:

```txt
AssistantText
AssistantMarkdown
AssistantBlocks
AssistantCard
KeyValueGrid
MoneyValue
DateTimeValue
CounterpartyValue
StatusBadge
TransactionListCard
TransactionRow
AccountSummaryCard
PendingTransferCard
TransferConfirmationCard
TransferQuoteCard
TransferStatusCard
TransferLimitsCard
EmptyStateCard
NoticeCard
```

RTL rules:

```tsx
<span dir="auto">{text}</span>
<bdi dir="ltr">{email}</bdi>
<bdi dir="ltr">{englishName}</bdi>
<bdi dir="ltr">{formattedAmount}</bdi>
```

CSS:

```css
.assistant-message {
  text-align: start;
  overflow-wrap: anywhere;
}

.assistant-card {
  padding: 12px;
  border-radius: 12px;
}

.assistant-card-row {
  display: flex;
  justify-content: space-between;
  gap: 12px;
}

.assistant-card-label {
  color: var(--muted-text);
}

.assistant-card-value {
  font-weight: 600;
}

.ltr-token {
  direction: ltr;
  unicode-bidi: isolate;
}
```

Money formatter:

```ts
export function formatMoneyILS(amount: number, locale: string): string {
  return new Intl.NumberFormat(locale || "he-IL", {
    style: "currency",
    currency: "ILS",
    currencyDisplay: "narrowSymbol",
    minimumFractionDigits: 2,
    maximumFractionDigits: 2
  }).format(amount);
}
```

# 12. Migration roadmap

## Phase 0: Audit current flow

Deliverables:

```txt
Map all assistant intents.
Map which tools each intent uses.
Map where final responseMessage is generated.
Map current personality injection location.
Map transfer pending/confirmation flow.
Map frontend assistant message renderer.
```

Output document:

```txt
docs/ai-response-rendering-migration.md
```

Include:

```txt
Current response shape
Current prompt structure
Current personality config
Current frontend rendering behavior
Known broken Hebrew examples
Risk-sensitive transfer states
```

## Phase 1: Immediate rendering safety fix

Goal: stop raw Markdown and improve Hebrew display before deeper migration.

Backend changes:

```txt
None required.
```

Frontend changes:

```txt
Add sanitized Markdown fallback renderer.
Add dir="auto" to assistant bubble.
Add text-align: start.
Add overflow-wrap: anywhere.
Add bdi/ltr wrappers where possible for detected emails, numbers, references, and currency.
```

Acceptance criteria:

```txt
Raw **bold** does not show in normal assistant replies.
Hebrew messages align correctly.
Mixed Hebrew/English text does not visually break badly.
Long email addresses do not overflow.
```

## Phase 2: Add responseBlocks contract

Goal: introduce new API shape without breaking old clients.

Backend changes:

```ts
responseFormatVersion?: 1;
responseBlocks?: AssistantResponseBlock[];
```

Frontend changes:

```txt
If responseBlocks exist, render blocks.
If not, render responseMessage fallback.
```

Acceptance criteria:

```txt
Existing messages still render.
New block-capable messages render without relying on Markdown.
No business logic changes.
```

## Phase 3: Implement response situation resolver

Goal: classify the response context after tool execution.

Add:

```txt
resolveResponseSituation()
RiskLevel type
ResponseSituation type
unit tests
```

Acceptance criteria:

```txt
balance_inquiry -> balance_inquiry_success
transfer_prepare -> transfer_prepare_needs_confirmation
transfer_modify_pending -> transfer_modify_pending_success
confirmed backend execution -> transfer_confirmed_success
insufficient funds -> insufficient_funds
blocked/high risk -> security_sensitive
```

Most important rule:

```txt
pending != completed
modified != completed
quoted != completed
prepared != completed
```

## Phase 4: Convert personalities to phrase packs

Goal: stop global vocabulary misuse.

Changes:

```txt
Replace vocabulary with phrasePacks.
Keep old responseGuidance temporarily as globalGuidance.
Move each phrase into valid situations.
Add forbidden phrases per situation.
```

Example Oshri split:

```txt
balance_inquiry_success:
- בדקתי לך
- הנה השורה התחתונה
- הכול בשליטה

transfer_prepare_needs_confirmation:
- אלה פרטי ההעברה לאישור
- לפני שממשיכים, צריך אישור ברור

transfer_modify_pending_success:
- סגור
- עדכנתי את פרטי ההעברה
- אלה הפרטים המעודכנים לאישור

transfer_confirmed_success:
- הכול עבר חלק
- הכסף כבר בדרך
- הכסף יצא למסע
- טיקי-טאקה פיננסי

insufficient_funds:
- no jokes
- no transfer-success phrases

security_sensitive:
- no slang
- no humor
```

Acceptance criteria:

```txt
The LLM no longer receives the full personality vocabulary.
Only situation-specific phrases are injected.
Transfer-success phrases are unavailable in balance, pending, modification, failed, or security-sensitive contexts.
```

## Phase 5: Add style context builder and prompt section

Goal: feed the model a narrow tone contract.

Add:

```txt
buildResponseStyleContext()
buildPersonalityPromptSection()
```

Prompt rule:

```txt
Use at most N personality phrases.
Do not force personality phrasing.
Do not use phrases outside allowed list.
Do not duplicate structured block data.
Put financial facts first.
```

Acceptance criteria:

```txt
Balance response gets balance vocabulary only.
Pending transfer response gets confirmation vocabulary only.
Confirmed transfer response may use success vocabulary.
High-risk response gets zero personality phrases.
```

## Phase 6: Add personality linter

Goal: enforce vocabulary constraints.

Add:

```txt
collectAllKnownPersonalityPhrases()
lintPersonalityUsage()
```

Behavior:

```txt
Generate once.
Lint.
Regenerate once if invalid.
Fallback to neutral deterministic message if still invalid.
```

Acceptance criteria:

```txt
Out-of-context phrase is caught.
Too many personality phrases are caught.
Forbidden phrases are caught.
Risk-sensitive responses contain no humor/slang.
```

## Phase 7: Build structured cards for read-only financial data

Start with low-risk read-only intents:

```txt
balance_inquiry
account_summary
recent_transactions
transaction_search
transaction_detail
transaction_stats
cashflow_summary
```

Add backend block builders and frontend cards.

Acceptance criteria:

```txt
Financial details come from responseBlocks.
responseMessage is only a short intro.
No Markdown tables for financial data.
Hebrew transaction history looks good on mobile and desktop.
```

## Phase 8: Build pending-transfer and transfer-related cards

This means presentation migration only. It does not mean changing transfer logic.

Cover:

```txt
transfer_prepare
transfer_modify_pending
transfer_cancel_pending
pending_ai_transfers
pending_confirmation_status
transfer_quote
transfer_status
transfer_limits
transfer_eligibility
daily_transfer_usage
```

Cards:

```txt
TransferConfirmationCard
PendingTransfersCard
TransferQuoteCard
TransferStatusCard
TransferLimitsCard
DailyTransferUsageCard
NoticeCard
```

Critical wording rules:

```txt
Prepared transfer:
"אלה פרטי ההעברה לאישור"
"שום כסף לא הועבר עדיין"

Modified pending transfer:
"הפרטים עודכנו"
"ההעברה עדיין דורשת אישור"

Confirmed transfer:
"הפעולה אושרה"
"הכסף כבר בדרך"

Cancelled transfer:
"ההעברה בוטלה"
"No money will be sent for this pending transfer"

Failed transfer:
"אי אפשר להשלים את ההעברה כרגע"
```

Acceptance criteria:

```txt
No pending/modified/quoted transfer response says "הכסף כבר בדרך".
Confirm/cancel buttons use existing backend confirmation semantics.
No frontend button bypasses backend validation.
```

## Phase 9: Update LangGraph state

Add fields to graph state:

```ts
interface AssistantGraphState {
  intent?: string;
  responseSituation?: ResponseSituation;
  riskLevel?: RiskLevel;
  responseBlocks?: AssistantResponseBlock[];
  responseStyleContext?: ResponseStyleContext;
  responseMessage?: string;
}
```

Graph flow:

```txt
classifyIntent
  ↓
authGate
  ↓
routeToIntentSubgraph
  ↓
executeTools
  ↓
resolveResponseSituationNode
  ↓
buildResponseBlocksNode
  ↓
buildResponseStyleContextNode
  ↓
generateResponseMessageNode
  ↓
lintResponsePersonalityNode
  ↓
finalizeResponseNode
```

Acceptance criteria:

```txt
LangSmith trace clearly shows situation, blocks, style context, and lint result.
No-op nodes are minimized.
Flow remains compatible with current conversation persistence.
```

## Phase 10: Tests

Backend unit tests:

```txt
resolveResponseSituation
buildResponseStyleContext
personality linter
response block builders
transfer wording state tests
fallback response generation
```

Frontend tests:

```txt
AssistantMessage fallback Markdown rendering
AssistantBlocks rendering
AccountSummaryCard Hebrew
TransactionListCard Hebrew + English names
MoneyValue direction handling
Email direction handling
Mobile wrapping
PendingTransferCard action display
```

E2E tests:

```txt
Hebrew balance inquiry
Hebrew account summary
Hebrew recent transactions
Mixed Hebrew/English transaction search
Transfer prepare requires confirmation
Transfer modify pending does not imply sent
Transfer confirmed success may use success phrase
Insufficient funds has no jokes
Security-sensitive response has zero slang/humor
No raw Markdown markers appear in structured financial responses
```

Regression tests:

```txt
Existing AI eval chat tests still pass.
Existing transfer confirmation tests still pass.
Existing authorization tests still pass.
Existing conversation persistence tests still pass.
```

# 13. Suggested file structure

```txt
server/src/ai/personality/
  assistant-personalities.ts
  personality-types.ts
  build-response-style-context.ts
  build-personality-prompt-section.ts
  personality-linter.ts

server/src/ai/response/
  resolve-response-situation.ts
  response-situation-types.ts
  response-generation-node.ts
  finalize-response-node.ts

server/src/ai/response-blocks/
  response-block-types.ts
  build-assistant-response-blocks.ts
  build-account-summary-blocks.ts
  build-transaction-list-blocks.ts
  build-transaction-detail-blocks.ts
  build-transaction-stats-blocks.ts
  build-transfer-confirmation-blocks.ts
  build-pending-transfer-blocks.ts
  build-transfer-status-blocks.ts
  build-transfer-limits-blocks.ts
  build-empty-state-block.ts
  build-notice-block.ts

frontend/src/components/assistant/
  AssistantMessage.tsx
  AssistantMarkdown.tsx
  AssistantBlocks.tsx
  AssistantCard.tsx
  KeyValueGrid.tsx
  MoneyValue.tsx
  DateTimeValue.tsx
  CounterpartyValue.tsx
  StatusBadge.tsx
  AccountSummaryCard.tsx
  TransactionListCard.tsx
  TransactionRow.tsx
  PendingTransferCard.tsx
  TransferConfirmationCard.tsx
  TransferQuoteCard.tsx
  TransferStatusCard.tsx
  TransferLimitsCard.tsx
  EmptyStateCard.tsx
  NoticeCard.tsx

frontend/src/components/assistant/styles/
  assistant-message.css
  assistant-cards.css
```

# 14. Acceptance checklist

The implementation is done when these are true:

```txt
1. Assistant responses can return responseMessage + responseBlocks.
2. Frontend renders responseBlocks as typed cards.
3. responseMessage remains backward compatible.
4. Markdown fallback is sanitized and renders bold/bullets correctly.
5. Hebrew/RTL mixed with English names, emails, numbers, and ILS amounts displays correctly.
6. Personalities use phrasePacks, not global vocabulary.
7. Only the active phrase pack is injected into the LLM prompt.
8. Response situation is resolved deterministically from intent, risk, and tool result state.
9. Pending transfer language never implies completed transfer.
10. Transfer-success vocabulary appears only after backend-confirmed execution.
11. High-risk/security-sensitive flows use zero humor and zero slang.
12. Personality linter catches out-of-context phrase usage.
13. Financial details are rendered from trusted tool results, not parsed from LLM prose.
14. Existing business logic remains unchanged.
15. Existing AI assistant abilities remain intact.
16. Tests cover Hebrew, mixed direction text, phrase misuse, and transfer states.
```

# 15. Best implementation order

The safest order is:

```txt
1. Add sanitized Markdown + RTL frontend fix.
2. Add responseBlocks contract with fallback.
3. Add response situation resolver.
4. Convert personality vocabulary into phrase packs.
5. Inject only active phrase pack into prompt.
6. Add personality linter.
7. Add structured cards for balance/account/transactions.
8. Add structured cards for pending transfers and transfer flows.
9. Add full backend/frontend/E2E tests.
10. Remove old global vocabulary usage.
```

This gives you incremental value without destabilizing the assistant.

# 16. Final coding-agent implementation goal

```txt
Implement a structured, situation-aware AI assistant response system for Virly.

The current assistant uses global personality vocabulary and free-form Markdown responseMessage strings. This causes awkward personality phrase usage and broken Hebrew/RTL formatting in the live website.

Refactor the assistant response flow so financial data is returned as typed responseBlocks and personality wording is selected by response situation.

Preserve all existing business logic, authentication, authorization, transfer validation, transfer confirmation semantics, audit behavior, tool behavior, and conversation persistence.

Required backend changes:
1. Add responseFormatVersion: 1 and optional responseBlocks to assistant responses while keeping responseMessage.
2. Define AssistantResponseBlock types for account summaries, transaction lists, transaction details, transaction stats, pending transfers, transfer confirmation, transfer quote, transfer status, transfer limits, empty states, notices, and text.
3. Add deterministic response block builders that consume existing tool results. They must not mutate state or invent financial data.
4. Add ResponseSituation and RiskLevel types.
5. Add resolveResponseSituation() to map intent, risk level, tool success, missing fields, failure reason, transfer state, and confirmation requirement into a response situation.
6. Replace global personality vocabulary with situation-specific phrasePacks.
7. Add buildResponseStyleContext() so the LLM receives only the active situation’s allowed phrases and forbidden phrases.
8. Update the final response prompt so the LLM writes only a short localized intro/conclusion when responseBlocks exist and does not manually format financial data.
9. Add a personality linter that detects forbidden phrases, out-of-context phrases, and too many personality phrases. Regenerate once if invalid, then fall back to neutral deterministic text.
10. Ensure pending, modified, quoted, or prepared transfers never use completed-transfer wording.

Required frontend changes:
1. Update AssistantMessage to render responseBlocks when present and fallback to sanitized Markdown responseMessage otherwise.
2. Add reusable assistant card components for structured financial data.
3. Add RTL-safe rendering using dir="auto", bdi dir="ltr" for emails/names/amounts/references, CSS logical properties, text-align:start, and overflow-safe wrapping.
4. Format ILS amounts using Intl.NumberFormat.
5. Ensure mobile layout works for long names, emails, amounts, and Hebrew text.

Required tests:
1. Unit tests for response situation resolution.
2. Unit tests for phrase pack selection and personality linting.
3. Unit tests for response block builders.
4. Frontend tests for Hebrew, mixed Hebrew/English, emails, currency, long text, and mobile wrapping.
5. E2E tests for Hebrew balance inquiry, account summary, transaction history, transaction search, pending transfers, transfer preparation, transfer modification, confirmed transfer, insufficient funds, and security-sensitive flows.
6. Regression tests proving existing transfer confirmation and authorization behavior did not change.

Implementation must be incremental:
Phase 1: Markdown fallback and RTL CSS fix.
Phase 2: responseBlocks contract.
Phase 3: response situation resolver.
Phase 4: personality phrase packs.
Phase 5: prompt/style context injection.
Phase 6: personality linter.
Phase 7: read-only financial cards.
Phase 8: pending-transfer and transfer-related cards.
Phase 9: tests, cleanup, and removal of old vocabulary injection.
```

