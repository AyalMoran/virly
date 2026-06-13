# Messages-Based State Migration Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use `superpowers:subagent-driven-development` (recommended) or `superpowers:executing-plans` to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Replace the assistant's custom `ChatMessage[]` conversation-history representation with LangChain message objects (`HumanMessage` / `AIMessage` / `SystemMessage` / `ToolMessage`) as the canonical in-graph representation, while preserving every existing behavior, routing, safety boundary, and API contract.

**Architecture:** The assistant is a TypeScript LangGraph (`@langchain/langgraph@1.4.2`) `StateGraph` with one parent graph and seven compiled subgraphs that all share a single custom `Annotation.Root` state. History today is a custom `messages: ChatMessage[]` channel with **no reducer** (last-value), persisted to MongoDB via a custom `ConversationStore` (no LangGraph checkpointer). The migration swaps the **element type** from `ChatMessage` to `BaseMessage` first (de-risked, behavior-preserving), keeps structured business state authoritative, and only then optionally adopts `messagesStateReducer` semantics.

**Tech Stack:** TypeScript (ESM, NodeNext), `@langchain/langgraph@1.4.2`, `@langchain/core@1.1.48`, `@langchain/openai@1.4.7`, `zod@4.4.3`, Mongoose 8, Express 4, Node built-in test runner via `tsx`.

> **Legend.** Findings are tagged **[VERIFIED]** (confirmed by reading the repository at the cited path/line) or **[RECOMMENDATION]** (design proposal for the implementer). Line numbers reference the repository state at the time of writing (`git HEAD` `590c27a`); re-confirm before editing.

---

## 1. Executive Summary

**[VERIFIED]** The assistant already runs on LangGraph's `StateGraph`/`Annotation.Root` API ([server/src/ai/graph.ts:100-131](../server/src/ai/graph.ts)), but it models conversational history with a hand-rolled `ChatMessage` type (`{ role: "user" | "assistant"; content: string; createdAt?: Date }`, [server/src/ai/state.ts:203-209](../server/src/ai/state.ts)) instead of LangChain message objects. The `messages` channel is a plain `Annotation<ChatMessage[]>()` with default last-value semantics — there is **no message reducer**.

**Objective.** Make `BaseMessage[]` the canonical in-graph history while keeping all deterministic business state (intent, transfer draft, confirmation, tool results, counterparty memory, clarifications) in separate, structured channels. Messages must **never** become the source of truth for balances, transfers, authorization, or limits.

**Chosen API.** **[RECOMMENDATION]** Use a **custom `Annotation.Root` whose `messages` field holds `BaseMessage[]`**, migrating in two stages:

- **Stage A (Phases 2–7, required):** Keep the existing **last-value** channel semantics; only change the element type `ChatMessage → BaseMessage`. This reproduces today's exact control flow (loader *replaces* the array, saver *appends* one message) and **structurally cannot** produce duplicate messages.
- **Stage B (Phase 11, optional/idiomatic):** Adopt `messagesStateReducer` (`MessagesAnnotation`-style append+dedup-by-id) with delta-returning nodes and `RemoveMessage`-based trimming, *after* Stage A is proven in production.

`MessagesAnnotation` itself is available (`spec` keys = `["messages"]`, **[VERIFIED]** via runtime inspection) but cannot be used *directly* because the state needs ~25 additional business fields; it can only be **spread/extended** (`Annotation.Root({ ...MessagesAnnotation.spec, ...businessFields })`). Stage A deliberately does **not** spread it, to avoid silently inheriting the appending reducer before the lifecycle is reducer-aware (see §3 and §6).

**Persistence.** **[RECOMMENDATION]** Keep the MongoDB on-disk shape unchanged (`{ role, content, createdAt }`) and convert at the store boundary (`BaseMessage[] ↔ {role,content}[]`). This means **zero document migration**, full backward/forward read compatibility, and a trivial rollback.

**Blast radius (small and well-bounded).** **[VERIFIED]** Only the following files reference the message format: [state.ts](../server/src/ai/state.ts), [graph.ts](../server/src/ai/graph.ts), [llm.ts](../server/src/ai/llm.ts), [counterpartyMemory.ts](../server/src/ai/counterpartyMemory.ts), [router.ts](../server/src/ai/router.ts), [services/aiConversation.service.ts](../server/src/services/aiConversation.service.ts), [models/AiConversation.ts](../server/src/models/AiConversation.ts), [evals/support.ts](../server/src/ai/evals/support.ts), [evals/runner.ts](../server/src/ai/evals/runner.ts), [evals/seededMongo.ts](../server/src/ai/evals/seededMongo.ts), [tests/aiSafety.test.ts](../server/src/ai/tests/aiSafety.test.ts), [responseBlocks.test.ts](../server/src/ai/responseBlocks.test.ts). The HTTP API ([routes/ai.routes.ts](../server/src/routes/ai.routes.ts)) does **not** expose the message array, so the public contract is unaffected.

---

## 2. Current Architecture

### 2.1 Installed package versions **[VERIFIED]**

Resolved/hoisted from the workspace root ([package.json](../package.json) `workspaces: ["server","client"]`), confirmed via `require('<pkg>/package.json').version`:

| Package | Installed | Root `package.json` range | `server/package.json` range |
|---|---|---|---|
| `@langchain/langgraph` | **1.4.2** | `^1.4.2` | `^1.3.2` |
| `@langchain/core` | **1.1.48** | `^1.1.48` | `^1.1.47` |
| `@langchain/openai` | **1.4.7** | `^1.4.7` | `^1.4.6` |
| `@langchain/langgraph-checkpoint` | **1.1.1** | (transitive) | (transitive) |
| `@langchain/langgraph-sdk` | **1.9.22** | (transitive) | (transitive) |
| `zod` | **4.4.3** | `^4.4.3` | `^3.23.8` ⚠️ |

> ⚠️ **[VERIFIED] Version-drift hazard.** `server/package.json` still declares `zod ^3.23.8` and older LangChain ranges, but npm workspace hoisting resolves the **root** versions (`zod 4.4.3`, LangChain 1.4.x). [llm.ts](../server/src/ai/llm.ts) uses `withStructuredOutput(schema, { method: "jsonSchema" })` against these zod schemas, which works under zod 4. The migration should not rely on `server/package.json` ranges; treat the installed versions above as truth. Optionally (Phase 1) align `server/package.json` to the root ranges to remove the discrepancy.

### 2.2 Available message APIs in the installed versions **[VERIFIED]**

`@langchain/langgraph@1.4.2` exports: `MessagesAnnotation`, `MessagesValue`, `MessagesZodState`, `MessagesZodMeta`, `messagesStateReducer` (also exported as `addMessages`), `messagesDeltaReducer`, `REMOVE_ALL_MESSAGES`, `pushMessage`, `Annotation`, `StateGraph`, `START`, `END`, `Command`, `interrupt`, `getCurrentTaskInput`.

`@langchain/core/messages` exports: `BaseMessage`, `HumanMessage`, `AIMessage`, `SystemMessage`, `ToolMessage`, `RemoveMessage`, `trimMessages`, `filterMessages`, `mergeMessageRuns`, `coerceMessageLikeToMessage`, `mapChatMessagesToStoredMessages`, `mapStoredMessagesToChatMessages`, and type guards (`isHumanMessage`, `isAIMessage`, `isToolMessage`, `isSystemMessage`).

`@langchain/openai@1.4.7` exports: `ChatOpenAI` (currently used), `OpenAIEmbeddings` (available, **not currently used** — see §13.7 and the README at [node_modules/@langchain/openai/README.md](../node_modules/@langchain/openai/README.md) §"Embeddings").

### 2.3 Graph topology **[VERIFIED]** ([graph.ts](../server/src/ai/graph.ts))

State is a single custom `AssistantStateAnnotation = Annotation.Root({...})` (lines 100–131) shared by the parent graph and **all** subgraphs. The `messages` channel is `Annotation<AssistantGraphState["messages"]>()` (line 105) — i.e. `ChatMessage[]`, no reducer.

Parent graph (`buildAssistantGraph`, lines 3502–3573):

```
START → ensureDbConnection → loadAuthenticatedContext
  ├─(getAuthRoute: unauthenticated)→ responseSubgraph
  └─(authenticated)→ loadConversationContext
       ├─(getResumeRoute: clarification_reply)→ clarificationResumeSubgraph → requestParsingSubgraph
       └─(normal_turn)→ requestParsingSubgraph
            └─(getIntentRoute):
                 read_only        → readOnlyAnswerSubgraph
                 prepare_transfer → transferPreparationSubgraph
                 modify_pending   → pendingModificationSubgraph
                 pending_status   → pendingStatusSubgraph
                 unsafe_or_help   → responseSubgraph
                 unsupported      → responseSubgraph
  → responseSubgraph → saveConversation → END
```

Seven compiled subgraphs (added as nodes via `.addNode(name, compiledSubgraph)`), each built with `new StateGraph(AssistantStateAnnotation)`:

| Builder (graph.ts) | Nodes |
|---|---|
| `buildRequestParsingSubgraph` (3260) | normalizeUserMessage, classifyIntent, extractRequestSlots, extractTransferDraft |
| `buildClarificationSubgraph` (3310) | resolveClarificationReply |
| `buildReadOnlyAnswerSubgraph` (3330) | resolveCounterpartyReference, routeReadOnlyTools |
| `buildTransferPreparationSubgraph` (3359) | resolveCounterpartyReference, resolveContextualAmounts, prepareTransferConfirmation |
| `buildPendingModificationSubgraph` (3397) | resolveCounterpartyReference, resolveContextualAmounts, routeReadOnlyTools, modifyPendingTransferConfirmation |
| `buildPendingStatusSubgraph` (3444) | routeReadOnlyTools |
| `buildResponseSubgraph` (3464) | buildResponseBlocks, buildResponseStyle, composeResponse |

Entry points: `assistantGraph` (static export for LangGraph Studio, line 3599, `langgraph.json` → `./src/ai/graph.ts:assistantGraph`) and `runAssistantGraph(input, options)` (line 3606, used by the HTTP route, evals, and tests).

### 2.4 Execution & persistence model **[VERIFIED]**

- `runAssistantGraph` builds `initialState` and calls `graph.invoke(initialState)` with **no `config`** ([graph.ts:3625](../server/src/ai/graph.ts)). There is **no checkpointer, no `thread_id`, no `configurable`** anywhere in `server/src` (grep-confirmed). The `server/.langgraph_api/*.json` files are LangGraph **Studio** dev-server local state only, not production persistence.
- Production persistence is the custom `mongoConversationStore` ([services/aiConversation.service.ts](../server/src/services/aiConversation.service.ts)) wired in `loadConversationContext` and `saveConversation` nodes.
- Each turn is a **fresh `invoke`**: `initialState.messages = [{ role: "user", content: input.message }]` ([graph.ts:3618](../server/src/ai/graph.ts)); `loadConversationContext` then loads stored history and **replaces** `messages` with `trimConversationMessages([...stored, currentUser])` ([graph.ts:511-518](../server/src/ai/graph.ts)).

### 2.5 Message lifecycle today **[VERIFIED]**

1. **Seed:** `runAssistantGraph` → `initialState.messages = [{role:"user", content}]` (graph.ts:3618).
2. **Load/merge:** `loadConversationContext` (graph.ts:494-519) loads stored `messages`, appends `{role:"user", content: getUserMessage(state), createdAt}`, trims to 20, returns the **full** array (last-value replace).
3. **Read:** intermediate nodes read the latest user text via `getUserMessage(state)` (graph.ts:453-462, scans backward for last `role:"user"`), and pass `state.messages` to the LLM provider (`classifyIntent` node, graph.ts:545).
4. **Compose:** `composeResponse` (graph.ts:2901-3089) builds `safeConversationSummary.recentMessages = sanitizeMessagesForLlm(state.messages).slice(-6)` and produces `responseMessage` (a **string**, not appended to `state.messages`).
5. **Save:** `saveConversation` (graph.ts:3136-3252) appends `{role:"assistant", content: responseMessage}` to `state.messages`, trims to 20, and persists via `conversationStore.save`. It returns `{}` (does not mutate in-graph `state.messages`).

### 2.6 LLM integration today **[VERIFIED]** ([llm.ts](../server/src/ai/llm.ts))

`createConfiguredAssistantLlmProvider` returns four `ChatOpenAI(...).withStructuredOutput(zodSchema, {method:"jsonSchema"})` callables: `classifyIntent`, `extractTransferDraft`, `resolveCounterpartyReference`, `composeResponse` (lines 711-761). History is **serialized into the prompt text** as JSON via `sanitizeMessagesForLlm(input.messages).slice(-8).map(m => ({role, content}))` (lines 222-226, 568-572, 676-680). Each call sends `[["system", builtPrompt], ["human", input.userMessage]]` — the in-graph `messages` array is **never** passed to the model as LangChain message objects. `sanitizeMessagesForLlm` (lines 30-38) masks emails in `assistant` messages only.

### 2.7 Tool execution today **[VERIFIED]**

Tools are **deterministic, code-routed** — not model tool-calling. `routeReadOnlyTools` (`buildToolRouter`, graph.ts:1668-1807) executes `AssistantToolExecutors` selected by intent (`intentToReadOnlyTools`, [router.ts:15-65](../server/src/ai/router.ts)). Results are stored as `RuntimeToolResult[]` in `state.toolResults` (state.ts:853-855) and summarized into the compose prompt as `safeToolSummaries`. **There are no `AIMessage.tool_calls` and no `ToolMessage` anywhere** (grep-confirmed). Tool results are **not** part of `messages`.

### 2.8 Storage models **[VERIFIED]**

- [models/AiConversation.ts](../server/src/models/AiConversation.ts): `chatMessageSchema` = `{ role: enum["user","assistant"], content: String, createdAt: Date }` (lines 3-21), embedded as `messages: [chatMessageSchema]` (line 65). `memory` is a structured sub-doc; `expiresAt` TTL index (30 days). Unique index on `{userId, conversationId}`.
- [models/AiPendingTransfer.ts] and [models/AiAuditLog.ts]: **do not store chat messages** (grep for "message" returned nothing). `AiAuditLog` stores intent/tools/diagnostics; `AiPendingTransfer` stores transfer/confirmation data. These are unaffected by the message migration.

---

## 3. Problems with the Current Message Representation

1. **[VERIFIED] Non-standard type.** `ChatMessage` cannot represent tool calls, tool results, system context, message IDs, or `additional_kwargs`. It diverges from every LangChain/LangGraph helper (`trimMessages`, `filterMessages`, `mergeMessageRuns`, structured-output message threading, streaming token events).
2. **[VERIFIED] No reducer / fragile last-value channel.** `messages: Annotation<ChatMessage[]>()` (graph.ts:105) relies on every writer returning the *entire* array. Today only `loadConversationContext` writes it; any future node that returns a partial `messages` array would silently **truncate** history. There is no append/merge/dedup guarantee.
3. **[VERIFIED] Two parallel "summary" views.** `safeConversationSummary` (compose) and the per-call `sanitizeMessagesForLlm(...).slice(-8)` (classify/draft/resolver) re-derive role/content slices independently. A standard message type lets these share one projection.
4. **[VERIFIED] Count-only trimming.** `trimConversationMessages` is `slice(-20)` (counterpartyMemory.ts:117-119); `slice(-8)`/`slice(-6)` in prompts. There is no token-budget awareness, so a few long turns can overflow the model context. `@langchain/core`'s `trimMessages` (token-aware) is unused.
5. **[VERIFIED] Tooling/observability gap.** Because history is plain JSON in prompts, LangGraph Studio and LangSmith cannot render the conversation as messages, and message-level streaming (`streamMode: "messages"`) is impossible.
6. **[RECOMMENDATION] Duplicate-message trap latent in any naive `MessagesAnnotation` adoption.** Because each turn is a fresh `invoke` that **seeds** one `HumanMessage` *and* the loader **re-adds** the same user message, switching the channel to the appending `messagesStateReducer` *without* reworking the lifecycle would append the user turn twice (different auto-IDs ⇒ no dedup). This is the single most important migration hazard and is the reason Stage A keeps last-value semantics (§6, §16-R1).

---

## 4. Target Architecture

**[RECOMMENDATION]** Canonical in-graph history becomes `BaseMessage[]`:

- `HumanMessage` for user turns.
- `AIMessage` for assistant turns (final composed response; optionally tool-call carriers in Stage B).
- `SystemMessage` is **constructed at prompt-build time only** and **never persisted** into `state.messages` (preserves today's behavior, satisfies "no duplicate system messages"). The existing `assistantSystemPolicy` ([policy.ts](../server/src/ai/policy.ts)) stays a prompt prefix.
- `ToolMessage` is **not introduced in Stage A** (tools are deterministic; results stay in `state.toolResults`). A Stage-B/optional design for model-driven tools is in §9.

Structured business state stays in **separate channels**, authoritative and deterministic: `detectedIntent`, `requestSlots`, `userRequest`, `transferDraft`, `confirmation`, `supersededConfirmationId`, `requestedToolNames`, `executedToolNames`, `toolResults`, `clarificationRequest`, `refusalReason`, `responseBlocks`, `counterpartyMemory`, `debugTrace`, etc. **Messages are conversational record only.**

Channel semantics:

- **Stage A (required):** `messages: Annotation<BaseMessage[]>()` — last-value, identical control flow to today. Loader replaces; saver appends.
- **Stage B (optional):** `messages` gains `reducer: messagesStateReducer` and `default: () => []`; nodes return **deltas** (`[new AIMessage(...)]`); trimming uses `RemoveMessage`/`REMOVE_ALL_MESSAGES`; the loader emits the new user message as a delta with a **stable id** to prevent duplication.

Persistence: DB shape unchanged; adapter converts at the boundary (§10). No checkpointer is introduced (out of scope; the custom store remains authoritative).

---

## 5. Proposed State Schema

**[RECOMMENDATION]** Introduce `BaseMessage` as the message element and a shared conversion module. The state type changes in exactly one field.

### 5.1 `state.ts` changes

```ts
import type { BaseMessage } from "@langchain/core/messages";

// REMOVE the in-graph use of ChatMessage as the history element.
// KEEP `ChatRole`/`ChatMessage` ONLY as the persisted wire/DB shape (renamed for clarity).
export type StoredChatRole = "user" | "assistant";
export type StoredChatMessage = {            // DB + provider-projection shape only
  role: StoredChatRole;
  content: string;
  createdAt?: Date;
};

// AssistantGraphState.messages becomes BaseMessage[]:
export type AssistantGraphState = {
  // ...unchanged business fields...
  messages: BaseMessage[];                    // CHANGED from ChatMessage[]
  // ...unchanged business fields...
};
```

Provider input types that currently carry `ChatMessage[]` (`ClassifyAssistantIntentInput.messages` state.ts:496, `ResolveCounterpartyReferenceInput.messages` 677, `ExtractTransferDraftInput.messages` 685, `ComposeAssistantResponseInput` via `SafeConversationSummary`) — **[RECOMMENDATION]** keep them as a lightweight `{role, content}` projection (`StoredChatMessage`-like) produced by the adapter, so the provider/prompt layer is unchanged (zero LLM-prompt drift). `ConversationContext`/`ConversationSaveInput`/`ConversationStore` (state.ts:784-800) switch their `messages` to `BaseMessage[]` (the store boundary converts to/from DB shape).

### 5.2 Which fields stay separate from `messages`

All of these remain dedicated channels (unchanged): `userId`, `conversationId`, `requestId`, `assistantId`, `counterpartyMemory`, `currentTurn`, `detectedIntent`, `selectedAccountId`, `normalizedMessage`, `requestSlots`, `userRequest`, `resolvedCounterparty`, `transferDraft`, `confirmation`, `supersededConfirmationId`, `requestedToolNames`, `executedToolNames`, `toolResults`, `clarificationRequest`, `clarificationMessage`, `refusalReason`, `responseSituation`, `riskLevel`, `responseStyleContext`, `responsePersonalityLint`, `responseMessage`, `responseFormatVersion`, `responseBlocks`, `debugTrace`.

### 5.3 Fields that become redundant

- **None are removed in Stage A.** `responseMessage` (string) stays the authoritative response payload returned by the API and the value persisted as the assistant turn. **[RECOMMENDATION]** Do **not** delete `responseMessage`; the API result (`RunAssistantResult.message/responseMessage`, state.ts:910-924) depends on it and it is the single value `saveConversation` turns into an `AIMessage`.
- `ChatRole`/`ChatMessage` are *renamed* to `StoredChatRole`/`StoredChatMessage` (DB/projection shape), not deleted.

### 5.4 Annotation (graph.ts:100-131)

**Stage A:**
```ts
messages: Annotation<BaseMessage[]>(),   // last-value, type-only change
```
**Stage B (optional):**
```ts
import { messagesStateReducer } from "@langchain/langgraph";
messages: Annotation<BaseMessage[]>({
  reducer: messagesStateReducer,
  default: () => [],
}),
```

---

## 6. Message Lifecycle (Target)

**[RECOMMENDATION] Stage A (behavior-preserving):**

1. **Seed:** `initialState.messages = [new HumanMessage(input.message)]` (graph.ts:3618).
2. **Load/merge:** `loadConversationContext` loads stored history (already `BaseMessage[]` via the store adapter), appends a fresh `new HumanMessage(getUserMessageText(state))`, trims, returns the full array (last-value replace) — exactly as today.
3. **Read:** `getUserMessage` becomes `getUserMessageText` returning the content string of the last `HumanMessage` (`isHumanMessage(m)` / `m.getType() === "human"`). All current `getUserMessage(state)` call sites keep working unchanged (still return a string).
4. **Compose:** `composeResponse` unchanged except `safeConversationSummary` is derived from the adapter projection of `state.messages`.
5. **Save:** `saveConversation` appends `new AIMessage(responseMessage)` and persists via the store (adapter converts to DB shape).

**Why no duplicates (Stage A):** the channel is last-value; the loader returns the **whole** intended array, so the seeded message is *overwritten*, never appended. Structurally impossible to double-count.

**[RECOMMENDATION] Stage B (reducer-based, optional):**
- Do **not** seed a `HumanMessage` in `initialState` (seed `messages: []`).
- `loadConversationContext` returns prior history as a delta and the new `HumanMessage` with a **stable id** = `${conversationId}:${turn}:user` so re-entry/resume cannot duplicate it.
- Nodes that add to history return **deltas** (`{ messages: [new AIMessage(...)] }`).
- Trimming uses `RemoveMessage(id)` (or `REMOVE_ALL_MESSAGES` + re-add) inside a dedicated node, because `slice` no longer works against an append reducer.
- Resume/interrupt flows reuse the stable ids so the resumed turn does not re-add the user message.

---

## 7. Node-by-Node Impact Analysis

Legend: **Change** = code edit required; **None** = compiles/behaves unchanged after the type swap.

| Node (graph.ts) | Touches messages? | Impact |
|---|---|---|
| `ensureDbConnectionNode` (221) | no | None |
| `loadAuthenticatedContext` (469) | no | None |
| `getUserMessage` helper (453) | **yes** | **Change** → `getUserMessageText`: last `HumanMessage.content`. |
| `loadConversationContext` (494) | **yes** | **Change**: build `new HumanMessage(...)`; `trimConversationMessages(BaseMessage[])`. |
| `classifyIntent` (533) | **yes** (passes `state.messages` to provider) | **Change**: pass adapter projection (`toProviderMessages(state.messages)`); router signature stays `{role,content}[]`. |
| `extractRequestSlotsNode` (568) / `normalizeMessageNode` (590) | reads via `getUserMessage` | **Change** only by helper rename. |
| `resolveClarificationReply` (632) | reads `getUserMessage` | **Change** by helper rename. |
| `extractTransferDraft` (812) | passes `state.messages` to provider | **Change**: adapter projection. |
| `resolveCounterpartyReference` (1097) | passes `state.messages` to provider | **Change**: adapter projection. |
| `resolveContextualAmounts` (1362) | no (uses memory/draft) | None |
| `prepareTransferConfirmation` (1251) | no | None |
| `modifyPendingTransferConfirmation` (1490) | no | None |
| `routeReadOnlyTools` (1674) | no (uses `state` business fields) | None |
| `buildResponseBlocks` (2838) / `buildResponseStyle` (2852) | no | None |
| `composeResponse` (2901) | **yes** (`safeConversationSummary` from `state.messages`) | **Change**: derive summary from adapter projection (`.slice(-6)`). Everything else unchanged. |
| `saveConversation` (3136) | **yes** (appends assistant turn) | **Change**: append `new AIMessage(responseMessage)`; store adapter converts. |

Routing functions ([graphRoutes.ts](../server/src/ai/graphRoutes.ts)) read only structured state (`userId`, `counterpartyMemory.clarification`, `detectedIntent`, `refusalReason`) — **None**. `messageNormalization.ts` operates on strings — **None** (only the source helper rename matters). `router.ts` regex classification is string-based; only `classifyAssistantIntent`'s `messages` param type/projection is involved — **Change** (signature stays `{role,content}[]`, fallback line 412 builds `[{role:"user",content:message}]`).

---

## 8. Subgraph Integration

**[VERIFIED]** All seven subgraphs are built with `new StateGraph(AssistantStateAnnotation)` and share the identical state object; subgraphs are added as nodes (`.addNode(name, compiledSubgraph)`) so parent and child state are the **same schema** (no input/output mapping, no key remapping). **[RECOMMENDATION]** Because there is exactly one annotation, changing `messages` to `BaseMessage[]` in `AssistantStateAnnotation` propagates to every subgraph automatically — there is **no per-subgraph message-mapping work**. Subgraphs that never write `messages` (all except via shared helpers) keep returning their existing partial state. No subgraph returns a partial `messages` array today, so Stage A's last-value channel is safe across subgraph boundaries (a subgraph that omits `messages` leaves the parent value intact).

**Stage B caveat:** if/when the reducer is adopted, verify no subgraph emits a `messages` delta that would double-append across the parent↔subgraph boundary; with deltas, a subgraph appending an `AIMessage` is correct, but a subgraph returning the *full* array would now append the whole history. Audit `composeResponse`/`saveConversation` are the only writers.

---

## 9. Tool-Call Integration

**[VERIFIED] Current reality:** no LangChain tool-calling; tools are deterministic executors selected by intent; results live in `state.toolResults` and are summarized into prompts. There are no `AIMessage.tool_calls`/`ToolMessage`.

**[RECOMMENDATION] Stage A:** keep this exactly. The migration does **not** require `ToolMessage`. `toolResults` remains the **authoritative** record of what tools returned (correct per the "messages are not the source of truth for business data" constraint). Tool correlation today is via `RuntimeToolResult.toolName` + ordered `toolResults`, not message IDs.

**[RECOMMENDATION] Optional future (only if model-driven tools are desired):** represent a tool round-trip as:
- `AIMessage({ content: "", tool_calls: [{ id, name, args }] })`
- `ToolMessage({ tool_call_id: id, content: JSON.stringify(safeDisplayData) })`
correlated by `tool_call_id` (this is how `ChatOpenAI.bindTools` + a `ToolNode` thread results). Keep `toolResults` as the structured mirror used for `responseBlocks`/required-facts; never let the model's `ToolMessage` content become authoritative for balances/limits/confirmations. This is **out of scope** for the required migration and should be a separate initiative.

---

## 10. Persistence and Checkpoint Migration

**[VERIFIED]** No LangGraph checkpointer is used; persistence is `mongoConversationStore` ([services/aiConversation.service.ts](../server/src/services/aiConversation.service.ts)) over the `AiConversation` Mongoose model. Existing documents store `messages: [{role, content, createdAt}]`.

**[RECOMMENDATION] Keep the DB shape; convert at the boundary. Zero data migration.**

Add a conversion module `server/src/ai/messageMapping.ts`:

```ts
import { AIMessage, HumanMessage, type BaseMessage } from "@langchain/core/messages";
import type { StoredChatMessage } from "./state.js";

export function fromStored(stored: StoredChatMessage[]): BaseMessage[] {
  return stored.map((m) =>
    m.role === "assistant"
      ? new AIMessage({ content: m.content })
      : new HumanMessage({ content: m.content })
  );
}

export function toStored(messages: BaseMessage[]): StoredChatMessage[] {
  const out: StoredChatMessage[] = [];
  for (const m of messages) {
    const type = m.getType();
    if (type === "human") out.push({ role: "user", content: String(m.content) });
    else if (type === "ai") out.push({ role: "assistant", content: String(m.content) });
    // system/tool messages are NOT persisted (preserve current behavior)
  }
  return out;
}

// Lightweight projection for prompt builders (keeps LLM prompts byte-identical)
export function toProviderMessages(messages: BaseMessage[]): StoredChatMessage[] {
  return toStored(messages); // {role, content} only
}
```

- `mongoConversationStore.load` → `fromStored(conversation.messages)` then keep `trimConversationMessages` (now over `BaseMessage[]`).
- `mongoConversationStore.save` → persist `toStored(trimmedMessages)` (createdAt re-stamped as today in `normalizeMessages`).
- **Backward compatibility:** existing documents already match `StoredChatMessage`, so `fromStored` reads them directly. **Forward compatibility:** new writes stay `{role, content, createdAt}`, so a rollback to the pre-migration code reads them unchanged. **No dual-read flag, no backfill, no schema migration required.**

**[RECOMMENDATION] Optional richer format (only if persisting tool/system/IDs later):** switch the embedded schema to LangChain `StoredMessage` and use `mapChatMessagesToStoredMessages`/`mapStoredMessagesToChatMessages`, with a dual-read adapter that detects legacy `{role, content}` vs `{type, data}` shape. Not needed for this migration; documented for completeness.

**Checkpointer:** explicitly **out of scope**. If LangGraph-native persistence is ever adopted (`@langchain/langgraph-checkpoint` 1.1.1 is installed), it would supplement — not replace — the audit-grade `AiConversation` store; design that separately.

---

## 11. API and Frontend Compatibility

**[VERIFIED]** [routes/ai.routes.ts](../server/src/routes/ai.routes.ts): request body is `{ message, conversationId?, assistantId }` (zod `chatSchema` lines 20-24); response is `toChatResponse(result)` (lines 36-53) built from `RunAssistantResult` (`message`, `responseMessage`, `responseFormatVersion`, `responseBlocks?`, `conversationId`, `assistantId`, `intent`, `toolCalls`, `toolResults?`, `clarification?`, `confirmation?`, `supersededConfirmationId?`). **The message array is never serialized to the client.**

**[RECOMMENDATION]** Keep `RunAssistantResult` and `toChatResponse` byte-identical. Because the API consumes only `responseMessage` and structured fields — all of which are preserved — **the frontend requires no changes**. The confirmation endpoint (`POST /confirmations/:id`) and `respondToAiPendingTransfer` are message-independent and unchanged. Maintain `responseMessage` as the authoritative string (do not derive the API payload from the last `AIMessage` content, to avoid coupling the contract to message internals).

---

## 12. Streaming and LangGraph Studio Impact

**[VERIFIED]** `POST /chat/stream` is **status-phase SSE**, not token streaming: it emits `status` events from the `onProgress` callback (`getProgressPhaseForNode`, graph.ts:153-196) and one final `result` event (ai.routes.ts:131-199). No model tokens are streamed; `aiStreamPhases` (state.ts:877-887) are node-derived.

**[RECOMMENDATION]** Phases are keyed on **node names**, which do not change → streaming behavior is preserved with zero edits. The progress mapping does not read `messages`. (Optional future: with `BaseMessage` history and `ChatOpenAI.stream`, real token streaming via `streamMode: "messages"` becomes possible — out of scope.)

**LangGraph Studio:** the static `assistantGraph` export and `langgraph.json` are unchanged. **[RECOMMENDATION]** Studio "input" for the graph currently expects the raw state (incl. `messages`). After migration, Studio input must provide messages in LangChain form; provide a documented sample input (e.g. `{ "userId": "...", "conversationId": "studio-1", "assistantId": "oshri", "messages": [{ "type": "human", "content": "what's my balance?" }] }`). Verify the graph still loads in `langgraph dev` (Phase 9 validation).

---

## 13. Testing and Evaluation Strategy

All tests run with the Node built-in runner via `tsx`: **`npm test --workspace server`** (= `tsx --test "src/**/*.test.ts"`). Evals run via **`npx tsx server/src/ai/evals/cli.ts --mode <deterministic|llm-dev|seeded-mongo|llm-seeded-mongo>`**.

The plan must add/keep coverage for each item below. **[VERIFIED]** existing tests live in [tests/aiSafety.test.ts](../server/src/ai/tests/aiSafety.test.ts) (≈6,545 lines) and [responseBlocks.test.ts](../server/src/ai/responseBlocks.test.ts); both drive the graph only through `runAssistantGraph(input, options)` + a fake `ConversationStore`, never by constructing messages directly — so most tests are **format-agnostic** and keep passing after the type swap.

| Requirement | Where | Action |
|---|---|---|
| Single-turn & multi-turn | aiSafety.test.ts, evals/runner.ts loop (1111) | Keep; format-agnostic. Add multi-turn assertion that saved history alternates Human/AI and has no duplicate user turn. |
| Message ordering & reducer behavior | new `messageMapping.test.ts` (Stage A) / `messages_reducer.test.ts` (Stage B) | Add: `fromStored`/`toStored` round-trip; Stage B append/dedup-by-id. |
| Tool calls & `ToolMessage` correlation | n/a Stage A (deterministic tools) | Document N/A; add only if §9 optional path is taken. |
| Intent classification | aiSafety.test.ts, evals deterministic | Keep; router is string-based. |
| Read-only requests | aiSafety.test.ts | Keep. |
| Transfer prepare/modify/cancel/confirm | aiSafety.test.ts (line ~3761+), evals pending-confirmations fixture | Keep; assert `confirmation`/`supersededConfirmationId` unchanged. |
| Clarification & resume | aiSafety.test.ts, evals/support clarification | Keep; assert resumed turn doesn't duplicate the user message. |
| Authentication failures | aiSafety.test.ts (unauthenticated route) | Keep; `loadAuthenticatedContext` path. |
| Refusals & error handling | aiSafety.test.ts | Keep. |
| Parent↔subgraph transitions | implicit in end-to-end tests | Keep; add a state-shape assertion that `messages` are `BaseMessage` after `invoke`. |
| Checkpoint restoration | N/A (no checkpointer) | Document N/A; the equivalent is store load/save round-trip (covered). |
| Existing conversation compatibility | new test | Add: seed Mongo doc in legacy `{role,content}` shape → `load` yields correct `HumanMessage`/`AIMessage`. |
| Duplicate-message prevention | new test | Add: two sequential `runAssistantGraph` turns → saved messages contain each user turn exactly once. |
| Streaming output | (manual / route test) | Keep; phases unchanged. Optionally add an SSE phase-sequence test. |
| Serialization & DB persistence | aiConversation round-trip; trim test (3737-3759) | Update trim test to `BaseMessage[]` (still asserts length 20, `messages[0].content === "message-2"`). |
| Token-budget handling | new test (if Phase 10 done) | Add: `trimMessages` keeps within budget; else keep count-based test. |
| AI eval scripts & regression suites | evals/*.json fixtures | Keep all four fixture files; run all four modes pre/post. |

**[VERIFIED] specific test edits required:**
- `createFakeConversationStore` (aiSafety.test.ts:1072-1094) and `createInMemoryConversationStore` (support.ts:81-97): their `messages` type becomes `BaseMessage[]`; `trimConversationMessages` now trims `BaseMessage[]`.
- Trim test (aiSafety.test.ts:3737-3759): change the seed array to `BaseMessage[]` (alternating `HumanMessage`/`AIMessage`), keep `assert.equal(loaded.messages.length, 20)` and `assert.equal(String(loaded.messages[0].content), "message-2")`.
- Fake provider that inspects `input.messages.length` (aiSafety.test.ts:3207): provider still receives the `{role,content}[]` projection, so `input.messages.length` semantics are preserved.

---

## 14. Incremental Implementation Phases

> Each phase is independently committable, leaves the suite green, and has a rollback point. Use TDD: write/adjust the failing test, run it red, implement, run green, commit.

### Phase 0 — Baseline capture

- **Objective:** Record current green state and behavior to diff against.
- **Files likely to change:** none (read-only).
- **Exact conceptual changes:** run and snapshot the full suite + all eval modes.
- **Dependencies:** none.
- **Tests to add/update:** none.
- **Validation commands:**
  - [ ] `npm test --workspace server` → record pass count.
  - [ ] `npx tsx server/src/ai/evals/cli.ts --mode deterministic` → record summary JSON.
  - [ ] `npx tsc -p server/tsconfig.json --noEmit` → record clean typecheck.
- **Expected intermediate state:** baseline metrics captured.
- **Rollback point:** N/A (no changes).
- **Completion criteria:** suite green, eval `failedTurns: 0`, typecheck clean, numbers saved in the PR description.

### Phase 1 — Dependency alignment (optional but recommended)

- **Objective:** Remove version drift so installed = declared.
- **Files:** `server/package.json`.
- **Exact conceptual changes:** bump `@langchain/langgraph` → `^1.4.2`, `@langchain/core` → `^1.1.48`, `@langchain/openai` → `^1.4.7`, `zod` → `^4.4.3` to match the hoisted/root versions (§2.1). Do **not** run a major upgrade; only align to what is already installed.
- **Dependencies:** Phase 0.
- **Tests:** none new.
- **Validation commands:**
  - [ ] `npm install` (workspace) → no lockfile churn beyond the version strings.
  - [ ] `npm test --workspace server` → green.
- **Expected intermediate state:** declared ranges match installed.
- **Rollback point:** revert `server/package.json`.
- **Completion criteria:** suite green; `npm ls zod @langchain/langgraph` shows single resolved versions.

### Phase 2 — Introduce the message-mapping module (pure, additive)

- **Objective:** Add `BaseMessage ↔ StoredChatMessage` conversion with no wiring yet.
- **Files:** Create `server/src/ai/messageMapping.ts`; Create test `server/src/ai/messageMapping.test.ts`; Modify `server/src/ai/state.ts` (add `StoredChatRole`/`StoredChatMessage`; keep `ChatMessage` temporarily as an alias of `StoredChatMessage`).
- **Exact conceptual changes:** implement `fromStored`, `toStored`, `toProviderMessages` (§10). `toStored` drops system/tool messages.
- **Dependencies:** Phase 0.
- **Tests to add:**
  - [ ] **Step 1 (red):** `messageMapping.test.ts` — `toStored(fromStored([{role:"user",content:"a"},{role:"assistant",content:"b"}]))` deep-equals the input (ignoring `createdAt`); `getType()` of converted items is `human`/`ai`.
  - [ ] **Step 2:** run `npx tsx --test server/src/ai/messageMapping.test.ts` → fails (module missing).
  - [ ] **Step 3 (green):** implement `messageMapping.ts`.
  - [ ] **Step 4:** rerun → pass.
  - [ ] **Step 5:** commit `feat(ai): add BaseMessage<->stored mapping helpers`.
- **Validation commands:** `npx tsx --test server/src/ai/messageMapping.test.ts`; `npx tsc -p server/tsconfig.json --noEmit`.
- **Expected intermediate state:** helpers exist and are tested; nothing imports them yet; whole suite still green.
- **Rollback point:** delete the new files + the two new type aliases.
- **Completion criteria:** new test green; full suite green; typecheck clean.

### Phase 3 — Switch the persistence boundary to `BaseMessage`

- **Objective:** Make `ConversationStore` speak `BaseMessage[]` while the DB stays `{role,content}`.
- **Files:** Modify `server/src/ai/state.ts` (`ConversationContext.messages`, `ConversationSaveInput.messages`, `ConversationStore` → `BaseMessage[]`); Modify `server/src/services/aiConversation.service.ts` (use `fromStored`/`toStored`); Modify `server/src/ai/counterpartyMemory.ts` (`trimConversationMessages` generic over `BaseMessage[]`); Modify `server/src/ai/evals/support.ts` and `server/src/ai/tests/aiSafety.test.ts`/`responseBlocks.test.ts` fakes to the new store types.
- **Exact conceptual changes:**
  - `trimConversationMessages(messages: BaseMessage[]): BaseMessage[]` = `messages.slice(-MAX_CONVERSATION_MESSAGES)`.
  - `mongoConversationStore.load` returns `{ messages: trimConversationMessages(fromStored(doc.messages)), memory }`.
  - `mongoConversationStore.save` persists `toStored(trimConversationMessages(input.messages))` (re-stamp `createdAt`).
- **Dependencies:** Phase 2.
- **Tests to add/update:**
  - [ ] Add `aiConversation.service.test.ts` (if Mongo-in-memory available) **or** a pure store round-trip test: legacy `{role,content}` doc → `load` → `HumanMessage`/`AIMessage`; `save(BaseMessage[])` → `toStored` shape on disk.
  - [ ] Update the trim test (aiSafety.test.ts:3737-3759) to `BaseMessage[]` seed; keep length-20 and `messages[0].content === "message-2"` assertions.
- **Validation commands:** `npm test --workspace server`; `npx tsc -p server/tsconfig.json --noEmit`.
- **Expected intermediate state:** the graph still uses `ChatMessage` internally (alias), but the store boundary is `BaseMessage`. The graph nodes still construct `{role,content}` literals; these are assignable because `ChatMessage` is aliased — **temporary**. If the alias causes type friction, gate this phase behind Phase 4. (Recommended: do Phases 3+4 in one PR.)
- **Rollback point:** revert state/service/memory/test edits; helpers remain.
- **Completion criteria:** suite green; store round-trip test green; typecheck clean.

### Phase 4 — Convert in-graph nodes to `BaseMessage`

- **Objective:** Make `state.messages` truly `BaseMessage[]` end-to-end (Stage A, last-value).
- **Files:** Modify `server/src/ai/graph.ts` (`AssistantStateAnnotation.messages` type; `getUserMessage`→`getUserMessageText`; `loadConversationContext`; `classifyIntent`; `extractTransferDraft` node; `resolveCounterpartyReference` node; `composeResponse`; `saveConversation`; `runAssistantGraph` initialState); Modify `server/src/ai/state.ts` (`AssistantGraphState.messages: BaseMessage[]`; remove the temporary `ChatMessage` alias, keep `StoredChatMessage`); Modify `server/src/ai/llm.ts` (`sanitizeMessagesForLlm` accepts the projection; provider input `messages` type → `StoredChatMessage[]`); Modify `server/src/ai/router.ts` (`classifyAssistantIntent` `messages` param → `StoredChatMessage[]`, fallback literal unchanged).
- **Exact conceptual changes:**
  - `getUserMessageText(state)`: iterate `state.messages` backward, return `String(m.content)` for the first `m.getType()==="human"`, else `""`.
  - `loadConversationContext`: `messages: trimConversationMessages([...context.messages, new HumanMessage(getUserMessageText(state))])`.
  - Node call sites that previously passed `state.messages` to the provider now pass `toProviderMessages(state.messages)`.
  - `composeResponse`: `recentMessages: toProviderMessages(state.messages).slice(-6).map(...)` (identical JSON to today).
  - `saveConversation`: append `new AIMessage(state.responseMessage ?? "...")` to `state.messages` before `conversationStore.save`.
  - `runAssistantGraph`: `messages: [new HumanMessage(input.message)]`.
- **Dependencies:** Phases 2–3.
- **Tests to add/update:**
  - [ ] Add a node-level test: after `runAssistantGraph`, `conversationStore.saved.at(-1)` history ends with an `AIMessage` and the last `HumanMessage` equals the input (via the fake store, projecting through `toStored`).
  - [ ] Keep all existing aiSafety/responseBlocks tests green (they assert on `responseMessage`, `confirmation`, `memory` — unchanged).
- **Validation commands:** `npm test --workspace server`; `npx tsc -p server/tsconfig.json --noEmit`.
- **Expected intermediate state:** the entire graph uses `BaseMessage`; LLM prompts are byte-identical (verify by logging one classify prompt before/after — should match).
- **Rollback point:** single revert of the graph/state/llm/router commit (Phases 2–3 stay).
- **Completion criteria:** full suite green; typecheck clean; a manual `/chat` smoke test returns the same `responseMessage` shape.

### Phase 5 — Duplicate-prevention & multi-turn regression tests

- **Objective:** Lock in that the lifecycle never duplicates the user turn.
- **Files:** Modify `server/src/ai/tests/aiSafety.test.ts` (add tests); no production change.
- **Exact conceptual changes:** add two tests using the fake store:
  - two sequential `runAssistantGraph` turns on the same `conversationId` → the second saved history contains both user turns **once each** and alternates roles.
  - a clarification→resume sequence → the resumed turn does not re-append the prior user message.
- **Dependencies:** Phase 4.
- **Tests to add:**
  - [ ] **Step 1 (red-then-green):** write the two tests; run `npm test --workspace server`.
- **Validation commands:** `npm test --workspace server`.
- **Expected intermediate state:** explicit duplicate-prevention coverage.
- **Rollback point:** revert the test additions.
- **Completion criteria:** new tests green; suite green.

### Phase 6 — Eval parity run

- **Objective:** Prove no behavioral regression across fixtures.
- **Files:** `server/src/ai/evals/seededMongo.ts` (only if its `messages` literals need typing); fixtures unchanged.
- **Exact conceptual changes:** ensure `seededMongo.ts` `mongoConversationStore.save({ messages: context.messages })` passes `BaseMessage[]` (seed via `fromStored`).
- **Dependencies:** Phase 4.
- **Tests/validation:**
  - [ ] `npx tsx server/src/ai/evals/cli.ts --mode deterministic` → `failedTurns: 0` (matches Phase 0).
  - [ ] (If Mongo available) `npx tsx server/src/ai/evals/cli.ts --mode seeded-mongo` → `failedTurns: 0`.
  - [ ] (If `OPENAI_API_KEY` set) `--mode llm-dev` spot-check.
- **Expected intermediate state:** eval summaries equal to baseline.
- **Rollback point:** revert seededMongo edit.
- **Completion criteria:** deterministic (and seeded-mongo if available) eval matches Phase 0 counts.

### Phase 7 — Cleanup & docs

- **Objective:** Remove dead `ChatMessage` references; document the new shape.
- **Files:** `server/src/ai/state.ts` (delete any leftover `ChatMessage`/`ChatRole` if fully unused, or keep `StoredChatMessage` only); `docs/ai-current-implementation.md` (note the message representation); `server/langgraph.json` sample input note in `docs/` (Studio input shape, §12).
- **Dependencies:** Phases 4–6.
- **Tests:** none new.
- **Validation commands:** `npx tsc -p server/tsconfig.json --noEmit`; `grep -rn "ChatMessage" server/src` → only `StoredChatMessage` remains.
- **Expected intermediate state:** no stale type names.
- **Rollback point:** revert doc/type-cleanup commit.
- **Completion criteria:** grep clean; docs updated; suite green.

### Phase 8 — Studio / static-graph verification

- **Objective:** Confirm `assistantGraph` still loads in LangGraph Studio with message input.
- **Files:** none (verification) or a `docs/` sample input file.
- **Dependencies:** Phase 4.
- **Validation commands:**
  - [ ] `cd server && npx @langchain/langgraph-cli dev` (or the project's Studio launch) → graph compiles; invoke with the §12 sample input → returns a response.
- **Expected intermediate state:** Studio works with LangChain message input.
- **Rollback point:** N/A (verification).
- **Completion criteria:** Studio invoke succeeds; phases stream.

### Phase 9 — (Optional) Token-aware trimming via `trimMessages`

- **Objective:** Replace count-only trimming with token-budget trimming, behavior-compatible by default.
- **Files:** `server/src/ai/counterpartyMemory.ts` (or a new `messageBudget.ts`); `llm.ts` prompt slices.
- **Exact conceptual changes:** introduce `trimMessages({ maxTokens, strategy: "last", tokenCounter, includeSystem: false })` for the prompt-context selection; keep `MAX_CONVERSATION_MESSAGES` as a hard cap. Default budget chosen to encompass the current `slice(-8)`/`slice(-6)` so existing evals don't shift.
- **Dependencies:** Phases 4–6.
- **Tests:** add a token-budget test (long messages truncated to budget; short histories unchanged).
- **Validation commands:** `npm test --workspace server`; rerun deterministic eval (must stay `failedTurns: 0`).
- **Rollback point:** revert; fall back to `slice`.
- **Completion criteria:** budget test green; eval parity held.

### Phase 10 — (Optional) Embeddings-assisted context selection

- **Objective:** When history exceeds budget, select the most relevant prior turns (not just the most recent) for the compose/classify prompt.
- **Files:** new `server/src/ai/contextSelection.ts`; opt-in wiring in `composeResponse`.
- **Exact conceptual changes:** use `OpenAIEmbeddings` ([@langchain/openai README §Embeddings](../node_modules/@langchain/openai/README.md)) to embed the current user message + candidate older messages; keep top-k by cosine similarity **plus** always-keep last N; gate behind a config flag, default **off**. Must never affect safety/intent/structured state — selection feeds prompt context only.
- **Dependencies:** Phase 9.
- **Tests:** deterministic test with a stubbed embedder (no network) asserting selection order; flag-off path is a no-op equal to Phase 9.
- **Validation commands:** `npm test --workspace server`; eval parity with flag off.
- **Rollback point:** flag off / revert module.
- **Completion criteria:** stubbed-embedder test green; default-off path identical to Phase 9.

### Phase 11 — (Optional) Adopt `messagesStateReducer` (Stage B)

- **Objective:** Move to idiomatic append+dedup channel with delta-returning nodes.
- **Files:** `graph.ts` (annotation reducer + delta nodes + `RemoveMessage` trim node); `runAssistantGraph` (seed `messages: []`); `loadConversationContext` (stable-id user delta); tests.
- **Exact conceptual changes:** see §6 Stage B. Add `import { messagesStateReducer, REMOVE_ALL_MESSAGES } from "@langchain/langgraph"` and `RemoveMessage` from core; assign stable ids `${conversationId}:${turn}:user` / `:assistant`; trimming via a node returning `[new RemoveMessage(id), ...]`.
- **Dependencies:** Phases 4–8 in production and stable.
- **Tests:** reducer append/dedup-by-id; trim-by-RemoveMessage; full duplicate-prevention re-run; subgraph delta audit (§8 caveat).
- **Validation commands:** `npm test --workspace server`; all eval modes; Studio invoke.
- **Rollback point:** revert to Stage A annotation (last-value) — the rest of the system is unchanged.
- **Completion criteria:** reducer tests green; eval parity; no duplicate turns; Studio renders messages.

---

## 15. Rollback Strategy

- **Per-phase commits.** Each phase is one focused commit (or small PR). Reverting any phase restores the prior green state because phases are layered (helpers → store boundary → nodes → tests → optional enhancements).
- **No data migration to undo.** Because the DB shape is unchanged (§10), rolling back the code reads existing documents with zero compatibility work. New documents written during the migration window are plain `{role, content, createdAt}` and remain readable by the old code.
- **Fast kill-switch (Stage B only):** revert the annotation `reducer`/`default` back to last-value (`Annotation<BaseMessage[]>()`) to fall back to Stage A semantics without touching node logic.
- **Optional features are flag-gated** (Phases 10–11 default off), so disabling them is a config change, not a deploy.
- **Verification before declaring done:** after any rollback, re-run `npm test --workspace server` and `--mode deterministic` eval and confirm they match Phase 0 numbers.

---

## 16. Risks and Mitigations

- **R1 — Duplicate user message (highest risk).** Naive `MessagesAnnotation`/reducer adoption + the seed-then-load lifecycle double-appends the user turn. **Mitigation:** Stage A keeps last-value semantics (loader replaces the whole array). Stage B uses stable ids + seed-empty + delta loader. Phase 5 adds explicit duplicate-prevention tests. **[VERIFIED]** root cause: seed at graph.ts:3618 + re-add at graph.ts:511-515.
- **R2 — LLM prompt drift changing eval outcomes.** The provider serializes history into prompt JSON; any change to the projection could shift LLM classification. **Mitigation:** `toProviderMessages` reproduces the exact `{role, content}` slices; diff one classify/compose prompt before/after; Phase 6 eval parity gate.
- **R3 — Email masking regression.** `sanitizeMessagesForLlm` masks emails in *assistant* messages (llm.ts:34). **Mitigation:** apply masking on the `{role:"assistant"}` projection (after `toStored`), preserving identical output; covered by existing safety tests (masked-label-leak checks in graph.ts:2084-2162 and aiSafety tests).
- **R4 — `content` not a plain string.** `BaseMessage.content` can be a content-block array. **Mitigation:** the system only ever creates messages from strings; `toStored`/`getUserMessageText` use `String(m.content)`; add a guard test for non-string content returning a safe string.
- **R5 — Subgraph double-write under reducer (Stage B).** **Mitigation:** audit that only `composeResponse`/`saveConversation`(and the loader) write `messages`; subgraphs that don't write are unaffected; §8 caveat + Phase 11 subgraph delta audit.
- **R6 — Version/zod drift.** `server/package.json` understates installed versions. **Mitigation:** Phase 1 alignment; rely on installed versions; `withStructuredOutput({method:"jsonSchema"})` already validated under zod 4.
- **R7 — Studio input shape change.** Existing Studio inputs (`messages: [{role,content}]`) won't match LangChain message coercion. **Mitigation:** document `{type, content}` sample input (§12); Phase 8 verification.
- **R8 — Persisted trimming semantics.** `trimMessages` (Phase 9) could drop a message the deterministic flow expects. **Mitigation:** keep `MAX_CONVERSATION_MESSAGES` hard cap; default budget ≥ current slices; eval parity gate; feature is optional.
- **R9 — Messages mistaken for business truth.** **Mitigation:** explicit invariant — `toolResults`, `transferDraft`, `confirmation`, `counterpartyMemory` remain authoritative; system/tool messages are not persisted; reviewers enforce in Phase 4/11.

---

## 17. Definition of Done

- [ ] `state.messages`, `AssistantStateAnnotation.messages`, and `ConversationStore` are `BaseMessage[]`; user turns are `HumanMessage`, assistant turns are `AIMessage`; no `SystemMessage`/`ToolMessage` persisted (Stage A).
- [ ] `getUserMessageText`, `loadConversationContext`, `composeResponse`, `saveConversation`, and `runAssistantGraph` operate on `BaseMessage` (§7).
- [ ] LLM prompts are byte-identical to pre-migration (verified by a before/after prompt diff); all four LLM call sites use `toProviderMessages`.
- [ ] MongoDB documents are unchanged on disk (`{role, content, createdAt}`); legacy documents load correctly; **no backfill performed**.
- [ ] HTTP `/chat` and `/chat/stream` request/response payloads are unchanged; frontend untouched; SSE phases unchanged.
- [ ] `npm test --workspace server` green, including: new mapping test, store round-trip + legacy-compat test, duplicate-prevention multi-turn test, updated trim test.
- [ ] `--mode deterministic` (and `seeded-mongo` where available) evals report `failedTurns: 0`, matching Phase 0.
- [ ] `npx tsc -p server/tsconfig.json --noEmit` clean; `grep -rn "ChatMessage" server/src` shows only `StoredChatMessage`.
- [ ] `assistantGraph` loads and runs in LangGraph Studio with documented message input (§12).
- [ ] Structured business state (intent, draft, confirmation, tool results, memory) remains authoritative; documented invariant present in code review.
- [ ] (If Stage B done) reducer append/dedup + `RemoveMessage` trimming covered by tests; no duplicate turns; subgraph delta audit complete.

---

## 18. File-by-File Change Inventory

| File | Type | Change | Phase |
|---|---|---|---|
| [server/package.json](../server/package.json) | Modify | Align LangChain/zod ranges to installed (optional) | 1 |
| [server/src/ai/messageMapping.ts](../server/src/ai/messageMapping.ts) | **Create** | `fromStored`/`toStored`/`toProviderMessages` | 2 |
| `server/src/ai/messageMapping.test.ts` | **Create** | Round-trip + getType tests | 2 |
| [server/src/ai/state.ts](../server/src/ai/state.ts) | Modify | `StoredChatMessage`; `AssistantGraphState.messages: BaseMessage[]`; provider input + `ConversationContext/SaveInput/Store` message types | 2–4 |
| [server/src/services/aiConversation.service.ts](../server/src/services/aiConversation.service.ts) | Modify | `load`/`save` use `fromStored`/`toStored`; trim over `BaseMessage[]` | 3 |
| [server/src/ai/counterpartyMemory.ts](../server/src/ai/counterpartyMemory.ts) | Modify | `trimConversationMessages(messages: BaseMessage[])` | 3 |
| [server/src/ai/graph.ts](../server/src/ai/graph.ts) | Modify | annotation type; `getUserMessageText`; `loadConversationContext`; `classifyIntent`/`extractTransferDraft`/`resolveCounterpartyReference` node provider projections; `composeResponse` summary; `saveConversation` append `AIMessage`; `runAssistantGraph` seed `HumanMessage` | 4 |
| [server/src/ai/llm.ts](../server/src/ai/llm.ts) | Modify | `sanitizeMessagesForLlm` over projection; provider input `messages: StoredChatMessage[]` | 4 |
| [server/src/ai/router.ts](../server/src/ai/router.ts) | Modify | `classifyAssistantIntent` `messages` param type (projection); fallback literal unchanged | 4 |
| [server/src/models/AiConversation.ts](../server/src/models/AiConversation.ts) | **No change** | DB shape unchanged (`{role,content,createdAt}`) | — |
| [server/src/routes/ai.routes.ts](../server/src/routes/ai.routes.ts) | **No change** | API contract unaffected | — |
| [server/src/ai/graphRoutes.ts](../server/src/ai/graphRoutes.ts) | **No change** | Reads structured state only | — |
| [server/src/ai/messageNormalization.ts](../server/src/ai/messageNormalization.ts) | **No change** | String-based | — |
| [server/src/ai/evals/support.ts](../server/src/ai/evals/support.ts) | Modify | in-memory store `messages: BaseMessage[]`; seed via `fromStored` | 3/6 |
| [server/src/ai/evals/seededMongo.ts](../server/src/ai/evals/seededMongo.ts) | Modify | seed `messages` as `BaseMessage[]` | 6 |
| [server/src/ai/evals/runner.ts](../server/src/ai/evals/runner.ts) | **No change** (verify) | Drives via `runAssistantGraph` string input | 6 |
| [server/src/ai/tests/aiSafety.test.ts](../server/src/ai/tests/aiSafety.test.ts) | Modify | fake store types; trim test seed; add duplicate-prevention + multi-turn tests | 3–5 |
| [server/src/ai/responseBlocks.test.ts](../server/src/ai/responseBlocks.test.ts) | Modify (verify) | store/seed types if it constructs `messages` | 3–4 |
| `server/src/ai/messageBudget.ts` (+test) | **Create** (optional) | `trimMessages` token budget | 9 |
| `server/src/ai/contextSelection.ts` (+test) | **Create** (optional) | `OpenAIEmbeddings` selection, flag-gated | 10 |
| [docs/ai-current-implementation.md](./ai-current-implementation.md) | Modify | document message representation + Studio input | 7 |

---

### Appendix A — Key verified anchors (re-confirm before editing)

- State type: `AssistantGraphState` — [state.ts:802-833](../server/src/ai/state.ts); `ChatMessage` — [state.ts:203-209](../server/src/ai/state.ts).
- Annotation: [graph.ts:100-131](../server/src/ai/graph.ts) (`messages` at 105).
- Lifecycle: seed [graph.ts:3618](../server/src/ai/graph.ts); loader [graph.ts:494-519](../server/src/ai/graph.ts); `getUserMessage` [graph.ts:453-462](../server/src/ai/graph.ts); compose summary [graph.ts:2906-2913](../server/src/ai/graph.ts); save append [graph.ts:3240-3249](../server/src/ai/graph.ts).
- Provider/prompt slices: [llm.ts:30-38, 222-226, 568-572, 676-680, 711-761](../server/src/ai/llm.ts).
- Trim: [counterpartyMemory.ts:11, 117-119](../server/src/ai/counterpartyMemory.ts).
- Store: [services/aiConversation.service.ts](../server/src/services/aiConversation.service.ts); model [models/AiConversation.ts:3-21, 65](../server/src/models/AiConversation.ts).
- API: [routes/ai.routes.ts:20-53, 102-199](../server/src/routes/ai.routes.ts).
- Tests/evals: fake store [aiSafety.test.ts:1072-1094](../server/src/ai/tests/aiSafety.test.ts); trim test [aiSafety.test.ts:3737-3759](../server/src/ai/tests/aiSafety.test.ts); eval loop [evals/runner.ts:1111-1127](../server/src/ai/evals/runner.ts); eval modes [evals/cli.ts](../server/src/ai/evals/cli.ts).
