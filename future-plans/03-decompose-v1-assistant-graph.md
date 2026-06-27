# 03 — Decompose the v1 assistant graph god-file

**Strength: Strong** (for navigability and testability). Behaviour-preserving
refactor; no contract change, no ADR conflict.

---

## Thesis

`server/src/ai/graph.ts` is **4,150 lines** containing **~80 functions** — the
entire v1 deterministic assistant pipeline in one file: intent classification,
message normalization, slot extraction, transfer-draft extraction, counterparty
resolution, contextual amount resolution, pending-transfer modification,
tool routing, response composition, ~12 response post-check predicates,
required-facts derivation, label hydration/leak detection, conversation
load/save, and the four subgraph builders.

The architecture doc (`docs/ai/architecture.md` §2) presents v1 as a clean
sequence of named nodes:

```
classifyIntent → routeReadOnlyTools / extractTransferDraft
              → prepareTransferConfirmation → buildResponseBlocks
              → buildResponseStyle → composeResponse
```

That clean *interface* exists only in prose — the *implementation* is a single
4,150-line module. The pipeline is a **deep concept smeared into one shallow
file**: there is no module boundary at any of those node names, so understanding
or changing one stage means scrolling a 4k-line file and reasoning about which of
80 free functions belong to which stage.

This is the brief most about **AI-navigability**: an agent (or human) cannot load
"the counterparty-resolution stage" as a unit because it isn't one.

## Affected modules

- `server/src/ai/graph.ts` (4,150 LOC) — the file to split.
- Sibling large files that share its concepts and should inform the boundaries:
  `ai/state.ts` (1,139), `ai/responseBlocks.ts` (1,046), `ai/responseStyle.ts`
  (403), `ai/router.ts` (440), `ai/amountResolution.ts` (488),
  `ai/counterpartyMemory.ts` (410), `ai/messageNormalization.ts` (385).
- The **type-only import cycle** flagged by the graph tool:
  `assistants.ts → responseStyle.ts → state.ts → assistants.ts`. It is type-only
  (erased at compile time, so not a runtime bug) but signals that the shared
  assistant vocabulary (`AssistantId`, `AssistantIntent`, `ResponseSituation`,
  `PhrasePack`) has no home of its own. Fixing it is a natural part of this split.

## Evidence of the friction

- `wc -l server/src/ai/graph.ts` → **4150**.
- `grep -nE "^function|^async function" server/src/ai/graph.ts` → ~80 top-level
  functions, spanning every pipeline stage (a representative slice):
  `buildIntentClassifier`, `normalizeMessageNode`, `extractRequestSlotsNode`,
  `extractTransferDraftDeterministic`, `buildTransferDraftExtractor`,
  `buildCounterpartyResolver`, `buildContextualAmountResolver`,
  `buildTransferConfirmationPreparer`, `buildPendingTransferModifier`,
  `buildToolRouter`, `composeDeterministicResponse`, `buildResponseComposer`,
  `buildRequiredResponseFacts`, `getResponsePostCheckFailure`,
  `hasContradictingRequired{Recipient,Status,Date,Currency}Fact`,
  `buildConversationLoader`, `buildConversationSaver`,
  `buildRequestParsingSubgraph`, `buildClarificationSubgraph`,
  `buildReadOnlyAnswerSubgraph`, `buildTransferPreparationSubgraph`.

### Deletion test (applied per stage, not to the whole file)

You can't delete the file — it's the pipeline. But apply the test to a *stage*:
extract `buildCounterpartyResolver` + its ~6 helpers into a module and imagine
deleting that module. Complexity reappears in exactly one place (the resolution
stage) and *nowhere else* — which is precisely the signal that it *should* be its
own deep module with a small interface (`resolveCounterparty(state) → delta`)
rather than ~250 lines interleaved with unrelated stages.

## Target shape

Split `graph.ts` into one module per pipeline stage, each exporting a small
node-builder interface; `graph.ts` shrinks to the **assembly** of those nodes
(the thing the architecture diagram already shows). Proposed layout:

```
server/src/ai/v1/
  graph.ts                  ← assembly only: wire nodes + subgraphs (≈150–300 LOC)
  nodes/
    classifyIntent.ts       ← buildIntentClassifier (+ router.ts collaboration)
    normalizeMessage.ts     ← normalizeMessageNode, messageNormalization glue
    extractSlots.ts         ← extractRequestSlotsNode, resolveClarificationReplyNode
    extractTransferDraft.ts ← extractTransferDraftDeterministic, buildTransferDraftExtractor,
                              applySlotDataToDraft, inheritUnsetSlotsFromFrame
    resolveCounterparty.ts  ← buildCounterpartyResolver, needs/canUse… predicates
    resolveAmount.ts        ← buildContextualAmountResolver (+ amountResolution.ts)
    prepareConfirmation.ts  ← buildTransferConfirmationPreparer, buildPendingTransferModifier
    routeTools.ts           ← buildToolRouter, getRequestedToolNamesForState
    composeResponse.ts      ← buildResponseComposer, composeDeterministicResponse,
                              hydrateUserVisibleResponse, label/leak helpers
    requiredFacts.ts        ← buildRequiredResponseFacts, collectRequiredFactsFromData,
                              the hasContradictingRequired*Fact post-checks
    conversationIo.ts       ← buildConversationLoader, buildConversationSaver
  subgraphs/
    requestParsing.ts  clarification.ts  readOnlyAnswer.ts  transferPreparation.ts
  trace.ts                  ← withNodeTrace, appendDebugEvents, sanitize* helpers

server/src/ai/contracts.ts (or types/)  ← leaf module for the shared vocabulary
   (AssistantId, AssistantIntent, ResponseSituation, PhrasePack) → breaks the cycle
```

Each node module's interface is "a function from state (+ injected llm/tools) to a
state delta" — the same shape they already have; the change is *where they live*
and that their helpers travel with them.

## Benefits (locality + leverage + tests)

- **Locality.** A bug in counterparty resolution is now isolated to
  `nodes/resolveCounterparty.ts` with its helpers — not hunted across a 4k-line
  file. Knowledge of "the post-check rules" lives in `requiredFacts.ts`.
- **The interface is the test surface.** Each node becomes independently testable
  with a constructed state + stub llm, instead of only through a full graph run.
  Many existing `graph`-level tests can be re-pointed at the precise node.
- **AI-navigability.** An agent can open exactly the stage it needs (a few hundred
  lines) rather than the whole pipeline. File names map 1:1 to the architecture
  diagram's node names.
- **Breaks the type cycle** by giving the shared vocabulary a leaf home.

## Before / After

```
BEFORE
  ai/graph.ts  ████████████████████████████████  4,150 LOC, ~80 fns
               (intent, slots, draft, counterparty, amount, prepare,
                route, compose, post-checks, required-facts, io, subgraphs)
               + type-only cycle: assistants ⇄ responseStyle ⇄ state

AFTER
  ai/v1/graph.ts            ▓▓▓  assembly only
  ai/v1/nodes/*.ts          ▓▓ each: one stage + its helpers, independently testable
  ai/v1/subgraphs/*.ts      ▓▓
  ai/contracts.ts           ▓   shared vocabulary (leaf) — cycle broken
```

## Implementation outline (for the planning agent)

1. **Pin behaviour first.** Confirm the v1 graph tests + `aiSafety.test.ts` +
   conformance harness are green; they are the safety net for a pure move.
2. **Extract the leaf contracts module** (`AssistantId`, `AssistantIntent`,
   `ResponseSituation`, `PhrasePack`) and re-point `assistants.ts`,
   `responseStyle.ts`, `state.ts` at it; verify the cycle is gone
   (`graphify`/`madge` or a simple import audit).
3. **Move one stage at a time**, helpers included, re-export from `graph.ts` so
   imports elsewhere keep working; run tests after each move. Suggested order:
   `trace.ts` → `conversationIo.ts` → `requiredFacts.ts` → `composeResponse.ts`
   → the resolution nodes → the subgraphs → leave assembly in `graph.ts`.
4. **Relocate to `ai/v1/`** (or keep flat if the move is too noisy — the
   directory is a nicety, the split is the substance).
5. Re-point stage-specific tests at the new modules; keep a thin set of
   full-graph integration tests.

This is a **pure refactor**: no node behaviour, ordering, or output changes.
Reviewers should be able to verify it as moves, not logic edits.

## Risks / constraints

- **Strictly behaviour-preserving.** The risk is accidental logic change during a
  move; mitigate with per-step test runs and "move, don't edit" discipline.
- **Don't touch the contract** (`RunAssistantResult`, response blocks) — that's
  briefs 02/05.
- v2 lives in `ai/v2/` already and is **out of scope** here; this only reorganizes
  v1. (Reducing v1/v2 *duplication* is brief 04.)
- ADR-0008 keeps v1 alive — this refactor *helps* honour that ADR by making v1
  maintainable while it remains the conformance baseline.

## Definition of done

- `graph.ts` (or `ai/v1/graph.ts`) is assembly-only; no stage exceeds a few
  hundred LOC; each stage has a focused test.
- The `assistants ⇄ responseStyle ⇄ state` import cycle no longer appears in the
  dependency graph.
- All v1 graph tests, `aiSafety.test.ts`, and the conformance harness pass
  unchanged.
