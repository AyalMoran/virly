# AI Rewrite Progress

## Current Status

The graph rewrite is implemented and verified. The top-level graph now uses conditional routing into compiled subgraphs for request parsing, clarification resume, read-only answers, transfer preparation, pending modification, pending status, and response composition. Existing node logic remains in `graph.ts` to keep the behavior-preserving topology change low-churn.

## Completed Steps

- [x] Phase 1: Safe extraction
- [x] Phase 2: Conditional top-level routing
- [x] Phase 3: Request parsing subgraph
- [x] Phase 4: Read-only answer subgraph
- [x] Phase 5: Transfer preparation subgraph
- [x] Phase 6: Pending modification subgraph
- [x] Phase 7: Pending status subgraph
- [x] Phase 8: Response subgraph
- [x] Phase 9: Structured clarification state
- [x] Phase 10: Cleanup, tests, and documentation alignment

## Change Log

### 2026-06-06 00:00

Changed:
- Initialized the running progress log.
- Added deterministic graph route helpers in `server/src/ai/graphRoutes.ts`.
- Extended `ClarificationRequest` with optional structured resume fields for interrupt-compatible state without changing public response requirements.
- Rewired `buildAssistantGraph()` from one linear chain into conditional top-level routing through compiled subgraphs.
- Kept authentication, conversation loading, response composition, conversation saving, backend transfer validation, pending confirmation creation, and confirmation execution boundaries unchanged.
- Kept pending-modification resolver use inside the pending modification subgraph so recipient replacement can still resolve through the existing read-only resolver.

Files touched:
- `docs/ai-rewrite-progress.md`
- `server/src/ai/graph.ts`
- `server/src/ai/graphRoutes.ts`
- `server/src/ai/state.ts`
- `server/src/ai/tests/aiSafety.test.ts`

Verification:
- Passed: `npm run build --workspace server`
- Passed: `env VIRLY_EMAIL_FROM='Virly <verify@virly.ayal.online>' npm run test --workspace server`
- Passed: `git diff --check`
- Passed: `./scripts/ai-eval-chat.sh deterministic`

Result:
- Passed. Server tests reported 177 passing tests. Deterministic AI eval reported 4 fixtures, 14 scenarios, 23 turns, and 0 failed turns.

Remaining:
- Optional future cleanup: move local node implementations and subgraph builders into dedicated files if the team wants smaller `graph.ts` modules. This was intentionally deferred because the routed topology is verified and a broad file move would add review churn without changing behavior.

### 2026-06-06 00:01

Changed:
- Added routing/safety tests that inspect debug node transitions through the existing audit diagnostics path.
- Verified read-only requests skip transfer draft extraction, transfer preparation, and pending modification services.
- Verified transfer preparation skips the generic read-only tool router and pending modification service.
- Verified chat confirmation text with an active pending card remains read-only and skips transfer preparation and modification services.

Files touched:
- `docs/ai-rewrite-progress.md`
- `server/src/ai/tests/aiSafety.test.ts`

Verification:
- Passed: `npm run build --workspace server`
- Passed: `env VIRLY_EMAIL_FROM='Virly <verify@virly.ayal.online>' npm run test --workspace server`
- Passed: `git diff --check`
- Passed: `./scripts/ai-eval-chat.sh deterministic`

Result:
- Passed. Existing behavior and new routing/safety assertions are green.

Remaining:
- None required for the implemented rewrite.
