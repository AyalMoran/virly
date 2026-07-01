# Counterparty "All Transactions" Cap Fix Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task.
> Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Make "show me all transactions with <person>" return every transaction with that counterparty (up to the app-wide cap of 50) and render them as a proper transaction-list card, instead of the current hardcoded ceiling of 5.

**Architecture:**
The v2 assistant tool `getCounterpartyTransactions` and the counterparty branch of `searchTransactions` both funnel into one v1 executor, `getTransactionsWithCounterparty`, which hardcodes `limit: 5` and never populates `metadata.transactions`.
This plan resolves the limit from the user's own words (an explicit number, or the word "all"), consistent with the sibling `searchTransactions` executor, and populates `metadata.transactions` so the existing v2 block builder renders a `transaction_list` card.
Both fixes live inside the single executor plus one shared helper, so every caller (v1 tool, v2 `getCounterpartyTransactions`, v2 `searchTransactions` with a counterparty) is fixed at once.

**Tech Stack:** TypeScript (ESM, `.js` import specifiers), Jest with `@swc/jest`, LangGraph/LangChain v2 tool wrappers, Mongoose repositories behind a repository seam.

## Global Constraints

- Never use the em dash character; use a plain hyphen `-` instead (repo-wide authoring rule).
- The app-wide maximum transaction-list size is `50`; the default when the user names no count is `10` (copied from `searchTransactions`, which calls `getTransactionLimit(context, 10)` -> `getLimitFromMessage(message, 10, 50)`).
- Counterparty PII stays masked in model-facing and card-facing fields: the LLM-facing `summary` and every card row use the masked label, never the raw email (existing invariant in `getTransactionsWithCounterparty` and `metadataFromTransactionRows`).
- Server unit tests run with `npm test --workspace server` (Jest). Run a single file with `npm test --workspace server -- <path>`.
- TDD: write the failing test first, watch it fail, implement the minimal change, watch it pass, then commit. There is no lint script in this repo; `npm run build --workspace server` (tsc) is the type-check gate.

---

## Reproduction (do this first)

The task is Todoist `6h249JvMvfXqrqvM` ("Asking to return all transactions from a counterparty returns only 3 transactions and not all"), section `ai` of project Virly (`6h24mGHhRhH7FQ4c`).
The reporter notes: "asking for a summary works and shows correct information but asking for all transactions does not work."

Root cause, confirmed in code:

- `server/src/ai/tools/getTransactionsWithCounterparty.ts:23-27` calls `recentWithCounterparty({ ..., limit: 5 })`.
  The repo honors the limit exactly (`server/src/repositories/mongo/transaction.repository.ts:95-101` does `.limit(limit)`), so the tool can never return more than 5 rows regardless of how many exist.
- The summary path (`getCounterpartySummary`) works because it reads true aggregate counts via `getDirectionalTotals`, so the user sees "12 transfers" in the summary but at most 5 in the list, which is the reported mismatch.
- Secondary defect: `buildBlocksFromResult` renders a `transaction_list` card for `getTransactionsWithCounterparty` from `meta.transactions` (`server/src/ai/v2/blocks.ts:100-111`), but this executor never populates `metadata.transactions`, so in v2 no card renders and the answer is prose-only.

Manual end-to-end reproduction (optional, requires the Docker stack and an account with more than 5 transactions to one counterparty):

1. `docker compose up` from the repo root.
2. In the chat, send "what is my history with <a frequent counterparty>" and note the transfer count in the summary.
3. Send "show me all my transactions with <that same counterparty>" and observe that at most 5 rows come back.

The deterministic backbone of this reproduction is the failing unit test in Task 1, Step 1.

## File Structure

- `server/src/ai/tools/transactionHelpers.ts` (modify): add the `MAX_TRANSACTION_LIST_LIMIT` constant, a `messageRequestsAllTransactions` predicate, and a `getTransactionLimitAllowingAll` resolver next to the existing `getTransactionLimit`.
  Responsibility: turn the user's words into a concrete, capped row limit.
- `server/src/ai/tools/getTransactionsWithCounterparty.ts` (modify): consume the resolver instead of hardcoding `5`, and populate `metadata.transactions` from the rows it already builds.
  Responsibility: the counterparty-transactions executor.
- `server/src/ai/tools/__tests__/transactionHelpers.test.ts` (modify): tests for the new resolver.
- `server/src/ai/tools/__tests__/getTransactionsWithCounterparty.test.ts` (modify): tests for the limit passed to the repo and for the rendered card.

## Out of scope (recorded decisions, do not implement here)

- The v2 wrappers `getCounterpartyTransactionsTool` and `searchTransactionsTool` declare a `limit` (and `direction`) arg in their Zod schema but do not forward it to the executor (`server/src/ai/v2/tools/readOnly.ts:154-180` and `:89-124`).
  This plan makes the executor read the count from `context.message` (the user's raw words, which `baseToolContext` passes through verbatim), so the user-observable bug is fixed for both v1 and v2 without touching `ToolContext` typing.
  If a future change wants the model's `args.limit` to win over message parsing, the follow-up is: add an optional `limit?: number` to `ToolContext` in `server/src/ai/state.ts`, pass it from the two wrappers, and prefer it inside `getTransactionLimitAllowingAll`.
- `getTransactionsWithCounterparty` returns both directions; honoring the v2 `direction` arg is a separate task and is not part of this count bug.

---

### Task 1: Resolve the row limit from the user's request

**Files:**
- Modify: `server/src/ai/tools/transactionHelpers.ts` (add helpers near `getTransactionLimit`, currently at line 206)
- Modify: `server/src/ai/tools/getTransactionsWithCounterparty.ts:1-5` (imports) and `:23-27` (the repo call)
- Test: `server/src/ai/tools/__tests__/transactionHelpers.test.ts` (extend)
- Test: `server/src/ai/tools/__tests__/getTransactionsWithCounterparty.test.ts` (extend)

**Interfaces:**
- Produces: `MAX_TRANSACTION_LIST_LIMIT: number` (value `50`); `messageRequestsAllTransactions(message: string): boolean`; `getTransactionLimitAllowingAll(context: ToolContext, defaultLimit?: number): number`.
- Consumes: the existing `getTransactionLimit(context, defaultLimit)` and `getLimitFromMessage(message, defaultLimit, maxLimit)`.

- [ ] **Step 1: Write the failing helper tests**

In `server/src/ai/tools/__tests__/transactionHelpers.test.ts`, add `getTransactionLimitAllowingAll` to the existing import from `../transactionHelpers.js` (the file already imports `getTransactionLimit` on line 13), then append this block after the existing `describe("getTransactionLimit", ...)` block (ends near line 256). The `makeContext(message: string)` helper already exists in this file.

```ts
// ---------------------------------------------------------------------------
// getTransactionLimitAllowingAll
// ---------------------------------------------------------------------------

describe("getTransactionLimitAllowingAll", () => {
  it("returns the max when the user asks for 'all'", () => {
    const ctx = makeContext("show me all transactions with alice");
    expect(getTransactionLimitAllowingAll(ctx, 10)).toBe(50);
  });

  it("returns the max for Hebrew 'הכל'", () => {
    const ctx = makeContext("תראה לי את כל העסקאות עם אליס");
    expect(getTransactionLimitAllowingAll(ctx, 10)).toBe(50);
  });

  it("still honors an explicit number", () => {
    const ctx = makeContext("show me the last 20 transactions with alice");
    expect(getTransactionLimitAllowingAll(ctx, 10)).toBe(20);
  });

  it("falls back to the default when no count and no 'all' are present", () => {
    const ctx = makeContext("transactions with alice");
    expect(getTransactionLimitAllowingAll(ctx, 10)).toBe(10);
  });

  it("does not treat the word 'completed' as an 'all' request", () => {
    const ctx = makeContext("show completed transactions with alice");
    expect(getTransactionLimitAllowingAll(ctx, 10)).toBe(10);
  });
});
```

- [ ] **Step 2: Run the helper tests to verify they fail**

Run: `npm test --workspace server -- src/ai/tools/__tests__/transactionHelpers.test.ts`
Expected: FAIL with `getTransactionLimitAllowingAll is not a function` (or a TypeScript "no exported member" compile error).

- [ ] **Step 3: Implement the resolver**

In `server/src/ai/tools/transactionHelpers.ts`, replace the existing `getTransactionLimit` function (lines 206-208):

```ts
export function getTransactionLimit(context: ToolContext, defaultLimit = 10) {
  return getLimitFromMessage(context.message, defaultLimit, 50);
}
```

with this constant plus three functions:

```ts
/** App-wide ceiling on how many transaction rows any list tool returns. */
export const MAX_TRANSACTION_LIST_LIMIT = 50;

// "all / everything / entire / full" (EN) and "הכל / כל ה..." (HE) mean
// "as many as we allow". "completed" is deliberately excluded so a request
// for "completed transactions" is not read as "all".
const ALL_TRANSACTIONS_PATTERN_EN = /\b(all|every|everything|entire|full)\b/i;
const ALL_TRANSACTIONS_PATTERN_HE = /(הכל|כל ה)/;

export function messageRequestsAllTransactions(message: string): boolean {
  return (
    ALL_TRANSACTIONS_PATTERN_EN.test(message) ||
    ALL_TRANSACTIONS_PATTERN_HE.test(message)
  );
}

export function getTransactionLimit(context: ToolContext, defaultLimit = 10) {
  return getLimitFromMessage(context.message, defaultLimit, MAX_TRANSACTION_LIST_LIMIT);
}

/**
 * Like getTransactionLimit, but maps an explicit "all" request to the app-wide
 * maximum. Used by counterparty-transactions listing where "show me all with X"
 * must return everything (capped), not the small default.
 */
export function getTransactionLimitAllowingAll(
  context: ToolContext,
  defaultLimit = 10
): number {
  if (messageRequestsAllTransactions(context.message)) {
    return MAX_TRANSACTION_LIST_LIMIT;
  }
  return getTransactionLimit(context, defaultLimit);
}
```

- [ ] **Step 4: Run the helper tests to verify they pass**

Run: `npm test --workspace server -- src/ai/tools/__tests__/transactionHelpers.test.ts`
Expected: PASS, including the pre-existing `getTransactionLimit` cases (default 10, explicit 5, cap 50).

- [ ] **Step 5: Write the failing executor limit tests**

In `server/src/ai/tools/__tests__/getTransactionsWithCounterparty.test.ts`, replace the existing `makeRepos` helper (lines 35-52) so it captures the limit and slices by it, and add a `beforeEach` reset. Keep the return cast identical so the existing call sites (`setRepositories(makeRepos(...) as ReturnType<typeof createMongoRepositories>)`) are untouched.

```ts
let lastCounterpartyLimit: number | undefined;

beforeEach(() => {
  lastCounterpartyLimit = undefined;
});

function makeRepos(all: TransactionRecord[]) {
  const base = createMongoRepositories();
  return {
    ...base,
    users: {
      ...base.users,
      findByEmails: async () => []
    },
    personalDetails: {
      ...base.personalDetails,
      findProvidedByUserIds: async () => []
    },
    transactions: {
      ...base.transactions,
      recentWithCounterparty: async (input: { limit: number }) => {
        lastCounterpartyLimit = input.limit;
        return all.slice(0, input.limit);
      }
    }
  };
}
```

Then append this block after the existing `describe("getTransactionsWithCounterparty - transactions found", ...)` block (ends near line 188):

```ts
describe("getTransactionsWithCounterparty - honors the requested count", () => {
  const alice = {
    email: "alice@example.com",
    maskedLabel: "a***@example.com",
    userLabel: "Alice",
    firstMentionedAtTurn: 1,
    lastReferencedAtTurn: 1
  };

  it("requests up to the max and returns all when the user asks for 'all'", async () => {
    const ctx = makeContext({
      message: "show me all transactions with alice",
      resolvedCounterparty: alice
    });
    const txs = Array.from({ length: 12 }, (_, i) => makeTxRecord({ id: `tx${i + 1}` }));
    setRepositories(makeRepos(txs) as ReturnType<typeof createMongoRepositories>);

    const result = await getTransactionsWithCounterparty(ctx);

    expect(lastCounterpartyLimit).toBe(50);
    const meta = (result.displayData as { metadata: { recordCount: number } }).metadata;
    expect(meta.recordCount).toBe(12);
  });

  it("defaults to 10 when no count is specified", async () => {
    const ctx = makeContext({
      message: "transactions with alice",
      resolvedCounterparty: alice
    });
    const txs = Array.from({ length: 12 }, (_, i) => makeTxRecord({ id: `tx${i + 1}` }));
    setRepositories(makeRepos(txs) as ReturnType<typeof createMongoRepositories>);

    await getTransactionsWithCounterparty(ctx);

    expect(lastCounterpartyLimit).toBe(10);
  });

  it("honors an explicit smaller number", async () => {
    const ctx = makeContext({
      message: "show me the last 3 transactions with alice",
      resolvedCounterparty: alice
    });
    const txs = Array.from({ length: 12 }, (_, i) => makeTxRecord({ id: `tx${i + 1}` }));
    setRepositories(makeRepos(txs) as ReturnType<typeof createMongoRepositories>);

    await getTransactionsWithCounterparty(ctx);

    expect(lastCounterpartyLimit).toBe(3);
  });
});
```

- [ ] **Step 6: Run the executor limit tests to verify they fail**

Run: `npm test --workspace server -- src/ai/tools/__tests__/getTransactionsWithCounterparty.test.ts`
Expected: FAIL. The "all" case reports `lastCounterpartyLimit` `5` (not `50`) and `recordCount` `5` (not `12`); the default and explicit-number cases also report `5`.

- [ ] **Step 7: Implement the executor limit fix**

In `server/src/ai/tools/getTransactionsWithCounterparty.ts`, change the import on line 5 from:

```ts
import { transactionMemoryUpdatesFromRows } from "./transactionHelpers.js";
```

to:

```ts
import {
  getTransactionLimitAllowingAll,
  transactionMemoryUpdatesFromRows
} from "./transactionHelpers.js";
```

Then replace the repo call (lines 23-27):

```ts
  const transactions = await getRepositories().transactions.recentWithCounterparty({
    ownerId: context.userId,
    counterpartyEmail: counterparty.email,
    limit: 5
  });
```

with:

```ts
  const transactions = await getRepositories().transactions.recentWithCounterparty({
    ownerId: context.userId,
    counterpartyEmail: counterparty.email,
    limit: getTransactionLimitAllowingAll(context, 10)
  });
```

- [ ] **Step 8: Run the executor limit tests to verify they pass**

Run: `npm test --workspace server -- src/ai/tools/__tests__/getTransactionsWithCounterparty.test.ts`
Expected: PASS, including all pre-existing tests in the file (the sliced fake returns the same small arrays under the default limit of 10).

- [ ] **Step 9: Commit**

```bash
git add server/src/ai/tools/transactionHelpers.ts \
        server/src/ai/tools/getTransactionsWithCounterparty.ts \
        server/src/ai/tools/__tests__/transactionHelpers.test.ts \
        server/src/ai/tools/__tests__/getTransactionsWithCounterparty.test.ts
git commit -m "fix(ai): honor requested count for counterparty transactions instead of capping at 5"
```

---

### Task 2: Render the results as a transaction-list card

**Files:**
- Modify: `server/src/ai/tools/getTransactionsWithCounterparty.ts:5` (import) and `:83-87` (the ok-branch metadata)
- Test: `server/src/ai/tools/__tests__/getTransactionsWithCounterparty.test.ts` (extend)

**Interfaces:**
- Consumes: `metadataFromTransactionRows(rows)` from `./transactionHelpers.js` (returns `{ recordCount, transactions, counterparties }`), and `buildBlocksFromResult(toolName, result)` from `../../v2/blocks.js`.
- Produces: `displayData.metadata.transactions` populated on the ok result, which makes `buildBlocksFromResult("getTransactionsWithCounterparty", result)` emit a `transaction_list` block.

- [ ] **Step 1: Write the failing card test**

In `server/src/ai/tools/__tests__/getTransactionsWithCounterparty.test.ts`, add this import at the top, next to the existing imports:

```ts
import { buildBlocksFromResult } from "../../v2/blocks.js";
```

Then append this block after the Task 1 describe block:

```ts
describe("getTransactionsWithCounterparty - transaction_list card", () => {
  const alice = {
    email: "alice@example.com",
    maskedLabel: "a***@example.com",
    userLabel: "Alice",
    firstMentionedAtTurn: 1,
    lastReferencedAtTurn: 1
  };

  it("populates metadata.transactions so a transaction_list card renders every row", async () => {
    const ctx = makeContext({
      message: "show me all transactions with alice",
      resolvedCounterparty: alice
    });
    const txs = [
      makeTxRecord({ id: "tx1", type: "debit", amount: 100 }),
      makeTxRecord({ id: "tx2", type: "credit", amount: 75 })
    ];
    setRepositories(makeRepos(txs) as ReturnType<typeof createMongoRepositories>);

    const result = await getTransactionsWithCounterparty(ctx);

    const meta = (result.displayData as { metadata: { transactions?: unknown[] } }).metadata;
    expect(meta.transactions).toHaveLength(2);

    const blocks = buildBlocksFromResult("getTransactionsWithCounterparty", result);
    const list = blocks.find((block) => block.type === "transaction_list") as
      | { type: "transaction_list"; summary: { totalCount: number } }
      | undefined;
    expect(list).toBeDefined();
    expect(list?.summary.totalCount).toBe(2);
  });

  it("keeps counterparty emails masked in the card rows", async () => {
    const ctx = makeContext({
      message: "show me all transactions with alice",
      resolvedCounterparty: alice
    });
    setRepositories(makeRepos([makeTxRecord({ id: "tx1" })]) as ReturnType<typeof createMongoRepositories>);

    const result = await getTransactionsWithCounterparty(ctx);
    const meta = (result.displayData as {
      metadata: { transactions?: Array<{ counterpartyLabel?: string }> };
    }).metadata;

    expect(meta.transactions?.[0].counterpartyLabel).toBe("a***@example.com");
    expect(JSON.stringify(meta.transactions)).not.toContain("alice@example.com");
  });
});
```

- [ ] **Step 2: Run the card test to verify it fails**

Run: `npm test --workspace server -- src/ai/tools/__tests__/getTransactionsWithCounterparty.test.ts -t "transaction_list card"`
Expected: FAIL. `meta.transactions` is `undefined`, so `toHaveLength(2)` throws and `buildBlocksFromResult` returns `[]` (no `transaction_list` block).

- [ ] **Step 3: Populate metadata.transactions**

In `server/src/ai/tools/getTransactionsWithCounterparty.ts`, change the import on line 5 (already touched in Task 1) to also bring in `metadataFromTransactionRows`:

```ts
import {
  getTransactionLimitAllowingAll,
  metadataFromTransactionRows,
  transactionMemoryUpdatesFromRows
} from "./transactionHelpers.js";
```

Then replace the ok-branch `metadata` object (lines 83-87):

```ts
    metadata: {
      recordCount: transactions.length,
      counterpartyEmail: counterparty.email,
      maskedLabel: counterparty.maskedLabel
    },
```

with:

```ts
    metadata: {
      ...metadataFromTransactionRows(summaries),
      counterpartyEmail: counterparty.email,
      maskedLabel: counterparty.maskedLabel
    },
```

`metadataFromTransactionRows(summaries)` sets `recordCount` to `summaries.length` (the same value as before) and adds the masked `transactions` and `counterparties` arrays; `summaries` is already accepted by `transactionMemoryUpdatesFromRows` on the next line, so it satisfies the `SafeTransactionRow[]` parameter and this compiles.

- [ ] **Step 4: Run the card test to verify it passes**

Run: `npm test --workspace server -- src/ai/tools/__tests__/getTransactionsWithCounterparty.test.ts -t "transaction_list card"`
Expected: PASS.

- [ ] **Step 5: Run the whole executor test file**

Run: `npm test --workspace server -- src/ai/tools/__tests__/getTransactionsWithCounterparty.test.ts`
Expected: PASS for every test, including the pre-existing `recordCount` and masking assertions.

- [ ] **Step 6: Commit**

```bash
git add server/src/ai/tools/getTransactionsWithCounterparty.ts \
        server/src/ai/tools/__tests__/getTransactionsWithCounterparty.test.ts
git commit -m "fix(ai): render counterparty transactions as a transaction_list card"
```

---

### Task 3: Full verification

**Files:** none (verification only)

- [ ] **Step 1: Type-check the server**

Run: `npm run build --workspace server`
Expected: tsc completes with no errors.

- [ ] **Step 2: Run the full server suite**

Run: `npm test --workspace server`
Expected: all suites pass; no regressions in `searchTransactions`, `transactionHelpers`, `blocks`, or router tests.

- [ ] **Step 3: Manual end-to-end check (picky-UI pass)**

With `docker compose up` and an account holding more than 5 transactions to one counterparty:
send "show me all my transactions with <that counterparty>" and confirm a transaction-list card renders every transaction (up to 50), and that the count matches the number stated by "what is my history with <that counterparty>".
Confirm the counterparty email is shown masked in each row.

- [ ] **Step 4: Update the task index**

In `docs/planning/todoist-task-index.md`, the row for `6h249JvMvfXqrqvM` already links this plan with status `Planned`; change its status to `Delivered` (with the merge commit), and update the Rollup counts accordingly.

---

## Self-Review

**Spec coverage:**
- "Returns only a few, not all" -> Task 1 resolves the limit from the user's request (`all` -> 50, explicit N honored, default 10), replacing the hardcoded `5`.
- "Summary works but the list does not" -> Task 2 makes the list render as a card with `totalCount`, closing the gap between the summary's true count and the rendered rows.
- Every path is covered because the v1 tool, v2 `getCounterpartyTransactions`, and v2 `searchTransactions`-with-counterparty all call the one executor edited here, and `baseToolContext` passes the user's raw message through as `context.message`.

**Placeholder scan:** every code step shows the exact edit; no "TBD", "add validation", or "similar to Task N" placeholders.

**Type consistency:** `getTransactionLimitAllowingAll`, `messageRequestsAllTransactions`, and `MAX_TRANSACTION_LIST_LIMIT` are named identically in every task and test; `metadataFromTransactionRows` and `buildBlocksFromResult` match their real signatures in `transactionHelpers.ts` and `v2/blocks.ts`; the `summaries` variable is reused for metadata exactly as it is already reused for `transactionMemoryUpdatesFromRows`.
