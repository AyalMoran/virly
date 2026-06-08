# AI Assistant Tooling Implementation Plan

This plan assumes the existing architecture remains mostly intact: LangGraph controls the flow, the backend is authoritative, the LLM only classifies/parses/rewords, and tools are selected through deterministic routing rather than arbitrary LLM tool-calling. That matches the current documentation’s core constraints: fixed intent-to-tool routing, authenticated `userId` scoping, read-only tools under `server/src/ai/tools/`, and no LLM authority over transfers or tool choice. 

Where this plan steers away from the current documentation, it is marked explicitly.

---

# 1. Implementation Goals

Implement a stronger AI tool layer that supports:

```text
1. Better account and transaction questions.
2. Better counterparty history questions.
3. Better conversational follow-ups.
4. Better pending-transfer understanding.
5. Better transfer preflight checks.
6. Better memory updates from tool results.
```

The tool system must preserve these invariants:

```text
- Tools are backend-controlled.
- Tools always scope by authenticated userId.
- Tools are selected by deterministic intent routing.
- Tools are read-only unless they are dedicated confirmation endpoints.
- LLM output is never trusted as authorization.
- Tool outputs are sanitized before response composition.
- Tool results may update structured conversation memory.
```

---

# 2. Scope

## In Scope

Implement these tool groups:

```ts
const toolsToImplement = [
  // Counterparty tools
  "getRecentSentCounterparties",
  "getRecentReceivedCounterparties",
  "getCounterpartySummary",
  "getCounterpartyActivityTimeline",
  "resolveCounterpartyCandidates",

  // Transaction tools
  "searchTransactions",
  "getTransactionStats",
  "resolveTransactionReference",
  "getTransactionReceipt",

  // Transfer preflight and pending confirmation tools
  "getTransferEligibility",
  "getTransferQuote",
  "getDailyTransferUsage",
  "getPendingAiTransfers",
  "resolvePendingTransferReference",

  // Account/help tools
  "getCashflowSummary",
  "getMyProfile",
  "getAvailableActions"
] as const;
```

## Out of Scope For This Phase

Do not implement yet:

```ts
[
  "getAccountHealthSummary",
  "getRecurringTransactions",
  "getUnusualActivitySummary",
  "getBalanceHistory",
  "getLowBalanceWarnings",
  "getTransactionDisputeInfo"
]
```

Reason: these require additional product semantics, risk language, historical balance reconstruction, recurrence inference, or support workflows. They are useful later, but not needed for the core conversational continuity upgrade.

---

# 3. Required File/Module Changes

Expected files:

```text
server/src/ai/state.ts
server/src/ai/router.ts
server/src/ai/graph.ts
server/src/ai/tools/index.ts
server/src/ai/tools/types.ts
server/src/ai/tools/account.tools.ts
server/src/ai/tools/transaction.tools.ts
server/src/ai/tools/counterparty.tools.ts
server/src/ai/tools/transferPreflight.tools.ts
server/src/ai/tools/pendingTransfer.tools.ts
server/src/ai/tools/toolMemory.ts
server/src/ai/tools/toolSanitization.ts
server/src/ai/llm.ts
server/src/ai/messageNormalization.ts
server/src/ai/counterpartyMemory.ts
server/src/services/aiConversation.service.ts
server/src/services/aiPendingTransfer.service.ts
server/src/services/transfer.service.ts
openapi.yaml
```

Test files:

```text
server/src/ai/__tests__/tool-routing.test.ts
server/src/ai/__tests__/tools.counterparty.test.ts
server/src/ai/__tests__/tools.transactions.test.ts
server/src/ai/__tests__/tools.transfer-preflight.test.ts
server/src/ai/__tests__/tools.pending-transfer.test.ts
server/src/ai/__tests__/conversation-memory.test.ts
server/src/ai/__tests__/hebrew-mixed-language.test.ts
server/src/ai/__tests__/assistant-integration.test.ts
```

---

# 4. Shared Tool Contracts

Create or update:

```text
server/src/ai/tools/types.ts
```

## 4.1 Base Tool Context

```ts
export type AiToolContext = {
  authenticatedUserId: string;
  conversationId: string;
  requestId: string;
  now: Date;
  timezone: string;
};
```

Rules:

```text
- authenticatedUserId comes from auth middleware, never from chat text.
- conversationId may help memory lookup, but is not authorization.
- timezone should come from user profile, app config, or fallback.
- now must be passed explicitly for testability.
```

## 4.2 Base Tool Result

```ts
export type AiToolStatus = "ok" | "empty" | "error";

export type AiToolResult<TData> = {
  toolName: ReadOnlyToolName;
  status: AiToolStatus;
  data: TData | null;
  displayData?: unknown;
  memoryUpdates?: AiToolMemoryUpdate;
  error?: {
    code: string;
    message: string;
  };
};
```

## 4.3 Memory Update Contract

```ts
export type AiToolMemoryUpdate = {
  counterparties?: Array<{
    counterpartyId: string;
    emailFullForBackendOnly: string;
    emailMasked: string;
    displayName: string;
    firstName?: string | null;
    lastName?: string | null;
    relation: "sent_to" | "received_from" | "both";
    source: "transaction" | "verified_recipient" | "profile";
    lastInteractionAt?: string | null;
  }>;

  transactions?: Array<{
    transactionId: string;
    label: string;
    counterpartyId?: string | null;
    counterpartyLabel?: string | null;
    amount: number;
    currency: string;
    direction: "sent" | "received";
    occurredAt: string;
  }>;

  pendingTransfers?: Array<{
    pendingTransferId: string;
    label: string;
    recipientLabel: string;
    amount: number;
    currency: string;
    expiresAt: string;
  }>;

  dateRanges?: Array<{
    label: string;
    from: string;
    to: string;
  }>;
};
```

## 4.4 Tool Sanitization Rule

Every tool may return internal fields to the graph, but the LLM responder must receive only sanitized data.

Create:

```text
server/src/ai/tools/toolSanitization.ts
```

```ts
export function sanitizeToolResultForResponder(
  result: AiToolResult<unknown>
): AiToolResult<unknown> {
  return {
    ...result,
    memoryUpdates: undefined,
    data: result.displayData ?? result.data,
  };
}
```

Then strip backend-only fields before the response composer receives tool metadata.

---

# 5. Intent Updates

Update `AssistantIntent` in `server/src/ai/state.ts`.

Add:

```ts
export type AssistantIntent =
  | "balance_inquiry"
  | "account_summary"
  | "recent_transactions"
  | "transaction_search"
  | "transaction_summary"
  | "transaction_count"
  | "transaction_detail"
  | "transaction_stats"
  | "cashflow_summary"
  | "counterparty_lookup"
  | "recent_sent_counterparties"
  | "recent_received_counterparties"
  | "counterparty_summary"
  | "counterparty_activity_timeline"
  | "last_sent_counterparty"
  | "counterparty_transactions"
  | "counterparty_total_sent"
  | "verified_recipients"
  | "recipient_profile"
  | "transfer_prepare"
  | "transfer_modify_pending"
  | "transfer_cancel_pending"
  | "transfer_limits"
  | "transfer_eligibility"
  | "transfer_quote"
  | "daily_transfer_usage"
  | "transfer_status"
  | "pending_ai_transfers"
  | "pending_confirmation_status"
  | "general_help"
  | "unsafe_request"
  | "unsupported";
```

## Explicit deviation from the uploaded documentation

The uploaded documentation currently lists a smaller intent set, although it already includes several expanded intents such as `transaction_search`, `transaction_summary`, `transaction_count`, `transaction_detail`, `transfer_modify_pending`, and `pending_confirmation_status`. 

We should expand the intent list because the new tools answer materially different user requests. For example:

```text
"show transfers over 100"        -> transaction_search
"how many transfers this month"  -> transaction_stats
"who are the last 3 I paid"      -> recent_sent_counterparties
"can I send 500"                 -> transfer_eligibility
"what happens if I send 500"     -> transfer_quote
```

Keeping these collapsed into broad intents would make routing brittle.

---

# 6. Tool Name Updates

Update `ReadOnlyToolName` in `server/src/ai/state.ts`.

```ts
export type ReadOnlyToolName =
  | "getUserAccounts"
  | "getAccountBalance"
  | "getRecentTransactions"
  | "getLastSentCounterparty"
  | "getTransactionsWithCounterparty"
  | "getTotalSentToCounterparty"
  | "getVerifiedRecipients"
  | "getTransferLimits"

  // New counterparty tools
  | "getRecentSentCounterparties"
  | "getRecentReceivedCounterparties"
  | "getCounterpartySummary"
  | "getCounterpartyActivityTimeline"
  | "resolveCounterpartyCandidates"

  // New transaction tools
  | "searchTransactions"
  | "getTransactionStats"
  | "resolveTransactionReference"
  | "getTransactionReceipt"

  // New transfer preflight and pending tools
  | "getTransferEligibility"
  | "getTransferQuote"
  | "getDailyTransferUsage"
  | "getPendingAiTransfers"
  | "resolvePendingTransferReference"

  // New account/help tools
  | "getCashflowSummary"
  | "getMyProfile"
  | "getAvailableActions";
```

Update:

```ts
isReadOnlyToolName(name: unknown): name is ReadOnlyToolName
```

with all new values.

---

# 7. Deterministic Intent-to-Tool Routing

Update `server/src/ai/router.ts`.

```ts
export const intentToReadOnlyTools: Record<AssistantIntent, ReadOnlyToolName[]> = {
  balance_inquiry: [
    "getUserAccounts",
    "getAccountBalance",
  ],

  account_summary: [
    "getMyProfile",
    "getUserAccounts",
    "getAccountBalance",
  ],

  recent_transactions: [
    "getRecentTransactions",
  ],

  transaction_search: [
    "searchTransactions",
  ],

  transaction_summary: [
    "getTransactionStats",
  ],

  transaction_count: [
    "getTransactionStats",
  ],

  transaction_stats: [
    "getTransactionStats",
  ],

  transaction_detail: [
    "resolveTransactionReference",
    "getTransactionReceipt",
  ],

  cashflow_summary: [
    "getCashflowSummary",
  ],

  counterparty_lookup: [
    "resolveCounterpartyCandidates",
  ],

  recent_sent_counterparties: [
    "getRecentSentCounterparties",
  ],

  recent_received_counterparties: [
    "getRecentReceivedCounterparties",
  ],

  counterparty_summary: [
    "resolveCounterpartyCandidates",
    "getCounterpartySummary",
  ],

  counterparty_activity_timeline: [
    "resolveCounterpartyCandidates",
    "getCounterpartyActivityTimeline",
  ],

  last_sent_counterparty: [
    "getLastSentCounterparty",
  ],

  counterparty_transactions: [
    "resolveCounterpartyCandidates",
    "getTransactionsWithCounterparty",
  ],

  counterparty_total_sent: [
    "resolveCounterpartyCandidates",
    "getTotalSentToCounterparty",
  ],

  verified_recipients: [
    "getVerifiedRecipients",
  ],

  recipient_profile: [
    "resolveCounterpartyCandidates",
  ],

  transfer_limits: [
    "getTransferLimits",
  ],

  transfer_eligibility: [
    "getTransferEligibility",
  ],

  transfer_quote: [
    "resolveCounterpartyCandidates",
    "getTransferQuote",
  ],

  daily_transfer_usage: [
    "getDailyTransferUsage",
  ],

  transfer_status: [
    "searchTransactions",
    "getPendingAiTransfers",
  ],

  pending_ai_transfers: [
    "getPendingAiTransfers",
  ],

  pending_confirmation_status: [
    "resolvePendingTransferReference",
    "getPendingAiTransfers",
  ],

  general_help: [
    "getAvailableActions",
  ],

  transfer_prepare: [],
  transfer_modify_pending: [],
  transfer_cancel_pending: [],
  unsafe_request: [],
  unsupported: [],
};
```

## Important routing rule

Reference-resolution tools should run before factual tools when the factual tool needs a resolved entity.

Example:

```text
counterparty_summary:
  resolveCounterpartyCandidates -> getCounterpartySummary
```

If resolution is ambiguous, stop and return clarification. Do not run the summary tool.

---

# 8. Tool Implementation Details

## 8.1 `getRecentSentCounterparties`

### Purpose

Answer:

```text
"who are the last 3 people I sent money to?"
"למי שלחתי כסף לאחרונה?"
```

### Input

```ts
export type GetRecentSentCounterpartiesInput = {
  limit?: number;
  dateRange?: {
    from: string;
    to: string;
  };
};
```

### Output

```ts
export type RecentCounterparty = {
  counterpartyId: string;
  displayName: string;
  emailMasked: string;
  lastSentAt: string;
  lastAmount: number;
  currency: string;
  sentCountInRange?: number;
};

export type GetRecentSentCounterpartiesOutput = {
  counterparties: RecentCounterparty[];
};
```

### Query behavior

```text
- Filter transactions where authenticated user is sender.
- Sort by occurredAt descending.
- Deduplicate by counterparty.
- Return most recent unique counterparties.
- Default limit: 3.
- Max limit: 10.
```

### Memory updates

Add all returned counterparties to `memoryUpdates.counterparties`.

---

## 8.2 `getRecentReceivedCounterparties`

Same as `getRecentSentCounterparties`, but for credits.

### Input

```ts
export type GetRecentReceivedCounterpartiesInput = {
  limit?: number;
  dateRange?: {
    from: string;
    to: string;
  };
};
```

### Output

```ts
export type GetRecentReceivedCounterpartiesOutput = {
  counterparties: Array<{
    counterpartyId: string;
    displayName: string;
    emailMasked: string;
    lastReceivedAt: string;
    lastAmount: number;
    currency: string;
    receivedCountInRange?: number;
  }>;
};
```

---

## 8.3 `resolveCounterpartyCandidates`

### Purpose

Resolve ambiguous name/reference text into backend-known candidates.

### Input

```ts
export type ResolveCounterpartyCandidatesInput = {
  query: string;
  direction?: "sent" | "received" | "both";
  dateRange?: {
    from: string;
    to: string;
  };
  limit?: number;
};
```

### Output

```ts
export type ResolveCounterpartyCandidatesOutput = {
  status: "resolved" | "ambiguous" | "unresolved";
  resolvedCounterpartyId?: string;
  candidates: Array<{
    counterpartyId: string;
    displayName: string;
    emailMasked: string;
    emailFullForBackendOnly: string;
    firstName?: string | null;
    lastName?: string | null;
    lastInteractionAt?: string | null;
    lastDirection?: "sent" | "received";
    lastAmount?: number | null;
    confidence: "low" | "medium" | "high";
    matchReasons: string[];
  }>;
};
```

### Resolution rules

```text
- Use structured memory first.
- Then verified recipients.
- Then transaction counterparties scoped to user.
- Exact email match beats name match.
- Exact full-name match beats partial-name match.
- If exactly one high-confidence candidate exists, status = resolved.
- If multiple plausible candidates exist, status = ambiguous.
- If no candidates exist, status = unresolved.
```

### Important

Do not expose `emailFullForBackendOnly` to the LLM responder.

---

## 8.4 `getCounterpartySummary`

### Purpose

Answer:

```text
"what's my history with Daniel?"
"כמה שלחתי לדניאל וקיבלתי ממנו?"
```

### Input

```ts
export type GetCounterpartySummaryInput = {
  counterpartyId: string;
  dateRange?: {
    from: string;
    to: string;
  };
};
```

### Output

```ts
export type GetCounterpartySummaryOutput = {
  counterparty: {
    counterpartyId: string;
    displayName: string;
    emailMasked: string;
  };
  summary: {
    totalSent: number;
    totalReceived: number;
    net: number;
    sentCount: number;
    receivedCount: number;
    totalCount: number;
    lastTransactionAt?: string | null;
    lastDirection?: "sent" | "received" | null;
    lastAmount?: number | null;
    currency: string;
  };
};
```

---

## 8.5 `getCounterpartyActivityTimeline`

### Purpose

Return recent ordered transactions with one counterparty.

### Input

```ts
export type GetCounterpartyActivityTimelineInput = {
  counterpartyId: string;
  dateRange?: {
    from: string;
    to: string;
  };
  limit?: number;
};
```

### Output

```ts
export type GetCounterpartyActivityTimelineOutput = {
  counterparty: {
    counterpartyId: string;
    displayName: string;
    emailMasked: string;
  };
  transactions: Array<{
    transactionId: string;
    direction: "sent" | "received";
    amount: number;
    currency: string;
    reason?: string | null;
    occurredAt: string;
  }>;
};
```

---

## 8.6 `searchTransactions`

### Purpose

General filtered transaction search.

### Input

```ts
export type SearchTransactionsInput = {
  dateRange?: {
    from: string;
    to: string;
  };
  direction?: "sent" | "received" | "both";
  minAmount?: number;
  maxAmount?: number;
  reasonQuery?: string;
  counterpartyId?: string;
  limit?: number;
  sort?: "newest" | "oldest" | "amount_desc" | "amount_asc";
};
```

### Output

```ts
export type SearchTransactionsOutput = {
  transactions: Array<{
    transactionId: string;
    direction: "sent" | "received";
    amount: number;
    currency: string;
    counterparty: {
      counterpartyId: string;
      displayName: string;
      emailMasked: string;
    };
    reason?: string | null;
    occurredAt: string;
    status: "completed" | "failed" | "pending" | "reversed";
  }>;
  appliedFilters: SearchTransactionsInput;
};
```

### Constraints

```text
- Default limit: 10.
- Max limit: 50.
- Do not return full unbounded transaction history.
- Reason search should be backend-controlled and scoped.
```

---

## 8.7 `getTransactionStats`

### Purpose

Aggregate statistics over filtered transactions.

### Input

```ts
export type GetTransactionStatsInput = {
  dateRange?: {
    from: string;
    to: string;
  };
  direction?: "sent" | "received" | "both";
  counterpartyId?: string;
  minAmount?: number;
  maxAmount?: number;
  reasonQuery?: string;
};
```

### Output

```ts
export type GetTransactionStatsOutput = {
  count: number;
  totalSent: number;
  totalReceived: number;
  net: number;
  averageSent?: number | null;
  averageReceived?: number | null;
  largestDebit?: {
    transactionId: string;
    amount: number;
    currency: string;
    counterpartyLabel: string;
    occurredAt: string;
  } | null;
  largestCredit?: {
    transactionId: string;
    amount: number;
    currency: string;
    counterpartyLabel: string;
    occurredAt: string;
  } | null;
};
```

---

## 8.8 `resolveTransactionReference`

### Purpose

Resolve:

```text
"the second one"
"that 50 shekel transfer"
"ההעברה השנייה"
```

### Input

```ts
export type ResolveTransactionReferenceInput = {
  referenceText: string;
  candidateTransactionIds?: string[];
};
```

### Output

```ts
export type ResolveTransactionReferenceOutput = {
  status: "resolved" | "ambiguous" | "unresolved";
  transactionId?: string;
  candidates?: Array<{
    transactionId: string;
    label: string;
    amount: number;
    currency: string;
    counterpartyLabel: string;
    occurredAt: string;
  }>;
};
```

### Resolution source order

```text
1. Latest clarification options.
2. Structured memory transactions.
3. Latest answer frame transaction refs.
4. Search fallback only if reference includes enough concrete details.
```

---

## 8.9 `getTransactionReceipt`

### Purpose

Return display-safe transaction details.

### Input

```ts
export type GetTransactionReceiptInput = {
  transactionId: string;
};
```

### Output

```ts
export type GetTransactionReceiptOutput = {
  transactionId: string;
  occurredAt: string;
  direction: "sent" | "received";
  amount: number;
  currency: string;
  counterparty: {
    displayName: string;
    emailMasked: string;
  };
  reason?: string | null;
  status: "completed" | "failed" | "pending" | "reversed";
};
```

---

## 8.10 `getTransferEligibility`

### Purpose

Answer:

```text
"can I send 500?"
"how much can I send right now?"
```

### Input

```ts
export type GetTransferEligibilityInput = {
  amount?: number;
  currency?: string;
  recipientId?: string;
};
```

### Output

```ts
export type GetTransferEligibilityOutput = {
  eligible: boolean;
  maxSendableNow: number;
  currency: string;
  checks: {
    hasPositiveBalance: boolean;
    hasSufficientBalance?: boolean;
    withinPerTransferLimit?: boolean;
    withinDailyLimit?: boolean;
    recipientAllowed?: boolean;
  };
  reasons: Array<{
    code:
      | "INSUFFICIENT_BALANCE"
      | "EXCEEDS_PER_TRANSFER_LIMIT"
      | "EXCEEDS_DAILY_LIMIT"
      | "INVALID_RECIPIENT"
      | "UNSUPPORTED_CURRENCY";
    message: string;
  }>;
};
```

---

## 8.11 `getTransferQuote`

### Purpose

Preview transfer outcome without creating a pending transfer.

### Input

```ts
export type GetTransferQuoteInput = {
  recipientId?: string;
  recipientEmail?: string;
  amount: number;
  currency: string;
};
```

### Output

```ts
export type GetTransferQuoteOutput = {
  eligible: boolean;
  currentBalance: number;
  amount: number;
  currency: string;
  remainingBalanceAfterTransfer: number;
  limitCheck: {
    perTransferLimit: number;
    dailyLimit: number;
    dailyUsed: number;
    dailyRemaining: number;
    wouldExceedPerTransferLimit: boolean;
    wouldExceedDailyLimit: boolean;
  };
  warnings: Array<{
    code:
      | "INSUFFICIENT_BALANCE"
      | "EXCEEDS_PER_TRANSFER_LIMIT"
      | "EXCEEDS_DAILY_LIMIT"
      | "LOW_REMAINING_BALANCE"
      | "NEW_RECIPIENT";
    message: string;
  }>;
};
```

### Important

This tool is read-only. It must not create `AiPendingTransfer`.

---

## 8.12 `getDailyTransferUsage`

### Purpose

Answer:

```text
"how much of my daily limit have I used?"
"כמה נשאר לי לשלוח היום?"
```

### Output

```ts
export type GetDailyTransferUsageOutput = {
  currency: string;
  dailyLimit: number;
  usedToday: number;
  remainingToday: number;
  transferCountToday: number;
  resetAt: string;
};
```

---

## 8.13 `getPendingAiTransfers`

### Purpose

Answer:

```text
"do I have pending confirmations?"
"what transfers are waiting for confirmation?"
```

### Input

```ts
export type GetPendingAiTransfersInput = {
  scope?: "current_conversation" | "all_user";
};
```

### Output

```ts
export type GetPendingAiTransfersOutput = {
  pendingTransfers: Array<{
    pendingTransferId: string;
    conversationId: string;
    recipientLabel: string;
    recipientEmailMasked: string;
    amount: number;
    currency: string;
    reason?: string | null;
    status: "pending";
    expiresAt: string;
  }>;
};
```

### Product decision

Default scope should be:

```ts
"current_conversation"
```

Reason: it avoids surprising users with unrelated pending cards from other chats. Add `all_user` only when the user explicitly asks broadly:

```text
"show all my pending confirmations"
```

---

## 8.14 `resolvePendingTransferReference`

### Purpose

Resolve:

```text
"change it to 70"
"cancel that"
"what is this pending transfer?"
```

### Input

```ts
export type ResolvePendingTransferReferenceInput = {
  referenceText: string;
};
```

### Output

```ts
export type ResolvePendingTransferReferenceOutput = {
  status: "resolved" | "ambiguous" | "unresolved";
  pendingTransferId?: string;
  candidates?: Array<{
    pendingTransferId: string;
    label: string;
    recipientLabel: string;
    amount: number;
    currency: string;
    expiresAt: string;
  }>;
};
```

### Resolution source order

```text
1. memory.pendingConfirmation
2. pending confirmations in current conversation
3. all user pending confirmations only if user asked broadly
```

---

## 8.15 `getCashflowSummary`

### Purpose

Answer:

```text
"how much came in and went out this month?"
"what is my net cashflow?"
```

### Input

```ts
export type GetCashflowSummaryInput = {
  dateRange: {
    from: string;
    to: string;
  };
};
```

### Output

```ts
export type GetCashflowSummaryOutput = {
  dateRange: {
    from: string;
    to: string;
    label?: string;
  };
  totalCredits: number;
  totalDebits: number;
  netChange: number;
  creditCount: number;
  debitCount: number;
  currency: string;
};
```

---

## 8.16 `getMyProfile`

### Purpose

Answer:

```text
"who am I logged in as?"
"what email is this account?"
```

### Output

```ts
export type GetMyProfileOutput = {
  userId: string;
  emailMasked: string;
  firstName?: string | null;
  lastName?: string | null;
  verified: boolean;
};
```

Do not expose sensitive profile fields.

---

## 8.17 `getAvailableActions`

### Purpose

Answer:

```text
"what can you help me with?"
"איך אתה יכול לעזור לי?"
```

### Output

```ts
export type GetAvailableActionsOutput = {
  actions: Array<{
    id:
      | "view_balance"
      | "view_transactions"
      | "search_transactions"
      | "view_counterparty_history"
      | "prepare_transfer"
      | "view_pending_confirmations"
      | "view_transfer_limits";
    label: string;
    available: boolean;
    unavailableReason?: string;
  }>;
};
```

---

# 9. Graph Changes

The uploaded documentation already includes a graph with `normalizeUserMessage`, `extractRequestSlots`, transfer modification handling, and read-only tool routing. 

Keep that general structure.

## Update `routeReadOnlyTools`

Current behavior should be extended to support chained tools.

Required behavior:

```text
1. Get tools for intent from deterministic router.
2. For each tool:
   - Build input from graph state.
   - Execute tool.
   - Store raw result in graph state.
   - Apply memory updates.
   - If resolver tool returns ambiguous/unresolved, stop routing and create clarification.
3. Sanitize results before composeResponse.
```

Pseudo-code:

```ts
async function routeReadOnlyTools(state: AssistantGraphState) {
  const toolNames = getReadOnlyToolsForIntent(state.intent);

  for (const toolName of toolNames) {
    if (!isReadOnlyToolName(toolName)) {
      throw new Error(`Invalid read-only tool: ${toolName}`);
    }

    const input = buildToolInput(toolName, state);

    const result = await executeReadOnlyTool({
      toolName,
      input,
      context: state.toolContext,
    });

    state.toolResults.push(result);
    applyToolMemoryUpdates(state, result.memoryUpdates);

    if (isBlockingResolutionResult(toolName, result)) {
      state.clarification = buildClarificationFromResolution(result);
      break;
    }

    mergeToolOutputIntoState(state, toolName, result);
  }

  return state;
}
```

---

# 10. Tool Input Builders

Create:

```text
server/src/ai/tools/toolInputBuilders.ts
```

Each tool gets an explicit builder.

```ts
export function buildToolInput(
  toolName: ReadOnlyToolName,
  state: AssistantGraphState
): unknown {
  switch (toolName) {
    case "searchTransactions":
      return buildSearchTransactionsInput(state);

    case "resolveCounterpartyCandidates":
      return buildResolveCounterpartyCandidatesInput(state);

    case "getCounterpartySummary":
      return buildGetCounterpartySummaryInput(state);

    case "getTransferQuote":
      return buildGetTransferQuoteInput(state);

    default:
      return {};
  }
}
```

Rules:

```text
- Tool input builders may use normalized slots.
- Tool input builders may use resolved entities.
- Tool input builders may use conversation memory.
- Tool input builders must not use raw LLM output without backend validation when identity or money movement is involved.
```

---

# 11. Conversation Memory Updates

The current documentation already includes structured `entities`, `answerFrames`, `mode`, `pendingConfirmation`, and `clarification` in `AiConversation.memory`. 

Use the new tools to populate those fields consistently.

## 11.1 Entity Types

```ts
export type ConversationEntity =
  | {
      id: string;
      type: "counterparty";
      counterpartyId: string;
      displayName: string;
      emailMasked: string;
      emailFullForBackendOnly: string;
      turnIntroduced: number;
      turnLastReferenced: number;
      source: "tool_result" | "verified_recipient" | "pending_transfer";
      confidence: "low" | "medium" | "high";
      aliases: string[];
    }
  | {
      id: string;
      type: "transaction";
      transactionId: string;
      label: string;
      amount: number;
      currency: string;
      direction: "sent" | "received";
      occurredAt: string;
      turnIntroduced: number;
      turnLastReferenced: number;
      source: "tool_result";
      confidence: "high";
      aliases: string[];
    }
  | {
      id: string;
      type: "pending_transfer";
      pendingTransferId: string;
      label: string;
      recipientLabel: string;
      amount: number;
      currency: string;
      expiresAt: string;
      turnIntroduced: number;
      turnLastReferenced: number;
      source: "pending_transfer";
      confidence: "high";
      aliases: string[];
    };
```

## 11.2 Apply Memory Updates

Create:

```text
server/src/ai/tools/toolMemory.ts
```

```ts
export function applyToolMemoryUpdates(
  state: AssistantGraphState,
  updates?: AiToolMemoryUpdate
): AssistantGraphState {
  if (!updates) {
    return state;
  }

  for (const counterparty of updates.counterparties ?? []) {
    rememberConversationCounterparty(state, counterparty);
  }

  for (const transaction of updates.transactions ?? []) {
    rememberConversationTransaction(state, transaction);
  }

  for (const pendingTransfer of updates.pendingTransfers ?? []) {
    rememberConversationPendingTransfer(state, pendingTransfer);
  }

  for (const dateRange of updates.dateRanges ?? []) {
    rememberConversationDateRange(state, dateRange);
  }

  return trimConversationMemory(state);
}
```

Memory limits:

```text
counterparties: 8
transactions: 12
pending transfers: 5
answerFrames: 8
entities total: 20
messages: 20
```

## Explicit deviation from uploaded documentation

The uploaded documentation says `mentionedCounterparties` max 5 and `entities` max 12. 

For the new tool layer, increase structured entity capacity to 20.

Reason: new tools return lists, transaction references, pending confirmations, and counterparties. A max of 12 is likely too small for flows like:

```text
"show my 10 recent transactions"
"tell me more about the second one"
"send the third person 50"
```

Keep the memory bounded, but use a slightly larger cap.

---

# 12. Clarification Handling

Add or update:

```ts
export type ClarificationRequest = {
  reason:
    | "missing_recipient"
    | "ambiguous_recipient"
    | "missing_amount"
    | "ambiguous_amount"
    | "unsupported_currency"
    | "missing_date_range"
    | "ambiguous_transaction"
    | "ambiguous_pending_transfer"
    | "unresolved_reference";

  message: string;

  options?: Array<{
    id: string;
    label: string;
    value: string;
  }>;

  expectedReplyType:
    | "recipient"
    | "amount"
    | "currency"
    | "date_range"
    | "transaction"
    | "pending_transfer"
    | "option_selection"
    | "free_text";
};
```

Resolution tools must produce clarification when ambiguous.

Example:

```text
User: What’s my history with Daniel?
Tool: resolveCounterpartyCandidates
Result: ambiguous, 2 candidates
Assistant: I found two Daniels. Which one do you mean?
```

The next user message:

```text
the second one
```

must resolve against the clarification options before general memory.

---

# 13. Date Resolution

Add backend date resolution if not already implemented.

Create:

```text
server/src/ai/dateResolution.ts
```

```ts
export type DateExpressionResolution = {
  originalText: string;
  timezone: string;
  resolvedFrom: string;
  resolvedTo: string;
  granularity: "day" | "week" | "month" | "year" | "range";
  confidence: "low" | "medium" | "high";
};
```

Use it in tool input builders for:

```text
searchTransactions
getTransactionStats
getCashflowSummary
getRecentSentCounterparties
getRecentReceivedCounterparties
getCounterpartySummary
getCounterpartyActivityTimeline
```

Rules:

```text
- Tools receive resolved ISO date ranges.
- Tools do not receive "last Friday" as free text.
- Relative dates use AiToolContext.now and AiToolContext.timezone.
```

---

# 14. LLM Schema Changes

The uploaded documentation says LLM schemas should stay narrow and fields should not be added unless the graph consumes them. Keep this rule. 

## Classification Schema

No change.

```ts
{
  intent: AssistantIntent;
  refusalReason?: string | null;
}
```

## Transfer Draft Schema

No required change for the tools phase.

## Reference Resolution Schema

The current schema is counterparty-specific. For the new tool plan, add separate deterministic/backend resolvers instead of expanding this LLM schema too much.

## Explicit deviation from possible approach

Do not create one giant LLM schema that extracts all tool arguments.

Reason: that would make the model too influential over backend querying. The safer design is:

```text
LLM/fallback classification
+ deterministic slot extraction
+ backend tool input builders
+ backend resolver tools
```

---

# 15. Response Composition

Keep existing rule: deterministic fallback first, LLM may only reword sanitized facts. The uploaded documentation already states that the responder receives sanitized tool metadata and must not invent account facts. 

Add stronger formatting rules:

```text
- For balances and amounts, use backend-formatted values when available.
- For lists, preserve backend order.
- For ambiguous results, ask a clarification question instead of guessing.
- For empty results, state the exact filter/date range.
- For pending transfers, direct the user to the card/buttons.
- Never say a transfer was sent unless the confirmation endpoint returned confirmed.
```

---

# 16. OpenAPI Updates

Update `openapi.yaml`.

Add schemas for:

```text
AiToolName
AssistantIntent
SearchTransactionsResult
CounterpartySummaryResult
CounterpartyCandidateResult
TransactionReceiptResult
TransferQuoteResult
TransferEligibilityResult
PendingAiTransfersResult
ClarificationRequest
ToolCallResult
```

Update `/api/ai/chat` response to allow:

```ts
{
  clarification?: ClarificationRequest;
  toolResults?: Array<{
    toolName: string;
    status: "ok" | "empty" | "error";
  }>;
}
```

Do not expose raw internal tool data unless needed by the client UI.

---

# 17. Testing Plan

## 17.1 Tool Unit Tests

Each tool requires tests for:

```text
- authenticated user scoping
- empty result
- normal result
- max limit enforcement
- date range filtering
- masked display output
- memoryUpdates output
- no cross-user leakage
```

## 17.2 Routing Tests

Test every new intent:

```ts
expect(getReadOnlyToolsForIntent("recent_sent_counterparties"))
  .toEqual(["getRecentSentCounterparties"]);

expect(getReadOnlyToolsForIntent("counterparty_summary"))
  .toEqual(["resolveCounterpartyCandidates", "getCounterpartySummary"]);

expect(getReadOnlyToolsForIntent("transfer_prepare"))
  .toEqual([]);

expect(getReadOnlyToolsForIntent("unsafe_request"))
  .toEqual([]);
```

## 17.3 Integration Tests

Required scenarios:

```text
1. "Who are the last 3 people I sent money to?"
   -> recent_sent_counterparties
   -> getRecentSentCounterparties

2. "How much did I send the second one?"
   -> resolve from memory
   -> getTotalSentToCounterparty

3. "Show transfers over 100 from last week"
   -> transaction_search
   -> searchTransactions with minAmount + dateRange

4. "Tell me more about the second one"
   -> transaction_detail
   -> resolveTransactionReference
   -> getTransactionReceipt

5. "Can I send 500?"
   -> transfer_eligibility
   -> getTransferEligibility

6. "What happens if I send Daniel 500?"
   -> transfer_quote
   -> resolveCounterpartyCandidates
   -> getTransferQuote

7. "Do I have pending confirmations?"
   -> pending_ai_transfers
   -> getPendingAiTransfers

8. "Cancel that"
   -> transfer_cancel_pending
   -> no read-only tools
   -> dedicated pending-transfer cancellation flow

9. "Actually make it 70"
   -> transfer_modify_pending
   -> no read-only tools
   -> dedicated modification flow

10. "תראה לי העברות מעל 100 משבוע שעבר"
    -> transaction_search
    -> searchTransactions with dateRange + minAmount
```

## 17.4 Hebrew/Mixed-Language Tests

Add examples:

```text
"למי שלחתי כסף לאחרונה?"
"מי שלח לי כסף השבוע?"
"תראה לי העברות מעל 100"
"כמה שלחתי לדניאל החודש?"
"תראה לי את השנייה"
"מה עם ההעברה של 50 שקל?"
"can I send לדניאל 100?"
"send him 50 שקל"
```

---

# 18. Implementation Order

## Phase 1: Types and Router

Implement:

```text
1. Add new AssistantIntent values.
2. Add new ReadOnlyToolName values.
3. Add shared AiToolContext.
4. Add AiToolResult<T>.
5. Add AiToolMemoryUpdate.
6. Add intent-to-tool routing.
7. Add isReadOnlyToolName coverage.
8. Add routing tests.
```

Exit criteria:

```text
- TypeScript compiles.
- Existing tests pass.
- New route map tests pass.
- transfer_prepare, transfer_modify_pending, unsafe_request still map to [].
```

---

## Phase 2: Counterparty Tools

Implement:

```text
1. getRecentSentCounterparties
2. getRecentReceivedCounterparties
3. resolveCounterpartyCandidates
4. getCounterpartySummary
5. getCounterpartyActivityTimeline
```

Exit criteria:

```text
- All tools scope by authenticated user.
- No cross-user candidate appears.
- Memory updates are emitted.
- Ambiguous Daniel returns clarification-ready candidates.
```

---

## Phase 3: Transaction Tools

Implement:

```text
1. searchTransactions
2. getTransactionStats
3. resolveTransactionReference
4. getTransactionReceipt
```

Exit criteria:

```text
- Filtered transaction search works.
- Aggregates match database facts.
- "second one" resolves from answer frame/memory.
- Receipt output is display-safe.
```

---

## Phase 4: Transfer Preflight and Pending Tools

Implement:

```text
1. getTransferEligibility
2. getTransferQuote
3. getDailyTransferUsage
4. getPendingAiTransfers
5. resolvePendingTransferReference
```

Exit criteria:

```text
- Preflight tools create no pending transfer.
- Pending tools show only user-scoped confirmations.
- Current-conversation scope is default.
- Superseded/expired/confirmed cards are not returned as pending.
```

---

## Phase 5: Graph Integration

Implement:

```text
1. Tool input builders.
2. Sequential tool execution.
3. Resolution result short-circuiting.
4. Clarification creation from ambiguous results.
5. Memory update application after each tool.
6. Sanitization before response composition.
```

Exit criteria:

```text
- Chained tools work.
- Ambiguous reference stops downstream tool execution.
- Tool memory updates are persisted.
- LLM responder never receives backend-only emails.
```

---

## Phase 6: OpenAPI and Client Contracts

Implement:

```text
1. OpenAPI schema updates.
2. Chat response updates.
3. Optional clarification payload handling.
4. Optional client rendering for transaction lists/receipts.
5. Pending confirmation list rendering if needed.
```

Exit criteria:

```text
- OpenAPI YAML validates.
- Client builds.
- Existing chat UI still works.
- New payloads are backward-compatible.
```

---

## Phase 7: End-to-End Test Matrix

Implement full assistant tests for:

```text
- English
- Hebrew
- mixed Hebrew/English
- ambiguous references
- list follow-ups
- pending confirmation references
- transfer preflight
- no cross-user data leakage
- unsafe requests
```

Exit criteria:

```text
- npm run test --workspace server passes.
- npm run build --workspace server passes.
- npm run build --workspace client passes.
- OpenAPI validation passes.
```

---

# 19. Agent Implementation Rules

Give these rules to AI coding agents:

```text
1. Do not let the LLM select tools.
2. Do not add arbitrary tool-calling.
3. Do not make tools accept userId from the request body.
4. Do not expose raw full emails to the LLM responder unless explicitly approved for confirmation-card display.
5. Do not implement transfer execution as a tool.
6. Do not make getTransferQuote or getTransferEligibility create pending transfers.
7. Do not run downstream factual tools after ambiguous resolution.
8. Do not return unbounded transaction lists.
9. Do not log raw prompts or full account records.
10. Do not add a new intent without router, fallback, OpenAPI, and tests.
11. Do not add a new tool without input types, output types, router integration, memory update behavior, and tests.
12. Do not silently treat USD/EUR as ILS.
13. Do not infer a recipient from a name unless backend resolution validates exactly one candidate.
14. Do not let chat text confirm, execute, or mutate a completed transfer.
```

---

# 20. Final Deliverable Checklist

A developer or AI agent is done only when all of these are complete:

```text
[ ] New intent values added.
[ ] New tool names added.
[ ] isReadOnlyToolName updated.
[ ] intentToReadOnlyTools updated.
[ ] Tool input/output types implemented.
[ ] Tool implementations added.
[ ] Tool input builders added.
[ ] Tool memory update logic added.
[ ] Tool result sanitization added.
[ ] Graph sequential routing updated.
[ ] Clarification handling added for ambiguous resolver output.
[ ] OpenAPI updated.
[ ] Tests added for every new tool.
[ ] Tests added for every new intent route.
[ ] Hebrew/mixed-language tests added.
[ ] Cross-user leakage tests added.
[ ] Server build passes.
[ ] Client build passes.
[ ] Test suite passes.
[ ] Documentation updated.
```

---

# Bottom Line

Implement the new tools in this order:

```text
1. Tool contracts and router.
2. Counterparty tools.
3. Transaction tools.
4. Transfer preflight and pending tools.
5. Graph integration.
6. Memory updates.
7. OpenAPI/client contracts.
8. Full behavior tests.
```

The most important architectural decision is to treat these tools as **backend-controlled read-only capabilities**, not as free-form LLM function calls.

The main improvement over the current documentation is a larger, more explicit tool layer for resolving references and answering filtered account questions. The core documented boundary remains correct: the LLM interprets language, but the backend owns facts, routing, validation, and money movement. 
