# AI LangSmith Coverage Matrix

Dataset file: `server/src/ai/evals/langsmith/assistant-langsmith.examples.json`

The examples use deterministic world data from `server/src/ai/evals/v2/world.ts`
and DB-free tool fakes from `server/src/ai/evals/v2/worldTools.ts`. Several
cases are adapted from existing fixture suites and v2 conformance scenarios.

| Behavior | Example IDs |
| --- | --- |
| Balance/account reads | `balance-smoke`, `account-summary-smoke` |
| Recent transaction lists/search/details | `recent-transactions-list`, `transaction-search-filter`, `transaction-detail-ordinal`, `transaction-stats-count` |
| Counterparty lookup, summaries, totals, net, activity | `counterparty-summary-named`, `counterparty-activity-timeline`, `counterparty-net-follow-up`, `recent-sent-coreference`, `recent-received-coreference` |
| Verified recipients and empty/no-result reads | `verified-recipients-list`, `pending-confirmations-empty`, `unknown-counterparty-lookup` |
| Transfer limits, eligibility, quote, daily usage | `transfer-limits-readonly`, `transfer-eligibility-readonly`, `transfer-quote-readonly`, `daily-transfer-usage-readonly` |
| Transfer preparation card only | `transfer-prepare-explicit-email`, `transfer-prepare-known-name` |
| Missing/ambiguous transfer details | `transfer-missing-recipient-clarification`, `transfer-missing-amount-clarification`, `transfer-over-limit-clarification` |
| Pending transfer modify/cancel | `transfer-modify-pending-amount`, `transfer-cancel-pending-chat` |
| Chat text cannot execute money | `chat-confirmation-does-not-execute`, `no-premature-execution-multiturn` |
| Contextual amount memory | `contextual-amount-from-total`, `coref-amount-switch-v2`, `contextual-arithmetic-f2` |
| Pronouns and counterparty switching | `recent-sent-coreference`, `counterparty-net-follow-up`, `coref-amount-switch-v2`, `hebrew-coref-transfer` |
| Clarification/resume sequences | `missing-recipient-resume-v2`, `transfer-missing-amount-clarification` |
| Hebrew and mixed-language coverage | `hebrew-coref-transfer`, `hebrew-pending-list-reference`, `mixed-transaction-detail-stats` |
| Pending confirmation list/reference | `pending-confirmations-empty`, `hebrew-pending-list-reference` |
| Unsafe/privacy/prohibited requests | `unsafe-cross-user-data`, `unsafe-prompt-disclosure`, `unsafe-forbidden-tool-request` |
| Multi-request turn | `multi-request-balance-and-daily-usage` |
| Regression fixtures / live conformance provenance | `coref-amount-switch-v2`, `missing-recipient-resume-v2`, `contextual-arithmetic-f2`, `no-premature-execution-multiturn`, `hebrew-coref-transfer`, `mixed-transaction-detail-stats`, `hebrew-pending-list-reference` |

## Coverage Notes

- The dataset intentionally validates behavior, not wording. Assertions check
  facts, state transitions, tool paths, cards, clarification, and forbidden
  claims.
- The current default graph is v2. Some examples are expected to fail until live
  model behavior meets the v2 conformance bar; that is useful regression signal.
- HTTP authentication/CSRF is documented in the contract doc. The runnable
  LangSmith examples operate at the service-level `RunAssistantInput` sequence
  because LangSmith targets call application functions, not browser cookie flows.
