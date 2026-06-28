# Extract a `TransactionQueryService` for ledger reads

> **✅ Implemented (commit `7eaed76`).** `server/src/services/transactionQuery.service.ts`
> exposes `listForOwner`, `getRelationshipStats`, and `recentWithCounterparty`
> exactly as proposed; the aggregation pipeline now lives behind the repository
> layer, and `transaction.routes.ts`, `user.routes.ts`, and `userProfile.routes.ts`
> all call the service. **Still open:** the service is the single home the doc
> wanted, but it still uses offset (`page`/`limit`) pagination — the
> cursor-pagination migration and the `{ ownerId, counterpartyEmail, createdAt }`
> compound index remain future work. Line numbers below are pre-refactor.

**Priority:** High · **Effort:** Medium · **Risk:** Low

## Problem

There is a `transfer.service.ts` that *writes* the ledger, but every *read* of
the ledger is done with inline `Transaction.*` calls, and the same
filter + sort + skip + limit + `countDocuments` shape is copy-pasted across
three route files:

- `server/src/routes/transaction.routes.ts:107-108` — owner listing (+ optional counterparty filter)
- `server/src/routes/user.routes.ts:62-63` — `/me` owner listing
- `server/src/routes/userProfile.routes.ts:181-182` — relationship listing
- `server/src/routes/userProfile.routes.ts:66-86` — relationship **aggregate**
  (`totalSent`/`totalReceived`/`count`/`lastTransactionAt`)
- `server/src/routes/userProfile.routes.ts:131-134` — recent-5 with counterparty

Consequences:

- **Duplicated pagination math** (`skip = (page-1)*limit`) in four places.
- The aggregation pipeline (a non-trivial, money-bearing `$group`) sits in a
  route file where it cannot be reused or unit-tested directly.
- There is **no single place** to later add the missing
  `{ ownerId, counterpartyEmail, createdAt }` compound index strategy or to
  migrate offset → cursor pagination (both noted in the project review). A
  service is the natural home for that change.

## Proposed service

`server/src/services/transactionQuery.service.ts`:

```ts
export const transactionQueryService = {
  listForOwner(input: {
    ownerId: string;
    counterpartyEmail?: string;
    page: number;
    limit: number;
  }): Promise<{ transactions: TransactionDocument[]; total: number }>;

  getRelationshipStats(input: {
    ownerId: string;
    counterpartyEmail: string;
  }): Promise<{ totalSent; totalReceived; transactionCount; lastTransactionAt }>;

  recentWithCounterparty(input: {
    ownerId: string;
    counterpartyEmail: string;
    limit: number;
  }): Promise<TransactionDocument[]>;
};
```

`getRelationshipStats` absorbs `getRelationshipStats` from
`userProfile.routes.ts:62`; the routes keep only DTO mapping
(`toTransactionDto` / `toRelationshipTransactionDto`) and `getPaginationMeta`.

## Migration steps

1. Add the service and move the aggregation pipeline into it verbatim.
2. Swap the four route call-sites to use `listForOwner` / `getRelationshipStats`
   / `recentWithCounterparty`.
3. With reads centralized, the index + cursor-pagination improvements become a
   single-file change.

## Reference

`fx.service.ts` is a good example of a read-oriented service with a clean,
testable surface.
