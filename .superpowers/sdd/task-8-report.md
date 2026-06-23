# Task 8 Report: ExchangeRate Repository Seam

## TDD RED → GREEN

### RED (contract test written first, stub throws)
```
$ cd server && npm test -- --test-reporter=tap 2>&1 | grep "exchangeRate.repository"
# All 10 exchangeRate.repository tests were failing with:
#   "mongoExchangeRateRepository.latestForBase not implemented yet (stub — replaced in Stage B)"
```

### GREEN (after implementing `exchangeRate.repository.ts`)
```
$ npm test
ℹ tests 419
ℹ pass  419
ℹ fail  0
```

10 new contract tests added; all previously passing 409 tests remained green.

---

## How each repo method reproduces the original fx query

### `latestForBase(baseCurrency, tx?)`
Original in `mongoFxStore.findLatest`:
```ts
ExchangeRate.findOne({ baseCurrency }).sort({ fetchedAt: -1 }).lean()
```
Repo impl:
```ts
ExchangeRate.findOne({ baseCurrency }).sort({ fetchedAt: -1 })  // + optional .session(s)
await q.lean()
```
Identical filter and sort. Session added conditionally per the established pattern.

### `findForDate(baseCurrency, validForDate, tx?)`
Original in `mongoFxStore.findByDate`:
```ts
ExchangeRate.findOne({ baseCurrency, validForDate }).sort({ fetchedAt: -1 }).lean()
```
Repo impl: identical filter and sort; session added conditionally.

### `upsertForDate(record, tx?)`
Original in `mongoFxStore.upsert`:
```ts
ExchangeRate.updateOne(
  { baseCurrency, validForDate },
  { $set: snapshot },
  { upsert: true }
)
```
Repo impl uses `findOneAndUpdate` with `{ upsert: true, new: true }` to return the saved document as an `ExchangeRateRecord` (the interface requires returning the record, not `void`). Same upsert key `(baseCurrency, validForDate)` and `$set` semantics.

---

## Consumer refactor (`fx.service.ts`)

- Removed: `import { ExchangeRate } from "../models/ExchangeRate.js"`
- Added: `import { getRepositories } from "../repositories/index.js"`
- Replaced `mongoFxStore` body: three methods now call `getRepositories().exchangeRates.*`
- `toStoredSnapshot()` replaced with `recordToStoredSnapshot()` that maps an `ExchangeRateRecord` (from the repo) to `StoredFxSnapshot` (for the internal `FxDeps.store` type) — no Mongoose Document access.
- `FxDeps` / `FxStore` interfaces and all exported functions unchanged (no API breakage).

## Route test fixes (`exchangeRate.routes.test.ts`, `fxTransfer.routes.test.ts`)

Both integration tests previously patched `ExchangeRate.findOne` directly on the Mongoose model. Now that the service calls through `getRepositories().exchangeRates`, these tests needed `setRepositories(createMongoRepositories())` at module scope so `defaultDeps()` can resolve the registry. The existing `ExchangeRate.findOne` patches still flow correctly because `mongoExchangeRateRepository` calls through to that same Mongoose method.

---

## tsc + Full Suite Results

```
$ npx tsc -p tsconfig.json --noEmit
(no output — clean)

$ npm test
ℹ tests 419
ℹ suites 11
ℹ pass 419
ℹ fail 0
ℹ duration_ms ~5800
```

---

## Self-review: no `models/ExchangeRate` outside seam

```
$ grep -r "models/ExchangeRate" server/src --include="*.ts" | grep -v ".test.ts"
server/src/repositories/mongo/exchangeRate.repository.ts:import { ExchangeRate } from "../../models/ExchangeRate.js";
```

Only the repo seam imports the model in production code. Test files import it solely to patch `findOne` for integration testing (same pattern as `transaction.repository.test.ts` → `Transaction`).

---

## Concerns / Notes

- `upsertForDate` uses `findOneAndUpdate` (returns the doc) rather than the original `updateOne` (returns void). This is required because the interface contract returns `ExchangeRateRecord`, not `void`. The upsert key and `$set` semantics are identical.
- Route tests now call `setRepositories(createMongoRepositories())` at module scope. This is a global side-effect but mirrors how `personalDetails.service.test.ts` uses `setRepositories`/`t.after`. No test isolation issues since each test patches and restores `ExchangeRate.findOne` via `t.after`.
- `rates` stays as a plain `Record<string, number>` POJO throughout — no `Schema.Types.Mixed` leaks past the repo.
- No offset pagination, no synchronous file ops, no N+1 queries introduced.
