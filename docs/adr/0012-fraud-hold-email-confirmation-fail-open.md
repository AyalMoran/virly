# ADR-0012: Hold high-risk transfers for email confirmation, FAIL-OPEN

**Status:** Accepted
**Date:** 2026-06-27
**Source:** `server/src/fraud/holds.ts` (`setupHoldsTable`, `createHold`, `confirmHold`, `shouldHold`, `cancelHold`); `server/src/routes/transaction.routes.ts` (`tryHoldTransfer`, lines 208–273; `GET /held/confirm` line 290; `POST /held/confirm` line 311); `server/src/config.ts` (`resolveFraudHoldLevel`, lines 181–195; `VIRLY_FRAUD_HOLD_LEVEL`, `VIRLY_FRAUD_HOLD_EXPIRY_HOURS`).

---

## Context

Flagging a risky transfer after it executes (ADR-0011) tells operators what
happened but does nothing to prevent the harm. A mechanism to pause execution
and require explicit out-of-band confirmation by the sender adds a meaningful
layer of protection against account-takeover and social-engineering attacks. The
design tension is between security (stop risky transfers) and availability
(never block a legitimate transfer due to infrastructure failure).

## Decision

When `VIRLY_FRAUD_HOLD_LEVEL` is set to `high` or `medium`, a transfer whose
risk level meets or exceeds the threshold is NOT executed immediately. Instead:

1. A row is written to `held_transfers` (in the AI Postgres) containing the
   transfer intent, a SHA-256 hash of a random 24-byte token, and an expiry
   timestamp (default 24 h, configurable via `VIRLY_FRAUD_HOLD_EXPIRY_HOURS`).
2. A one-time confirmation email is sent to the sender with a link carrying the
   `id` and raw `token` as query parameters.
3. The transfer executes only when the sender follows that link and submits the
   confirmation form.

The **GET** link (`GET /api/transactions/held/confirm`) renders an HTML review
page only. It performs no state change, so email pre-fetch scanners and URL
preview tools cannot accidentally confirm a transfer. The actual state change
requires a **POST** (`POST /api/transactions/held/confirm`) with the token in
the request body (not the URL, so it is not logged by access-log middleware or
request tracing).

Double-spend is prevented by a compare-and-set claim: `confirmHold` atomically
flips `status` from `pending` to `confirming` in a single `UPDATE … RETURNING`
with an expiry check. Concurrent clicks on the confirm button either race to
claim the row (one wins, one gets `in_progress`) or find it already `confirmed`
(idempotent success). The executor tracks whether money actually moved before
recording status: if `executeTransfer` succeeds but the subsequent `UPDATE` to
`confirmed` fails, the row is set to `needs_reconciliation` rather than reverted
to `pending` (which would allow a second execution).

**FAIL-OPEN policy**: any failure in the scoring or hold-creation path (AI
Postgres unavailable, network error, etc.) degrades to a normal send. The
failure is logged at `console.error` with a clear message. Availability of
legitimate transfers is explicitly prioritised over strict blocking. The default
`VIRLY_FRAUD_HOLD_LEVEL=off` means the gate is disabled entirely unless an
operator opts in. See `transaction.routes.ts` `tryHoldTransfer` (lines 208–273)
for both fail-open cases.

## Alternatives considered

| Alternative | Why not chosen |
|---|---|
| Block transfers synchronously and require in-app confirmation | A blocked transfer cannot be confirmed if the user's session is compromised; adds friction for every held transfer on the web UI. |
| FAIL-CLOSED (block on infrastructure failure) | Any transient AI-Postgres outage would prevent ALL high-risk (and possibly all) transfers; unacceptable availability cost for a heuristic control. |
| Token in the URL for both GET and POST | GET requests (and their URLs) appear in server logs, browser history, email-client fetch logs, and proxy logs; a one-time token in a GET URL is consumed (and invalidated) on first load by a scanner before the real user clicks. |
| Require re-authentication instead of email confirmation | Re-auth doesn't help if the attacker already has the session; the email is the out-of-band channel that the attacker typically does not control. |

## Status

Accepted — `held_transfers` table setup, `createHold`, `confirmHold`,
`tryHoldTransfer`, and the GET/POST hold routes are live. Default is
`VIRLY_FRAUD_HOLD_LEVEL=off`.

## Consequences

**Positive:** High-risk transfers require an explicit out-of-band action from
the original sender; the compare-and-set prevents double-spend; fail-open keeps
the system available during AI-Postgres outages; the GET/POST split prevents
link-scanner auto-confirmation.

**Negative / trade-offs:** A held transfer incurs email-delivery latency; if the
AI Postgres is consistently unavailable, holds are silently bypassed and the
monitoring alert (logged at `console.error`) must be acted on externally. Token
expiry (default 24 h) is a UX friction point for infrequent users.

**Neutral / follow-on work:** `needs_reconciliation` rows require manual
operator intervention; a monitoring query or dashboard over `held_transfers
WHERE status = 'needs_reconciliation'` is a recommended operational follow-up.
See ADR-0011 for the scoring logic that determines `risk.level`, ADR-0014 for
the `held_transfers` table self-management approach, and
[`../security.md`](../security.md) §5 "Fraud holds" and
[`../domain/transfers.md`](../domain/transfers.md) for the full transfer flow.
