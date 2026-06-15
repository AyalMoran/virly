Right now the LLM is producing text that contains Markdown, Hebrew, English names, email addresses, numbers, and currency values in one free-form string. That is fragile because:

1. The website is not rendering Markdown consistently.
2. Mixed Hebrew and English causes bidi alignment problems.
3. Financial data should not depend on LLM formatting.
4. Different intents will keep producing inconsistent UI unless the response shape is standardized.

## Recommended direction

Use a **hybrid response model**:

```ts
{
  responseMessage: string,
  responseBlocks?: AssistantResponseBlock[],
  debugTrace?: DebugTraceItem[]
}
```

The LLM may still produce a short natural-language message, but structured financial data should be rendered by deterministic frontend components.

Example:

```ts
type AssistantResponseBlock =
  | UserSummaryBlock
  | AccountSummaryBlock
  | TransactionListBlock
  | TransactionStatsBlock
  | PendingTransferBlock
  | TransferQuoteBlock
  | EmptyStateBlock
  | NoticeBlock;
```

The website should render `responseBlocks` when they exist. `responseMessage` remains as a fallback for compatibility, LangSmith visibility, old conversations, and unstructured/general replies.

## Answer to question 1: should formatting be unified?

Yes. The output should be unified at the **response contract and UI system level**, not by forcing every intent to look identical.

Use one common visual grammar:

```txt
Assistant message
├── Optional intro text
├── One or more typed cards
│   ├── Title
│   ├── Subtitle / metadata
│   ├── Key-value rows
│   ├── List rows
│   └── Optional action/status area
└── Optional footer / clarification / warning
```

But each query type should have its own card component:

```txt
User Summary            -> UserSummaryCard
Account Summary         -> AccountSummaryCard
Transaction History     -> TransactionListCard
Transaction Stats       -> TransactionStatsCard
Pending Transfers       -> PendingTransfersCard
Transfer Quote          -> TransferQuoteCard
Transfer Confirmation   -> TransferConfirmationCard
```

So the UI is unified, but the content layout is intent-specific.

## Answer to question 2: best implementation

The best implementation is:

```txt
Backend tools return trusted structured data
        ↓
LangGraph stores tool result in state
        ↓
Response formatting node builds typed responseBlocks deterministically
        ↓
LLM writes only a short localized intro/fallback message
        ↓
API returns responseMessage + responseBlocks
        ↓
Frontend renders typed cards
```

Do **not** make the LLM responsible for final layout.

### Why not rely on Markdown?

Markdown is acceptable for casual text, but bad for this use case.

Pros:

```txt
- Easy to add quickly
- Good for simple explanations
- Works well for English-only prose
```

Cons:

```txt
- Fragile with Hebrew + English + numbers
- Hard to make responsive
- Hard to test visually
- Inconsistent between intents
- LLM may produce malformed Markdown
- Tables are especially bad on mobile
- Raw **bold** leaks when renderer/config changes
```

### Why not use only LLM structured output?

You can use LLM structured output for intent classification or narrative structure, but not as the source of truth for financial UI blocks.

Pros:

```txt
- Convenient
- Flexible
- Easy to add new layouts
```

Cons:

```txt
- LLM can omit fields
- LLM can rename fields
- LLM can reorder data incorrectly
- Requires strict schema validation anyway
- Adds risk around financial correctness
```

### Best option

Use deterministic backend formatting from tool results.

Pros:

```txt
- Stable
- Testable
- Good RTL support
- Responsive UI
- Safer for financial data
- Does not break existing business logic
- Keeps the LLM useful for language, not facts/layout
```

Cons:

```txt
- Requires frontend components
- Requires a versioned response schema
- Requires gradual migration per intent
```

This is the correct tradeoff for Virly.

---

# Proposed response contract

```ts
export interface AssistantRunResult {
  responseMessage: string;
  responseFormatVersion: 1;
  responseBlocks?: AssistantResponseBlock[];
  debugTrace?: DebugTraceItem[];
}

export type AssistantResponseBlock =
  | TextBlock
  | UserSummaryBlock
  | AccountSummaryBlock
  | TransactionListBlock
  | TransactionStatsBlock
  | PendingTransfersBlock
  | TransferQuoteBlock
  | TransferConfirmationBlock
  | EmptyStateBlock
  | NoticeBlock;

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

Example API response:

```json
{
  "responseMessage": "ואלה העסקאות שמצאתי במספרים שלך:",
  "responseFormatVersion": 1,
  "responseBlocks": [
    {
      "id": "block_recent_transactions_1",
      "type": "transaction_list",
      "title": {
        "text": "היסטוריית עסקאות",
        "dir": "rtl"
      },
      "subtitle": {
        "text": "4 עסקאות אחרונות",
        "dir": "rtl"
      },
      "transactions": [
        {
          "id": "txn_1",
          "direction": "sent",
          "counterpartyName": "Shai Gilgeous-Alexander",
          "counterpartyEmail": "sga@thunder.com",
          "amount": {
            "amount": 23364.07,
            "currency": "ILS"
          },
          "status": "completed",
          "createdAt": "2026-06-07T10:22:00.000Z"
        }
      ]
    }
  ]
}
```

---

# Frontend rendering rules

The assistant message renderer should follow this logic:

```ts
function AssistantMessage({ message }: { message: AssistantMessageModel }) {
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

For Hebrew and mixed English:

```tsx
<span dir="auto">{hebrewText}</span>
<bdi dir="ltr">{email}</bdi>
<bdi dir="ltr">{englishName}</bdi>
<bdi dir="ltr">{formattedAmount}</bdi>
```

Use CSS logical properties:

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

For amounts:

```ts
export function formatMoneyILS(amount: number, locale: string): string {
  return new Intl.NumberFormat(locale || "he-IL", {
    style: "currency",
    currency: "ILS",
    currencyDisplay: "narrowSymbol",
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  }).format(amount);
}
```

Then render:

```tsx
<bdi dir="ltr" className="ltr-token">
  {formatMoneyILS(transaction.amount.amount, locale)}
</bdi>
```

This prevents values like `₪ 23,364.07` from visually jumping around inside Hebrew text.

---

# Backend/LangGraph changes

Add a dedicated response formatting stage near the end of the graph.

Current rough flow:

```txt
classify intent
→ auth/context checks
→ tools
→ LLM response
→ return responseMessage
```

Improved flow:

```txt
classify intent
→ auth/context checks
→ tools
→ buildResponseBlocks
→ LLM writes short message using block context
→ return responseMessage + responseBlocks
```

The new node should not call external APIs or mutate business state.

```ts
/**
 * Function type: AI response presentation builder.
 *
 * @brief Converts trusted tool results into typed UI response blocks.
 */
export function buildAssistantResponseBlocks(
  state: AssistantGraphState
): AssistantResponseBlock[] {
  switch (state.intent) {
    case "recent_transactions":
    case "transaction_search":
    case "counterparty_transactions":
      return buildTransactionListBlocks(state);

    case "account_summary":
    case "balance_inquiry":
      return buildAccountSummaryBlocks(state);

    case "pending_ai_transfers":
    case "pending_confirmation_status":
      return buildPendingTransferBlocks(state);

    case "transaction_stats":
    case "cashflow_summary":
      return buildStatsBlocks(state);

    default:
      return [];
  }
}
```

Important: this node should consume existing tool results. It should not re-query balances, transactions, users, or transfers. That avoids changing business logic.

---

# Prompt changes

The LLM should stop trying to create beautiful Markdown for structured data.

Use an instruction like:

```txt
When structured response blocks are available, do not repeat the full data as Markdown.
Write only a short natural-language introduction or conclusion.
Do not format transaction lists, account summaries, pending transfers, or money amounts manually.
The UI will render structured financial data from trusted backend blocks.
```

For example, instead of:

```md
**היסטוריה:**
- שלחת **₪ 23,364.07** ל...
```

The LLM should produce:

```txt
ואלה העסקאות שמצאתי:
```

The card handles the rest.

---

# UI component set

Start with these components:

```txt
AssistantText
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
EmptyStateCard
NoticeCard
```

Recommended layouts:

## Transaction list card

```txt
היסטוריית עסקאות
4 עסקאות אחרונות

[נשלח]  Shai Gilgeous-Alexander
         sga@thunder.com
         ₪23,364.07
         07/06/2026

[התקבל] Klay Thompson
         ₪136.78
         06/06/2026
```

Mobile:

```txt
One transaction per row/card.
Amount prominent.
Counterparty below.
Date/status secondary.
```

Desktop:

```txt
Compact list.
Amount aligned to inline-end.
Metadata below.
```

## Account summary card

```txt
סיכום חשבון

יתרה זמינה       ₪23,232.00
חשבון            Main Checking
סוג חשבון        Personal
סטטוס            Active
```

## Pending transfer card

```txt
העברה ממתינה לאישור

נמען             Shai Gilgeous-Alexander
סכום             ₪23,364.07
סטטוס            ממתין לאישור
נוצר בתאריך      07/06/2026

[אישור העברה] [ביטול]
```

Only show action buttons if the existing backend flow already supports that state and confirmation semantics.

---

# Migration plan

## Phase 1: Immediate visual fix

Fix current rendering without changing backend behavior.

1. Add Markdown rendering for fallback text.
2. Sanitize Markdown.
3. Add RTL-aware message bubble styles.
4. Add `<bdi>` handling for emails, names, references, and money-like tokens where possible.
5. Add `dir="auto"` to assistant messages.

This fixes raw `**bold**` leakage quickly, but it is not the final architecture.

## Phase 2: Add versioned response blocks

Add `responseFormatVersion` and `responseBlocks` to the assistant API response.

Do not remove `responseMessage`.

```ts
{
  responseMessage: string;
  responseFormatVersion?: 1;
  responseBlocks?: AssistantResponseBlock[];
}
```

Frontend fallback behavior:

```txt
responseBlocks exists -> render structured UI
responseBlocks missing -> render responseMessage with sanitized Markdown
```

This keeps old messages and unsupported intents working.

## Phase 3: Build deterministic block builders

Implement block builders for the highest-value intents first:

```txt
1. balance_inquiry
2. account_summary
3. recent_transactions
4. transaction_search
5. transaction_detail
6. transaction_stats
7. pending_ai_transfers
8. pending_confirmation_status
9. transfer_quote
10. transfer_prepare / confirmation flow
```

Each builder maps trusted tool results to typed blocks.

## Phase 4: Update LLM response prompt

Change the response-generation prompt so the LLM does not duplicate structured data.

The LLM should produce:

```txt
- short intro
- clarification question
- empty-state explanation
- refusal text
- general help
```

The LLM should not produce:

```txt
- transaction lists
- account tables
- transfer confirmation layouts
- manual currency formatting
- Markdown tables
```

## Phase 5: Add frontend components

Build a reusable card renderer:

```tsx
export function AssistantBlocks({ blocks }: { blocks: AssistantResponseBlock[] }) {
  return (
    <div className="assistant-blocks">
      {blocks.map((block) => (
        <AssistantBlockRenderer key={block.id} block={block} />
      ))}
    </div>
  );
}
```

Then add per-block components.

## Phase 6: Tests

Add tests at three levels.

### Backend unit tests

```txt
- intent + tool result -> expected responseBlocks
- missing optional fields do not crash
- money values preserve numeric amount
- no business logic mutation occurs
- fallback works when blocks are empty
```

### Frontend unit/snapshot tests

```txt
- Hebrew transaction card renders correctly
- English name inside Hebrew text stays readable
- email address stays LTR
- amount stays LTR
- long counterparty name wraps correctly
- mobile layout does not overflow
```

### E2E tests

```txt
- Hebrew recent transactions query
- Hebrew account summary query
- mixed Hebrew/English counterparty query
- pending transfer confirmation flow still works
- no raw Markdown markers appear in rendered assistant messages
```

Useful assertion:

```txt
The visible assistant message must not contain raw "**", "__", malformed bullets, or unrendered Markdown tables for structured financial responses.
```

---

# Important implementation constraints

Do not change these:

```txt
- Existing authentication checks
- Existing authorization checks
- Existing transfer confirmation semantics
- Existing backend validation boundaries
- Existing transaction execution logic
- Existing source-of-truth hierarchy
- Existing audit behavior
- Existing conversation persistence behavior
```

The feature should be presentation-layer-first.

The backend may format already-authorized data into UI blocks, but it must not create new financial facts or bypass the current tool/business layer.

---

# What I would avoid

Avoid this:

```txt
LLM returns HTML
```

Reason:

```txt
Unsafe, hard to sanitize, bad separation of concerns.
```

Avoid this:

```txt
LLM returns Markdown tables
```

Reason:

```txt
Bad on mobile and bad with RTL.
```

Avoid this:

```txt
Frontend parses financial facts out of responseMessage
```

Reason:

```txt
Brittle and dangerous. The frontend should receive structured data directly.
```

Avoid this:

```txt
One generic card for every intent
```

Reason:

```txt
It will become unreadable and force awkward layouts.
```

Avoid this:

```txt
Changing tool behavior just to make UI easier
```

Reason:

```txt
Business logic should remain stable.
```

---
