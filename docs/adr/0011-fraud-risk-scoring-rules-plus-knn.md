# ADR-0011: Fraud risk scoring: explainable rules + unsupervised kNN; Kaggle model as offline benchmark only

**Status:** Accepted
**Date:** 2026-06-27
**Source:** `server/src/fraud/risk.ts` (`computeRisk`, `RiskSignals`, `RiskResult`); `server/src/fraud/anomaly.ts` (`knnAnomalyScore`, `MIN_HISTORY`); `server/src/fraud/service.ts` (`scoreTransfer`, `recordTransferRiskFlag`); `server/src/fraud/logreg.ts` (offline logistic regression; note "Trained offline by `fraud-train.ts`"); `server/scripts/fraud-train.ts` (offline CLI, writes `artifacts/fraud-model.json`); `server/src/fraud/logreg.ts` line 7 ("the Kaggle credit-card dataset exists only as an offline benchmark").

---

## Context

A supervised fraud model trained on a public Kaggle credit-card dataset could
theoretically score any transfer, but it has two structural problems for Virly:
the feature set (anonymised PCA components) is specific to the Kaggle data and
does not map to Virly's transfer features; and it requires labelled training data
per user, which does not exist when a user has no prior fraud history. We needed
a scorer that works from day one for every user, produces human-readable
explanations operators can act on, and can be deployed without an ML serving
runtime.

## Decision

The live scorer in the request path combines:

1. **Deterministic rules** (`computeRisk` in `risk.ts`): five named signals with
   fixed weights — new counterparty (+0.20), high amount relative to the
   per-transfer limit (+0.20), over/near the daily limit (+0.35/+0.20), amount
   spike beyond 3 standard deviations of the user's recent history (+0.25), and
   odd hour (0–5 UTC, +0.10). Each triggered rule appends a human-readable
   reason string.

2. **Unsupervised kNN anomaly** (`knnAnomalyScore` in `anomaly.ts`): standardises
   the user's recent debit history (amount, UTC hour) and measures how far the
   new transfer sits from its k nearest historical neighbours in that space.
   Requires at least 5 history points (`MIN_HISTORY = 5`) before producing a
   non-zero score; returns 0 for cold-start users. The anomaly score is added to
   the rule score with weight 0.40.

The combined score maps to a level: `score >= 0.7` → `high`, `>= 0.4` →
`medium`, else `low`. No training, no labels, no external ML dependency.

The logistic-regression model (`logreg.ts`) and the `fraud-train.ts` script are
**offline only**: they exist to benchmark the kNN approach on the Kaggle
credit-card CSV and to explore model quality. The resulting artifact
(`artifacts/fraud-model.json`) is never loaded by the request path. This
separation is documented in `service.ts` line 8 ("the Kaggle model is a
separate benchmark") and in `logreg.ts` line 7 ("Trained offline by
`fraud-train.ts`").

## Alternatives considered

| Alternative | Why not chosen |
|---|---|
| Supervised model (logistic regression / gradient boosting) in the request path | Requires labelled Virly transfer data that does not exist at launch; the Kaggle dataset features do not align with Virly's feature set; adds an ML artifact that must be versioned and deployed. |
| External fraud-scoring API | Adds latency, a third-party dependency, cost per transaction, and a privacy concern (all transfer details leave the system). |
| Pure rules with no anomaly signal | Misses novel per-user patterns that don't trigger any named rule (e.g. a user who always sends small amounts suddenly sending a large one to a known counterparty). |
| Embeddings-based anomaly detection | Requires the AI Postgres for every scoring call; overkill for a two-feature per-user anomaly signal. |

## Status

Accepted — `computeRisk`, `knnAnomalyScore`, and `scoreTransfer` are live in
the request path. `logreg.ts` and `fraud-train.ts` exist in the repo for
offline benchmarking only and are not imported by any production code path.

## Consequences

**Positive:** Works for every user from the first transfer; all score
contributions are enumerable strings visible to operators and users; no ML
serving infrastructure; scorer is pure and fully unit-testable without a
database.

**Negative / trade-offs:** The rule weights are fixed constants (`risk.ts`
lines 40–44); tuning requires a code change and redeploy. The kNN signal
requires at least 5 prior transfers to activate, so genuinely first-time users
get only the rule contribution. Scores are additive and can exceed 1.0 before
clamping, which can make weight-tuning non-intuitive.

**Neutral / follow-on work:** The offline logistic-regression benchmark pipeline
makes it straightforward to evaluate whether a trained model outperforms the
rule+kNN scorer when labelled Virly data becomes available. Replacing the live
scorer would be a contained change inside `service.ts`. See also
[`../ai/architecture.md`](../ai/architecture.md) and
[`../domain/transfers.md`](../domain/transfers.md) for how the score feeds into
the fraud hold decision (ADR-0012).
