# Backend area: Fraud detection

> Scoring, flagging, and holding transfers that exceed a configurable risk
> threshold. No HTTP endpoints of its own beyond the held-transfer confirm/cancel
> pages; those live in the Transactions area. See [`../index.md`](../index.md)
> for layering.

> **Money-movement mechanics are not repeated here.** The held-transfer lifecycle
> and how it interacts with `executeTransfer` are covered in the
> [Transfers domain doc](../../domain/transfers.md). Security trust-boundary
> detail for the hold confirm link lives in
> [`../../security.md`](../../security.md).

**Live path modules:** `server/src/fraud/service.ts`,
`server/src/fraud/risk.ts`, `server/src/fraud/anomaly.ts`,
`server/src/fraud/holds.ts`, `server/src/fraud/repository.ts`,
`server/src/fraud/types.ts`

**Offline benchmark modules (not in the request path):**
`server/src/fraud/csv.ts`, `server/src/fraud/knn.ts`,
`server/src/fraud/logreg.ts`, `server/src/fraud/metrics.ts`,
`server/src/fraud/scaler.ts`, `server/src/fraud/knnEval.ts`

## Live path — how scoring works

```
POST /api/transactions  (transaction.routes.ts)
        |
        | config.fraud.holdLevel !== "off"
        v
  scoreTransfer()          fraud/service.ts  — reads app repos, calls computeRisk + knnAnomalyScore
        |
        +-- shouldHold(level)  holds.ts  — yes?
        |         |
        |         v
        |   createHold()   holds.ts  — writes held_transfers (AI Postgres)
        |   sendTransferHoldEmail()            → 202 "held" response
        |
        +-- shouldHold() no  →  executeTransfer()  →  recordTransferRiskFlag()
                                                         (best-effort; writes ai_fraud_flags)
```

### `service.ts`

Central seam called by both the AI assistant (`assessTransactionRisk` tool) and
the route (`POST /api/transactions`). Three exported functions:

- **`scoreTransfer(input)`** — reads the app repositories (works in mongo and
  postgres mode; does NOT touch the AI Postgres) to collect three signals:
  `hasDebitToCounterparty`, `getDailyDebitUsage`, and up to 50 recent debits.
  Passes them to `computeRisk` and `knnAnomalyScore`; returns a `RiskResult`
  (score 0..1, level `low`/`medium`/`high`, reasons, flags).
- **`recordTransferRiskFlag(input)`** — calls `scoreTransfer` (post-commit),
  then writes to `ai_fraud_flags` in the AI Postgres when level is not `low`.
  **Best-effort only**: any failure — including the AI Postgres being
  unavailable — is swallowed. It can never affect a completed transfer.
- **`listFraudFlags(opts)`** — reads `ai_fraud_flags` for analyst or MCP
  surfaces; optionally filtered by level and/or userId.

### `risk.ts`

Pure, deterministic function `computeRisk(signals)` that combines six
explainable rules into a 0..1 score:

| Rule | Score delta | Trigger |
|------|-------------|---------|
| New counterparty | +0.20 | First debit to this recipient |
| High amount | +0.20 | Amount >= 80% of per-transfer limit |
| Near daily limit | +0.20 | Projected daily total >= 90% of daily limit |
| Over daily limit | +0.35 | Projected daily total >= daily limit |
| Amount spike | +0.25 | Amount > mean + 3 std of recent debits (needs >= 5 history rows) |
| Odd hour | +0.10 | UTC hour in {0,1,2,3,4,5} |
| kNN anomaly | up to +0.40 | `anomalyScore` contribution (0.4 * anomalyScore) |

Level thresholds: score >= 0.7 → `high`; >= 0.4 → `medium`; else `low`.

Limits are read from `config.ai.perTransferLimit` and `config.ai.dailyTransferLimit`.

### `anomaly.ts`

`knnAnomalyScore(history, query, k=5)` — unsupervised anomaly score in [0, 1).
Fits a standard scaler on the user's recent debit history (`[amount, utcHour]`
pairs), standardizes both history and query, finds the k nearest neighbors by
L2 distance in standardized space, and squashes mean distance to [0, 1) via
`1 - exp(-d / (2*sqrt(dim)))`. Returns 0 (cold start) when history has fewer
than `MIN_HISTORY` (5) rows. No labels, no embeddings, no model file.

### `holds.ts`

Manages the `held_transfers` store in the AI Postgres (self-managed table;
`CREATE TABLE IF NOT EXISTS` at first use). Key exports:

- **`shouldHold(level, policy?)`** — decides whether a scored transfer should be
  held. Policy `"off"` → never; `"high"` → only `high`-risk; `"medium"` → both
  `medium` and `high`. Defaults to `config.fraud.holdLevel`.
- **`createHold(input)`** — inserts a `held_transfers` row with status `pending`,
  stores a SHA-256 hash of a 24-byte random token (never the token itself), sets
  `expires_at` from `config.fraud.holdExpiryHours`. Returns the raw token for
  the email link.
- **`confirmHold(id, token)`** — compare-and-set: atomically transitions
  `pending` → `confirming`, then calls `executeTransfer`, then transitions to
  `confirmed`. If money moved but the bookkeeping UPDATE fails, records
  `needs_reconciliation` (never reverts to `pending`). Idempotent on
  `already_confirmed`.
- **`cancelHold(id, token)`** — transitions `pending` → `cancelled` (token-
  guarded).
- **`listHeldTransfers(opts)`** — analyst/MCP read surface, optionally filtered
  by status and/or userId.

`HeldTransferStatus` values: `pending | confirming | confirmed | cancelled | expired | needs_reconciliation`.

### `repository.ts`

pgvector-backed `fraud_transactions` table in the AI Postgres — used by the
**offline benchmark only** (not by the live scoring path). Self-manages its
schema with `CREATE EXTENSION IF NOT EXISTS vector` + `CREATE TABLE IF NOT
EXISTS` + an HNSW L2 index. Exports `insertMany`, `knnSearch` (pgvector `<->`
operator, labeled rows only), and `countLabeled`.

### `types.ts`

Shared types for the Kaggle benchmark pipeline: `FRAUD_FEATURE_DIM` (29:
V1..V28 + Amount), `FraudLabel`, `RawTransaction`, `Scaler`, `FraudVectorRecord`,
`KnnNeighbor`, `FraudKnnScore`.

## AI Postgres tables (self-managed)

Both tables live in the AI Postgres (`VIRLY_AI_PG_URL`) and are created with
`CREATE TABLE IF NOT EXISTS` at runtime, **not** via the Drizzle AI migrations
(`drizzle-ai/`). They have no foreign-key relationship to the app DB.

| Table | Managed in | Purpose |
|-------|------------|---------|
| `ai_fraud_flags` | `service.ts` | Post-commit risk flags (level `medium` or `high` only). |
| `held_transfers` | `holds.ts` | Held-transfer intent + SHA-256 token hash + lifecycle status. |

## Offline benchmark (not in the request path)

These files implement a Kaggle "Credit Card Fraud Detection" (ULB) benchmark
pipeline. They are **not called during normal request processing**; they exist
to evaluate unsupervised kNN and logistic-regression classifiers against a
labeled dataset offline. They are run via `npm run fraud:ingest` (loads the
CSV into `fraud_transactions`) and `npm run fraud:train`.

| File | Role |
|------|------|
| `csv.ts` | `parseCreditCardCsv` — parses the Kaggle CSV (V1..V28, Amount, Class) into `RawTransaction[]`. |
| `scaler.ts` | `fitScaler` / `transform` / `assertScalerDim` — standard scaler (mean/std per column); also used by `anomaly.ts` in the live path. |
| `knn.ts` | `scoreByKnn` — queries the pgvector `fraud_transactions` table for the k nearest labeled neighbors; the production kNN serving path (requires ingested Kaggle data). |
| `knnEval.ts` | `knnFraudProbInMemory` — brute-force in-memory kNN for the offline evaluation split (avoids needing a DB during benchmarking). |
| `logreg.ts` | `trainLogReg` / `predictProba` — pure-TypeScript batch gradient-descent logistic regression with balanced class weights and L2 regularisation. |
| `metrics.ts` | `confusionAtThreshold`, `prAuc`, `bestF1Threshold` — precision-recall metrics suited to the extreme class imbalance (~0.17% positives). |

`scaler.ts` is the one benchmark file also used by the live path: `anomaly.ts`
imports `fitScaler` and `transform` from it.

## v2 AI tool

`server/src/ai/v2/tools/fraud.ts` exports `assessTransactionRiskTool`
(`assessTransactionRisk`), which calls `scoreTransfer` directly and surfaces
elevated risk to the user before they confirm a transfer. See the
[AI architecture doc](../../ai/architecture.md) for tool registration and the
agent graph.

## Cross-cutting

- **Fail-open discipline.** Scoring, hold creation, and AI Postgres writes all
  degrade gracefully — a fraud infrastructure failure must never block a
  legitimate transfer. Errors are logged but swallowed.
- **No app-repo writes.** The fraud module never touches the app's MongoDB or
  Postgres. It reads the app repos (via `getRepositories()`) and writes only to
  the AI Postgres.
- **Config.** `config.fraud.holdLevel` (`off | medium | high`, env
  `VIRLY_FRAUD_HOLD_LEVEL`). `config.fraud.holdExpiryHours` (env
  `VIRLY_FRAUD_HOLD_EXPIRY_HOURS`). When `holdLevel` is not `off` and
  `VIRLY_AI_PG_URL` is absent, config throws at boot.
- **Held-transfer confirm/cancel endpoints** are documented in the Transactions
  area — [`transactions-transfers.md`](transactions-transfers.md).
