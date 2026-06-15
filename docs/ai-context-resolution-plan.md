# Continuous-Context Resolution Plan (Transfer Intent Frame + LLM Context Resolver)

> **For agentic workers:** REQUIRED SUB-SKILL: use `superpowers:executing-plans` (or `subagent-driven-development`) to implement this plan phase-by-phase. TDD, one commit per phase, each leaving the suite green. Steps use checkbox (`- [ ]`) syntax.

**Goal:** Make the assistant hold continuous conversational context across multi-turn transfer dialogues, so references like "double it", "send *this* to deni", "the same amount sga sent me", and "the amount we discussed" resolve correctly instead of dropping the recipient/amount. Achieved by (1) a **persistent transfer-intent frame** that accumulates slots across turns, (2) **compositional amount expressions** (arithmetic + discourse references), and (3) one **LLM context-resolver node** that does coreference/intent while **all money values stay deterministic**.

**Architecture today:** TypeScript LangGraph (`@langchain/langgraph@1.4.2`) `StateGraph` with a parent graph + seven subgraphs over one `Annotation.Root` state ([server/src/ai/graph.ts](../server/src/ai/graph.ts)). Conversation history is `BaseMessage[]` (post the messages migration — see [docs/messages-migration-plan.md](./messages-migration-plan.md)). Tools are deterministic, code-routed; business state (`transferDraft`, `confirmation`, `counterpartyMemory.pendingConfirmation`, `toolResults`) is authoritative. The custom `mongoConversationStore` persists `counterpartyMemory` per `userId`+`conversationId`.

**Guiding principle:** **the LLM decides *what the user means* (coreference, arithmetic, discourse); deterministic code decides *what is true and allowed* (recipient existence, amount value, confirmation).** The model emits *references and expressions*, never authoritative emails or money values.

---

## 1. Root Cause (why the scenario fails)

**[VERIFIED]** Each turn rebuilds a fresh `transferDraft` from the latest message + memory ([graph.ts:701 `applySlotDataToDraft`](../server/src/ai/graph.ts), [graph.ts:1436](../server/src/ai/graph.ts)); contextual amounts resolve only through a **closed regex vocabulary** ([amountResolution.ts:16 `classifyAmountReference`](../server/src/ai/amountResolution.ts)) over a **fixed source enum** ([state.ts:485-497 `ResolvedAmountRef.source`](../server/src/ai/state.ts)); `resolveContextualAmounts` only fires when `transferDraft.amountReferenceText` is set and `amount` is null ([graph.ts:1364](../server/src/ai/graph.ts)).

Five failure modes:

| ID | Failure | Evidence |
|---|---|---|
| **F1** | No persistent slot frame — a slot set last turn evaporates this turn | draft rebuilt per turn ([graph.ts:1436](../server/src/ai/graph.ts)) |
| **F2** | An email inside an *amount* clause ("same amount sga@… sent me") hijacks the **recipient** slot | deterministic extraction takes the only explicit email as `recipientEmail` ([graph.ts:746](../server/src/ai/graph.ts)) |
| **F3** | No arithmetic ("×2/half") and no discourse refs ("the amount we discussed") | `classifyAmountReference` returns `unknown` ([amountResolution.ts:16-54](../server/src/ai/amountResolution.ts)) |
| **F4** | The active pending card isn't a context source for "this"/"double it" | `last_pending_transfer` only matches "same amount/אותו סכום" ([amountResolution.ts:45-52](../server/src/ai/amountResolution.ts)) |
| **F5** | On resolution failure, the clarification drops *all* slots ("whom and how much?") | both slots read empty because the frame isn't persisted ([graph.ts:1299-1300](../server/src/ai/graph.ts)) |

**[VERIFIED] Most of the target schema already exists, under-wired:** `AiUserRequest` already declares `counterpartyRef.kind: "current_pending_recipient"` and `amountRef.kind: "same_as_pending_transfer"` ([state.ts:413-466](../server/src/ai/state.ts)) but is populated by **deterministic regex** (`buildAiUserRequest`, [messageNormalization.ts:314](../server/src/ai/messageNormalization.ts)); `ClarificationRequest` already has `resumeDraft` + `safeResumeStateVersion` ([state.ts:624-639](../server/src/ai/state.ts)); `CounterpartyMemory.mode` already has `transfer_draft_in_progress` ([state.ts:641-648](../server/src/ai/state.ts)). We elevate the meaning layer to an LLM, add arithmetic, and persist the frame.

---

## 2. Target Design

### 2.1 Persistent transfer-intent frame (fixes F1)

Add one structure, persisted **inside the already-persisted `counterpartyMemory`** (additive — see §2.5):

```ts
type TransferIntentFrame = {
  status: "idle" | "building" | "pending_confirmation";
  recipient?: { ref?: RecipientRef; email?: string; displayName?: string; resolvedAtTurn?: number };
  amount?:    { expr?: AmountExpr; value?: number; currency: CurrencyCode; resolvedAtTurn?: number };
  reason?: string;
  lastUpdatedTurn: number;
};
```

**Invariant:** each turn applies a *delta*; **unset slots are inherited** from the prior frame. When a card is active the frame mirrors `pendingConfirmation` (recipient + amount), so "this"/"double it" read from it (fixes F4).

### 2.2 Compositional amount expressions (fixes F3)

```ts
type AmountSource = "literal" | "pending_amount" | "discussed_amount"
                  | "last_received_from" | "last_sent_to" | "answer_total";
type AmountExpr = { base: AmountSource; op?: "mul" | "div" | "add" | "sub"; operand?: number };
```

A deterministic `evaluateAmountExpr(baseValue, expr)` resolves `base` via the existing `resolveAmountReference`, **then does the math in code**. "כפול שתיים" → `{base:"pending_amount", op:"mul", operand:2}`; "את הסכום שדיברנו עליו" → `{base:"discussed_amount"}`.

### 2.3 LLM context-resolver node `resolveTurnContext` (fixes F2 + fluency)

New 5th method on `AssistantLlmProvider` ([state.ts:782](../server/src/ai/state.ts)). Sits at the front of `requestParsingSubgraph`, with the deterministic `buildAiUserRequest` retained as **fallback** (same LLM-with-deterministic-fallback pattern as `classifyIntent`/`extractTransferDraft`).

- **Input:** recent `BaseMessage[]` history + a structured context block: current `TransferIntentFrame`, active `pendingConfirmation` (recipient+amount), `lastCounterparty`, masked `mentionedCounterparties`, recent `answerFrames` (salient amounts), `mode`.
- **Output (zod `TurnDelta`):**
  ```ts
  {
    action: "new_transfer"|"change_recipient"|"modify_amount"|"set_reason"|"read_only"|"confirm"|"cancel"|"other";
    recipientRef?: { kind: "explicit_email"|"pronoun"|"name"|"ordinal"|"current_pending_recipient"|"last_counterparty";
                     email?: string; query?: string; ordinal?: number };
    amountRef?:    { kind: "literal"|"reference"; expr?: AmountExpr; value?: number };
    reason?: string;
    confidence: "low"|"medium"|"high";
  }
  ```
- **Hard contract (safety):** outputs references/expressions **only — never an invented email or money value**. The **F2 rule** is stated in the prompt: *"An email inside a phrase describing an AMOUNT (e.g. 'the same amount X@… sent me') is the amount's counterparty, NOT the recipient. Keep the current recipient unless the user explicitly redirects."* The `recipientRef` vs `amountRef` split makes this structurally expressible.

### 2.4 Truth layer (deterministic — unchanged authority)

1. `applyTurnDelta(frame, delta)` → new frame (inherit unset slots).
2. Recipient resolved by existing `resolveReferenceAgainstMemory` ([counterpartyMemory.ts:320](../server/src/ai/counterpartyMemory.ts)) + the existing Virly-user existence check.
3. Amount resolved by extended `resolveAmountReference` (honors `pending_amount`/`discussed_amount`, then applies `AmountExpr`).
4. Validation unchanged: recipient exists, amount > 0, currency supported. Confirmation REST boundary untouched.

### 2.5 Persistence (additive, low-risk)

`TransferIntentFrame` rides in `counterpartyMemory`, already saved by `mongoConversationStore`. Requires an **additive** field in the memory sub-doc ([models/AiConversation.ts:69-111](../server/src/models/AiConversation.ts), a `Schema.Types.Mixed` field) and in `normalizeCounterpartyMemory`'s whitelist ([counterpartyMemory.ts:97-115](../server/src/ai/counterpartyMemory.ts)). No backfill: absent field ⇒ `status:"idle"` empty frame. (Unlike the messages migration, an additive schema field is in-scope here.)

### 2.6 Repair loop (fixes F5)

On resolution failure, build a structured error `{ slot, reason, knownSlots }`:
- If the other slot is known in the frame → clarify only the missing one (reuse `buildClarificationRequest` + `resumeDraft`).
- *Optional* single LLM repair pass: feed `{error, frame}` back to `resolveTurnContext` for one corrected delta before clarifying.

---

## 3. Safety Invariants (must hold every phase)

- The LLM **never** emits an authoritative amount or recipient email; it emits references/expressions evaluated by deterministic code.
- All money arithmetic is deterministic (`evaluateAmountExpr`).
- Tools stay deterministic/code-routed; **no `bindTools`, no model-driven tool execution**.
- The transfer-confirmation REST boundary ([routes/ai.routes.ts](../server/src/routes/ai.routes.ts), `POST /confirmations/:id`) is untouched; the model never confirms/executes a transfer.
- HTTP `/chat` + `/chat/stream` request/response payloads, `RunAssistantResult`, and `toChatResponse` are unchanged.
- Email masking on assistant turns is preserved.
- Deterministic evals use the deterministic fallback path (no live LLM) so the parity gate stays measurable.

---

## 4. Incremental Phases

> Each phase: write the failing test (red), implement (green), run validations, one commit. Reverting any phase restores a working state. Baseline comparisons are against Phase 0.

### Phase 0 — Baseline capture
- **Objective:** record green state + encode the failing dialogue as the regression target.
- **Validation:**
  - [ ] `npx tsx --test "server/src/ai/**/*.test.ts"` → record AI pass count.
  - [ ] `npx tsx server/src/ai/evals/cli.ts --mode deterministic` → record `failedTurns` (baseline).
  - [ ] `npx tsc -p server/tsconfig.json --noEmit` → clean.
  - [ ] Add `server/src/ai/contextResolution.scenario.test.ts` encoding the exact failing dialogue (recipient `sga@thunder.com`/`62.41`, recipient `deni@trailblazers.com`) with the **target** assertions, marked `{ skip: true }` (or `test.todo`). It documents the goal; un-skip incrementally.
- **Commit:** `test(ai): add failing multi-turn context scenario (skipped baseline)`

### Phase 1 — `AmountExpr` type + deterministic evaluator (additive)
- **Files:** `server/src/ai/state.ts` (types), new `server/src/ai/amountExpr.ts` + `amountExpr.test.ts`.
- **Changes:** add `AmountSource`/`AmountExpr`; `evaluateAmountExpr(baseValue: number, expr: AmountExpr): number` (mul/div/add/sub, guards div-by-zero, rounds to 2dp, rejects ≤0).
- **Tests (red→green):** `evaluateAmountExpr(62.41, {base, op:"mul", operand:2}) === 124.82`; half → `31.21` (rounding rule documented); add/sub; invalid operand → throws/`null`.
- **Validation:** `npx tsx --test server/src/ai/amountExpr.test.ts`; `tsc`.
- **Commit:** `feat(ai): add AmountExpr type and deterministic evaluator`

### Phase 2 — Wire pending/discussed sources + arithmetic into amount resolution (M1; fixes F3, F4)
- **Files:** `server/src/ai/amountResolution.ts` (recognizer + `resolveAmountReference`), `server/src/ai/state.ts` (`ResolvedAmountRef.source` += `pending_confirmation`, `discussed_amount`), `server/src/ai/graph.ts` (`resolveContextualAmounts` applies expr; seed draft amount from active card).
- **Changes:** add `parseAmountExpression(rawText): AmountExpr | null` recognizing "double/half/×N/כפול/חצי/פי N", "this/זה", "the amount we discussed/הסכום שדיברנו עליו"; resolve `pending_amount` from `counterpartyMemory.pendingConfirmation`, `discussed_amount` from the salient `answerFrames`/frame amount; apply `evaluateAmountExpr`.
- **Tests:** "double the pending" → 124.82 to the pending recipient; "half" → 31.21; "the amount we discussed" → salient amount; existing amount tests unchanged.
- **Validation:** AI subset green; `--mode deterministic` `failedTurns` ≤ baseline; `tsc`. Un-skip the scenario turns that are now green ("double it", "this").
- **Commit:** `feat(ai): resolve pending/discussed/arithmetic contextual amounts`

### Phase 3 — Persist `TransferIntentFrame` + slot inheritance (M2; fixes F1)
- **Files:** `state.ts` (`TransferIntentFrame`, add to `CounterpartyMemory`), `counterpartyMemory.ts` (`normalizeCounterpartyMemory` whitelist + a `createEmptyTransferIntentFrame`), `models/AiConversation.ts` (additive `Mixed` memory field), `graph.ts` (build/carry the frame each turn; seed `applySlotDataToDraft` from the frame).
- **Tests:** legacy memory without the field loads as idle frame; set recipient turn 1 + amount turn 2 → frame holds both; "change recipient" keeps amount; round-trip through `mongoConversationStore` (pure-conversion test, no live Mongo).
- **Validation:** AI subset green; eval parity; `tsc`.
- **Commit:** `feat(ai): persist transfer-intent frame with cross-turn slot inheritance`

### Phase 4 — Slot-aware clarification + structured repair (M2; fixes F5)
- **Files:** `graph.ts` (`buildClarificationRequest` call sites for transfer prepare/modify; resolution-failure path reads the frame's known slots).
- **Tests:** "double it" with a known recipient → "I have Shai — how much?" (not "whom and how much?"); missing recipient with known amount → asks only recipient.
- **Validation:** AI subset green; eval parity.
- **Commit:** `feat(ai): slot-aware clarification preserving known frame slots`

### Phase 5 — `resolveTurnContext` LLM node + `TurnDelta` (M3; fixes F2 + fluency)
- **Files:** `state.ts` (`TurnDelta`, add `resolveTurnContext` to `AssistantLlmProvider`), `llm.ts` (`buildTurnContextPrompt` with the F2 rule + zod schema + `withStructuredOutput`), `graph.ts` (new node at front of `requestParsingSubgraph` + `applyTurnDelta` reducer; deterministic `buildAiUserRequest` kept as fallback), test fakes.
- **Tests (fake provider):** "same amount sga@… sent me" while recipient is deni → recipient stays **deni**, amount = 62.41 (F2); the full `contextResolution.scenario.test.ts` un-skipped and **green**; provider-failure path falls back to deterministic extraction.
- **Validation:** AI subset green; `--mode deterministic` `failedTurns` ≤ baseline (deterministic mode uses the fallback, no LLM); `tsc`. Add the dialogue as a fake-provider eval fixture.
- **Commit:** `feat(ai): add LLM turn-context resolver with deterministic fallback`

### Phase 6 — Optional repair pass + scenario eval parity
- **Files:** `graph.ts` (single repair invocation on validation failure), `evals/` fixture for the dialogue.
- **Tests:** mis-assigned recipient self-corrects in one repair pass; eval fixture passes in `--mode deterministic` (fake/seeded) and, if `OPENAI_API_KEY` present, `--mode llm-dev` spot-check.
- **Commit:** `feat(ai): one-shot repair pass before clarification`

### Phase 7 — Docs & cleanup
- **Files:** `docs/ai-current-implementation.md` (document the frame + resolver + meaning/truth split).
- **Commit:** `docs(ai): document continuous-context resolution`

---

## 5. Testing Strategy

- All graph tests drive `runAssistantGraph(input, options)` with fakes — format-agnostic, mostly unaffected.
- New: `amountExpr.test.ts`, the multi-turn frame tests, the F2 recipient-vs-amount test, and `contextResolution.scenario.test.ts` (the exact failing dialogue, all turns asserting the right recipient + amount).
- Eval parity: `--mode deterministic` `failedTurns` must not exceed the Phase 0 baseline at any phase (deterministic mode never invokes the live LLM resolver — it uses the deterministic fallback).
- `aiSafety.test.ts` must stay fully green every phase.

## 6. Risks & Mitigations
- **+1 LLM call/turn (latency/cost):** gate the resolver to transfer-ish turns; keep a deterministic fast-path for unambiguous literals.
- **Eval/prompt instability:** strict zod + deterministic fallback + the fake-provider test pattern; deterministic evals never hit the live model.
- **Over-trust of the model:** the truth layer validates regardless of the delta; the "never invent values" contract is backstopped by deterministic resolution.
- **Schema persistence:** the memory field is additive + tolerant of absence (idle frame) — no backfill.

## 7. Definition of Done
- [ ] The exact failing dialogue resolves correctly end-to-end: "double it" → 124.82 to sga; "send this to deni" → 62.41 to deni; "same amount sga sent me" (for deni) → recipient stays deni, amount 62.41; "the amount we discussed" → 62.41.
- [ ] `TransferIntentFrame` persists across turns; unset slots inherit; F1–F5 each covered by a test.
- [ ] `resolveTurnContext` emits only references/expressions; every money value is produced by deterministic code; `evaluateAmountExpr` owns all arithmetic.
- [ ] `bindTools`/model-driven tool execution NOT introduced; confirmation REST boundary, `RunAssistantResult`, `toChatResponse`, `/chat[/stream]` unchanged.
- [ ] `npx tsx --test "server/src/ai/**/*.test.ts"` green; `npx tsc -p server/tsconfig.json --noEmit` clean.
- [ ] `--mode deterministic` `failedTurns` ≤ Phase 0 baseline.
- [ ] Memory schema change is additive only; no backfill script.

## 8. File Inventory
| File | Change | Phase |
|---|---|---|
| `server/src/ai/amountExpr.ts` (+test) | **Create** — `AmountExpr` evaluator | 1 |
| `server/src/ai/state.ts` | Modify — `AmountExpr`, `TransferIntentFrame`, `TurnDelta`, `AssistantLlmProvider.resolveTurnContext`, `ResolvedAmountRef.source` | 1–5 |
| `server/src/ai/amountResolution.ts` | Modify — `parseAmountExpression`, pending/discussed sources, arithmetic | 2 |
| `server/src/ai/counterpartyMemory.ts` | Modify — frame normalize/whitelist + empty-frame factory | 3 |
| `server/src/models/AiConversation.ts` | Modify — **additive** memory field (Mixed) | 3 |
| `server/src/ai/graph.ts` | Modify — frame build/carry, draft seeding, `resolveContextualAmounts`, slot-aware clarification, `resolveTurnContext` node + `applyTurnDelta`, repair | 2–6 |
| `server/src/ai/llm.ts` | Modify — `buildTurnContextPrompt` + provider method | 5 |
| `server/src/ai/contextResolution.scenario.test.ts` | **Create** — the failing dialogue | 0,2,5 |
| `server/src/ai/evals/*` | Modify — dialogue fixture | 6 |
| `docs/ai-current-implementation.md` | Modify — document the design | 7 |
| `routes/ai.routes.ts`, `graphRoutes.ts` | **No change** | — |
