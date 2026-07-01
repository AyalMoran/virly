# Unify AI Memory Paths + Modern Summarizer Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Collapse virly's two parallel v2 AI graphs into a single resumable, checkpointer-backed graph whose context budget is managed by a langmem-style token-budgeted summarization node.

**Architecture:** Today the resumable graph ([server/src/ai/v2/hitl.ts](../../../server/src/ai/v2/hitl.ts)) is the production path (durable checkpointer + transfer interrupt/resume) but has *no* context compression, while the non-resumable graph ([server/src/ai/v2/graph.ts](../../../server/src/ai/v2/graph.ts)) — used only by evals — owns a message-count rolling summary stored in the BaseStore. We make the resumable graph the *single* graph for both production and evals, add an in-graph `summarize` node that folds older messages into a `runningSummary` kept in **checkpointed thread state** (never in the canonical `messages` channel), repoint `runAssistant` and the eval harness at it, and delete `graph.ts` plus the obsolete BaseStore-summary code. End state is the three-layer target: (1) DB-backed checkpointer for durable short-term/thread state, (2) BaseStore for cross-session long-term memory (counterparties), (3) a token-budgeted summarization *view* for the prompt.

**Tech Stack:** TypeScript (ESM, `.js` import suffixes), `@langchain/langgraph` ^1.3 (JS), `@langchain/langgraph-checkpoint-mongodb` / `-postgres`, `@langchain/openai`, `node:test` + `node:assert/strict` run via `tsx`.

## Global Constraints

- **Language/runtime:** TypeScript ESM. Every relative import MUST use the `.js` suffix (e.g. `import { x } from "./tokens.js"`). Match the surrounding file style exactly.
- **No new runtime dependencies.** `langmem` is Python-only — there is no JS package. The summarization view is a hand-rolled port of the langmem pattern (token-budgeted, incremental running summary, output kept off the canonical message channel).
- **No emojis** anywhere — code, comments, commit messages, docs (project rule, [.claude/CLAUDE.md](../../../.claude/CLAUDE.md)).
- **Tests are co-located** in `__tests__/` dirs next to the code, using `node:test` (`import { describe, test } from "node:test"`) and `node:assert/strict` — match the existing files exactly (see [server/src/ai/v2/memory/__tests__/summary.test.ts](../../../server/src/ai/v2/memory/__tests__/summary.test.ts)).
- **Run a single unit test file:** `npx tsx --tsconfig server/tsconfig.json --test "<path>"` (these are `node:test` files; jest does NOT run them).
- **Typecheck the whole server:** `npx tsc -p server/tsconfig.json --noEmit`.
- **Summary stays OFF the `messages` channel.** Never delete from or rewrite `messages`; compression is expressed only via the `runningSummary` string + a `summaryCoveredCount` pointer, both new state channels persisted by the checkpointer.
- **Commits:** Conventional Commits (`feat:`, `refactor:`, `test:`, `chore:`). The branch MUST start with a valid prefix (`refactor/`, `feat/`, …) — this worktree's branch is `unify-ai-memory-paths`; rename it before the first push: `git branch -m refactor/unify-ai-memory-paths`.
- **Env for live tests:** the v2 conformance/eval suites are double-gated — they need `VIRLY_AI_V2_EVAL=1` (opt-in flag) AND `OPENAI_API_KEY` + `VIRLY_AI_MODEL`, and run with `VIRLY_AI_GRAPH_VERSION=v2` (already the default, [server/src/config.ts:243](../../../server/src/config.ts#L243)). These are read from `config.ai` at import time, so set them on the command line / in `server/.env`, never via in-test `process.env` mutation. Without the flag/key they SKIP — report "skipped", never "passed".

---

## File Structure

**New files:**
- `server/src/ai/v2/memory/tokens.ts` — dependency-free approximate token counter (`approximateTokens`, `countMessageTokens`, `messageTokens`).
- `server/src/ai/v2/memory/__tests__/tokens.test.ts` — counter tests.
- `server/src/ai/v2/nodes/summarize.ts` — `buildSummarizationNode(model, opts)`: the langmem-style in-graph node. Exports `SUMMARY_TRIGGER_TOKENS`, `SUMMARY_RECENT_TOKENS`, `recentBoundaryIndex`.
- `server/src/ai/v2/nodes/__tests__/summarize.test.ts` — node behavior tests.
- `server/src/ai/v2/nodes/__tests__/agent.test.ts` — verifies the agent consumes the compressed view + state summary.

**Modified files:**
- `server/src/ai/v2/state.ts` — add `runningSummary` + `summaryCoveredCount` channels.
- `server/src/ai/v2/agent.ts` — send `messages.slice(summaryCoveredCount)` and read `runningSummary` from **state**, not config.
- `server/src/ai/v2/toolContext.ts` — remove the now-unused `runningSummary` field from `V2Configurable`.
- `server/src/ai/v2/hitl.ts` — insert `summarize` into the graph (`prepare → summarize → agent`, `tools → summarize → agent`); persist long-term counterparties after the turn.
- `server/src/ai/runAssistant.ts` — v2 dispatch → `invokeV2Resumable` (was `runAssistantGraphV2`).
- `server/src/ai/v2/memory/loop.ts` — delete `readConversationSummary`, `saveConversationSummary`, `SUMMARY_KEY` (summary no longer lives in the BaseStore). Keep the counterparty + store-resolution functions.

**Deleted files:**
- `server/src/ai/v2/graph.ts` (`runAssistantGraphV2`, `assistantGraphV2`).
- `server/src/ai/v2/memory/summary.ts` (`foldRollingSummary`, `trimToWindow`, message-count constants) — replaced by `tokens.ts` + `nodes/summarize.ts`.
- `server/src/ai/v2/memory/__tests__/summary.test.ts` — replaced by the new tests.

---

## Task 1: Token counter utility

A dependency-free, deterministic approximate token counter (the langmem pattern uses `count_tokens_approximately`; we port it). Pure function, fully unit-testable with no model.

**Files:**
- Create: `server/src/ai/v2/memory/tokens.ts`
- Test: `server/src/ai/v2/memory/__tests__/tokens.test.ts`

**Interfaces:**
- Produces:
  - `approximateTokens(text: string): number`
  - `messageTokens(message: BaseMessage): number`
  - `countMessageTokens(messages: BaseMessage[]): number`

- [ ] **Step 1: Write the failing test**

Create `server/src/ai/v2/memory/__tests__/tokens.test.ts`:

```ts
import assert from "node:assert/strict";
import { describe, test } from "node:test";

import { AIMessage, HumanMessage } from "@langchain/core/messages";

import {
  approximateTokens,
  countMessageTokens,
  messageTokens
} from "../tokens.js";

describe("v2 token counter", () => {
  test("approximateTokens is ~1 token per 4 chars, rounded up", () => {
    assert.equal(approximateTokens(""), 0);
    assert.equal(approximateTokens("abcd"), 1);
    assert.equal(approximateTokens("abcde"), 2);
  });

  test("messageTokens adds per-message overhead to content tokens", () => {
    // 8 content chars -> 2 content tokens, + 4 overhead = 6
    assert.equal(messageTokens(new HumanMessage("12345678")), 6);
  });

  test("countMessageTokens sums across the thread", () => {
    const messages = [new HumanMessage("12345678"), new AIMessage("12345678")];
    assert.equal(countMessageTokens(messages), 12);
  });

  test("handles array (multi-part) message content without throwing", () => {
    const message = new HumanMessage({
      content: [{ type: "text", text: "abcd" }]
    });
    // 4 chars -> 1 content token + 4 overhead = 5
    assert.equal(messageTokens(message), 5);
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npx tsx --tsconfig server/tsconfig.json --test "server/src/ai/v2/memory/__tests__/tokens.test.ts"`
Expected: FAIL — cannot find module `../tokens.js`.

- [ ] **Step 3: Write minimal implementation**

Create `server/src/ai/v2/memory/tokens.ts`:

```ts
/**
 * Approximate, dependency-free token counting for the summarization view.
 *
 * A langmem-style summarizer needs a token budget, not a message count. We avoid
 * pulling a tokenizer dependency (js-tiktoken) by approximating ~4 chars/token —
 * deterministic, fast, and good enough to bound the context window. Swap in an
 * exact counter later behind the same signatures if precision is ever needed.
 */
import type { BaseMessage } from "@langchain/core/messages";

/** ~4 characters per token (OpenAI-ish English heuristic), rounded up. */
export function approximateTokens(text: string): number {
  if (!text) {
    return 0;
  }
  return Math.ceil(text.length / 4);
}

/** Flatten string-or-parts message content to plain text. */
function plainText(message: BaseMessage): string {
  const { content } = message;
  if (typeof content === "string") {
    return content;
  }
  return content
    .map((part) =>
      typeof part === "string"
        ? part
        : "text" in part && typeof part.text === "string"
          ? part.text
          : ""
    )
    .join("");
}

/** Content tokens plus a small fixed per-message overhead (role/formatting). */
export function messageTokens(message: BaseMessage): number {
  return 4 + approximateTokens(plainText(message));
}

export function countMessageTokens(messages: BaseMessage[]): number {
  return messages.reduce((sum, message) => sum + messageTokens(message), 0);
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `npx tsx --tsconfig server/tsconfig.json --test "server/src/ai/v2/memory/__tests__/tokens.test.ts"`
Expected: PASS (4 tests).

- [ ] **Step 5: Commit**

```bash
git add server/src/ai/v2/memory/tokens.ts server/src/ai/v2/memory/__tests__/tokens.test.ts
git commit -m "feat(ai): add approximate token counter for summarization view"
```

---

## Task 2: Add summary state channels

The running summary lives in checkpointed thread state, not the BaseStore. Add two channels: `runningSummary` (the cumulative summary text) and `summaryCoveredCount` (how many leading `messages` are already folded into it — the langmem "last summarized" pointer). Both use last-write-wins (plain `Annotation`), unlike `messages` which appends.

**Files:**
- Modify: `server/src/ai/v2/state.ts:12-33`

**Interfaces:**
- Produces: `V2AgentState` gains `runningSummary?: string` and `summaryCoveredCount: number` (default `0`); `V2AgentStateType` reflects both.

- [ ] **Step 1: Write the failing test**

Create `server/src/ai/v2/__tests__/state.test.ts`:

```ts
import assert from "node:assert/strict";
import { describe, test } from "node:test";

import { HumanMessage } from "@langchain/core/messages";

import { V2AgentState } from "../state.js";

describe("v2 state summary channels", () => {
  // Note: assert channel PRESENCE on `.spec` (stable), not `.default()` (the
  // Annotation channel internals are version-specific). The default value (0) is
  // exercised behaviorally by the summarize/agent tests via `?? 0`.
  test("runningSummary and summaryCoveredCount channels exist on the root", () => {
    assert.ok(V2AgentState.spec.runningSummary, "runningSummary channel missing");
    assert.ok(
      V2AgentState.spec.summaryCoveredCount,
      "summaryCoveredCount channel missing"
    );
    // messages channel still present (appending reducer untouched)
    assert.ok(V2AgentState.spec.messages, "messages channel missing");
    void new HumanMessage("smoke");
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npx tsx --tsconfig server/tsconfig.json --test "server/src/ai/v2/__tests__/state.test.ts"`
Expected: FAIL — `V2AgentState.spec.summaryCoveredCount` is undefined.

- [ ] **Step 3: Write minimal implementation**

In `server/src/ai/v2/state.ts`, add the two channels inside `Annotation.Root({ ... })` (after the existing `supersededConfirmationId` channel, before the Phase 5 block):

```ts
  /** The id of a card this turn's modification superseded. */
  supersededConfirmationId: Annotation<string | undefined>(),

  // --- Phase 6: summarization view (token-budgeted; kept OFF `messages`) ---
  /** Cumulative summary of messages older than the live window (langmem-style). */
  runningSummary: Annotation<string | undefined>(),
  /** How many leading `messages` are already folded into `runningSummary`. */
  summaryCoveredCount: Annotation<number>({
    reducer: (_prev, next) => next,
    default: () => 0
  }),

  // --- Phase 5: human-in-the-loop transfer execution (resumable graph only) ---
```

- [ ] **Step 4: Run test to verify it passes**

Run: `npx tsx --tsconfig server/tsconfig.json --test "server/src/ai/v2/__tests__/state.test.ts"`
Expected: PASS (2 tests).

- [ ] **Step 5: Commit**

```bash
git add server/src/ai/v2/state.ts server/src/ai/v2/__tests__/state.test.ts
git commit -m "feat(ai): add runningSummary + summaryCoveredCount state channels"
```

---

## Task 3: Summarization node (langmem-style, token-budgeted, incremental)

The core new behavior. A node that, when the thread exceeds a token trigger, folds the messages between `summaryCoveredCount` and a recent-window boundary into `runningSummary`, then advances `summaryCoveredCount`. It is **incremental** (never re-summarizes already-folded messages), **boundary-safe** (the recent window starts on a `HumanMessage`, so it never splits an assistant/tool-call group — fixing OpenAI's "tool reply must follow its call" constraint), and **degrades** to a no-op on a summarizer failure.

**Files:**
- Create: `server/src/ai/v2/nodes/summarize.ts`
- Test: `server/src/ai/v2/nodes/__tests__/summarize.test.ts`

**Interfaces:**
- Consumes: `countMessageTokens`, `messageTokens`, `approximateTokens` from `../../memory/tokens.js` (Task 1); `messageText` from `./finalize.js`; `isAiMessage` from `../messages.js`; `V2AgentStateType` from `../state.js`.
- Produces:
  - `SUMMARY_TRIGGER_TOKENS: number` (3000), `SUMMARY_RECENT_TOKENS: number` (1500)
  - `recentBoundaryIndex(messages: BaseMessage[], recentTokens: number): number`
  - `buildSummarizationNode(model: ChatOpenAI, opts?: { triggerTokens?: number; recentTokens?: number }): (state: V2AgentStateType) => Promise<Partial<V2AgentStateType>>`

- [ ] **Step 1: Write the failing test**

Create `server/src/ai/v2/nodes/__tests__/summarize.test.ts`:

```ts
import assert from "node:assert/strict";
import { describe, test } from "node:test";

import { AIMessage, HumanMessage, ToolMessage } from "@langchain/core/messages";
import type { BaseMessage } from "@langchain/core/messages";
import type { ChatOpenAI } from "@langchain/openai";

import { buildSummarizationNode, recentBoundaryIndex } from "../summarize.js";
import type { V2AgentStateType } from "../../state.js";

let summarizerCalls = 0;
const stubModel = {
  invoke: async () => {
    summarizerCalls += 1;
    return new AIMessage("Earlier: user discussed Dan and Rani totals.");
  }
} as unknown as ChatOpenAI;

const throwingModel = {
  invoke: async () => {
    throw new Error("summarizer down");
  }
} as unknown as ChatOpenAI;

/** A long thread of alternating turns; each user turn is a clean boundary. */
function turns(n: number, pad = ""): BaseMessage[] {
  const messages: BaseMessage[] = [];
  for (let i = 0; i < n; i += 1) {
    messages.push(new HumanMessage(`user message ${i} ${pad}`));
    messages.push(new AIMessage(`assistant message ${i} ${pad}`));
  }
  return messages;
}

function state(messages: BaseMessage[], over: Partial<V2AgentStateType> = {}) {
  return { messages, summaryCoveredCount: 0, ...over } as V2AgentStateType;
}

describe("v2 summarization node", () => {
  test("under the token trigger: returns no state update", async () => {
    summarizerCalls = 0;
    const node = buildSummarizationNode(stubModel, { triggerTokens: 100000 });
    const out = await node(state(turns(3)));
    assert.deepEqual(out, {});
    assert.equal(summarizerCalls, 0);
  });

  test("over trigger: folds older messages and advances the covered pointer", async () => {
    summarizerCalls = 0;
    const node = buildSummarizationNode(stubModel, {
      triggerTokens: 50,
      recentTokens: 40
    });
    const messages = turns(20, "x".repeat(40));
    const out = await node(state(messages));
    assert.equal(summarizerCalls, 1);
    assert.match(out.runningSummary ?? "", /Dan and Rani/);
    assert.ok(
      (out.summaryCoveredCount ?? 0) > 0,
      "expected covered pointer to advance"
    );
    assert.ok(
      (out.summaryCoveredCount ?? 0) < messages.length,
      "must keep a recent window"
    );
  });

  test("recent window boundary lands on a HumanMessage (no split tool group)", async () => {
    const messages = turns(20, "x".repeat(40));
    const boundary = recentBoundaryIndex(messages, 40);
    assert.ok(messages[boundary] instanceof HumanMessage, "boundary not human-aligned");
  });

  test("a tool reply is never orphaned at the window start", () => {
    const messages: BaseMessage[] = [
      ...turns(10, "y".repeat(40)),
      new HumanMessage("send 50 to dan"),
      new AIMessage({ content: "", tool_calls: [{ name: "prepareTransfer", args: {}, id: "t1" }] }),
      new ToolMessage({ content: "prepared", tool_call_id: "t1" }),
      new AIMessage("Prepared a transfer for your confirmation.")
    ];
    const boundary = recentBoundaryIndex(messages, 40);
    assert.ok(messages[boundary] instanceof HumanMessage);
  });

  test("incremental: nothing new to fold returns no update", async () => {
    summarizerCalls = 0;
    const node = buildSummarizationNode(stubModel, {
      triggerTokens: 50,
      recentTokens: 40
    });
    const messages = turns(20, "x".repeat(40));
    const boundary = recentBoundaryIndex(messages, 40);
    // Pretend everything up to the boundary is already summarized.
    const out = await node(state(messages, { summaryCoveredCount: boundary }));
    assert.deepEqual(out, {});
    assert.equal(summarizerCalls, 0);
  });

  test("summarizer failure degrades to a no-op (covered pointer unchanged)", async () => {
    const node = buildSummarizationNode(throwingModel, {
      triggerTokens: 50,
      recentTokens: 40
    });
    const out = await node(state(turns(20, "x".repeat(40))));
    assert.deepEqual(out, {});
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npx tsx --tsconfig server/tsconfig.json --test "server/src/ai/v2/nodes/__tests__/summarize.test.ts"`
Expected: FAIL — cannot find module `../summarize.js`.

- [ ] **Step 3: Write minimal implementation**

Create `server/src/ai/v2/nodes/summarize.ts`:

```ts
/**
 * `summarize` — the token-budgeted context view (design §6.2, langmem-style).
 *
 * Runs before every agent call (entry and after each tool hop). When the thread
 * exceeds `triggerTokens`, it folds the messages between `summaryCoveredCount`
 * and the recent-window boundary into `runningSummary`, then advances the pointer.
 *
 * Three invariants that make this safe and modern:
 *  - OFF-CHANNEL: it never mutates `messages`; compression is expressed only via
 *    `runningSummary` (a string, surfaced in the system prompt) and
 *    `summaryCoveredCount` (a pointer the agent slices on). The checkpointer keeps
 *    the full thread intact.
 *  - INCREMENTAL: it only summarizes messages newer than the existing pointer, so
 *    already-folded turns are never re-summarized (langmem `summarized_message_ids`).
 *  - BOUNDARY-SAFE: the recent window starts on a HumanMessage, so an assistant
 *    tool-call and its ToolMessage replies are never split (OpenAI rejects orphans).
 */
import { HumanMessage } from "@langchain/core/messages";
import type { BaseMessage } from "@langchain/core/messages";
import type { LangGraphRunnableConfig } from "@langchain/langgraph";
import type { ChatOpenAI } from "@langchain/openai";

import { countMessageTokens, messageTokens } from "../memory/tokens.js";
import { isAiMessage } from "../messages.js";
import { messageText } from "./finalize.js";
import type { V2AgentStateType } from "../state.js";

/** Above this many thread tokens, a turn folds older messages into the summary. */
export const SUMMARY_TRIGGER_TOKENS = 3000;
/** Token budget for the verbatim recent window kept in the prompt. */
export const SUMMARY_RECENT_TOKENS = 1500;

function roleOf(message: BaseMessage): string {
  if (message instanceof HumanMessage) return "User";
  if (isAiMessage(message)) return "Assistant";
  return "Note";
}

/**
 * Index where the recent (verbatim) window starts: walk back from the end until
 * the running token total exceeds `recentTokens`, then snap to the nearest
 * HumanMessage at or before that point so tool groups stay intact.
 */
export function recentBoundaryIndex(
  messages: BaseMessage[],
  recentTokens: number
): number {
  if (messages.length === 0) {
    return 0;
  }
  let tokens = 0;
  let start = messages.length - 1;
  for (let i = messages.length - 1; i >= 0; i -= 1) {
    tokens += messageTokens(messages[i]);
    start = i;
    if (tokens > recentTokens) {
      break;
    }
  }
  let snapped = start;
  while (snapped > 0 && !(messages[snapped] instanceof HumanMessage)) {
    snapped -= 1;
  }
  return snapped;
}

export function buildSummarizationNode(
  model: ChatOpenAI,
  opts: { triggerTokens?: number; recentTokens?: number } = {}
) {
  const triggerTokens = opts.triggerTokens ?? SUMMARY_TRIGGER_TOKENS;
  const recentTokens = opts.recentTokens ?? SUMMARY_RECENT_TOKENS;

  return async function summarize(
    state: V2AgentStateType,
    _config: LangGraphRunnableConfig
  ): Promise<Partial<V2AgentStateType>> {
    const messages = state.messages ?? [];
    if (countMessageTokens(messages) <= triggerTokens) {
      return {};
    }

    const covered = state.summaryCoveredCount ?? 0;
    const boundary = recentBoundaryIndex(messages, recentTokens);
    if (boundary <= covered) {
      // Nothing new to fold (already summarized up to the window) or no safe
      // boundary exists yet — leave the view as the full slice from `covered`.
      return {};
    }

    const toFold = messages.slice(covered, boundary);
    const transcript = toFold
      .map((message) => `${roleOf(message)}: ${messageText(message)}`)
      .join("\n");
    const previousSummary = state.runningSummary;

    try {
      const result = await model.invoke([
        [
          "system",
          "Summarize this banking-assistant conversation so far in 2-4 sentences: " +
            "who the user has been transferring to / asking about, key amounts and " +
            "totals mentioned, any open thread or stated preference. Be factual and terse."
        ],
        [
          "human",
          `${previousSummary ? `Earlier summary:\n${previousSummary}\n\n` : ""}Conversation:\n${transcript}`
        ]
      ]);
      const summary = messageText(result).trim();
      if (!summary) {
        return {};
      }
      return { runningSummary: summary, summaryCoveredCount: boundary };
    } catch {
      // Degrade: leave the pointer and summary untouched so a later hop/turn
      // retries. The agent still sends the (un-folded) slice from `covered`.
      return {};
    }
  };
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `npx tsx --tsconfig server/tsconfig.json --test "server/src/ai/v2/nodes/__tests__/summarize.test.ts"`
Expected: PASS (6 tests).

- [ ] **Step 5: Commit**

```bash
git add server/src/ai/v2/nodes/summarize.ts server/src/ai/v2/nodes/__tests__/summarize.test.ts
git commit -m "feat(ai): add token-budgeted summarization node (langmem-style)"
```

---

## Task 4: Agent consumes the compressed view from state

The agent currently sends the full `state.messages` and reads `runningSummary` from `config.configurable`. Switch it to send `messages.slice(summaryCoveredCount)` (the boundary-safe window the summarize node maintains) and read `runningSummary` from **state**.

**Files:**
- Modify: `server/src/ai/v2/agent.ts:18-43`
- Test: `server/src/ai/v2/nodes/__tests__/agent.test.ts`

**Interfaces:**
- Consumes: `state.summaryCoveredCount`, `state.runningSummary` (Task 2); `buildSystemPrompt` (`./prompt.js`); `getConfigurable` (`./toolContext.js`).
- Produces: unchanged — `buildAgentNode(model)` returns a node that appends one `AIMessage` to `messages`.

- [ ] **Step 1: Write the failing test**

Create `server/src/ai/v2/nodes/__tests__/agent.test.ts`:

```ts
import assert from "node:assert/strict";
import { describe, test } from "node:test";

import { AIMessage, HumanMessage, SystemMessage } from "@langchain/core/messages";
import type { BaseMessage } from "@langchain/core/messages";
import type { ChatOpenAI } from "@langchain/openai";

import { buildAgentNode } from "../../agent.js";
import { DEFAULT_ASSISTANT_ID } from "../../../assistants.js";
import type { V2AgentStateType } from "../../state.js";

let captured: BaseMessage[] = [];
const stubModel = {
  bindTools: () => ({
    invoke: async (messages: BaseMessage[]) => {
      captured = messages;
      return new AIMessage("ok");
    }
  })
} as unknown as ChatOpenAI;

const baseConfig = {
  configurable: {
    userId: "u1",
    conversationId: "c1",
    assistantId: DEFAULT_ASSISTANT_ID,
    message: "hi",
    now: new Date("2026-01-01T00:00:00.000Z"),
    timezone: "Asia/Jerusalem",
    locale: "en" as const,
    executors: {} as never,
    turnOutcome: { uiBlocks: [] },
    knownCounterparties: []
  }
};

describe("v2 agent node compressed view", () => {
  test("sends only messages from summaryCoveredCount onward", async () => {
    captured = [];
    const node = buildAgentNode(stubModel);
    const messages: BaseMessage[] = [
      new HumanMessage("old-0"),
      new AIMessage("old-1"),
      new HumanMessage("recent-2"),
      new AIMessage("recent-3")
    ];
    const state = {
      messages,
      summaryCoveredCount: 2,
      runningSummary: undefined
    } as V2AgentStateType;

    await node(state, baseConfig as never);

    // [system, recent-2, recent-3] — the two old messages are excluded.
    assert.equal(captured.length, 3);
    assert.ok(captured[0] instanceof SystemMessage);
    assert.equal((captured[1] as HumanMessage).content, "recent-2");
  });

  test("injects runningSummary from state into the system prompt", async () => {
    captured = [];
    const node = buildAgentNode(stubModel);
    const state = {
      messages: [new HumanMessage("hi")],
      summaryCoveredCount: 0,
      runningSummary: "User asked about Dan totals earlier."
    } as V2AgentStateType;

    await node(state, baseConfig as never);

    const system = (captured[0] as SystemMessage).content as string;
    assert.match(system, /Dan totals/);
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npx tsx --tsconfig server/tsconfig.json --test "server/src/ai/v2/nodes/__tests__/agent.test.ts"`
Expected: FAIL — the agent currently sends all messages and reads `cfg.runningSummary` (so the slice/summary assertions fail).

- [ ] **Step 3: Write minimal implementation**

Replace the body of `server/src/ai/v2/agent.ts` (lines 18-43) with:

```ts
export function buildAgentNode(model: ChatOpenAI) {
  const boundModel = model.bindTools(allTools, { parallel_tool_calls: true });

  return async function agent(
    state: V2AgentStateType,
    config: LangGraphRunnableConfig
  ): Promise<Partial<V2AgentStateType>> {
    const cfg = getConfigurable(config);
    const system = buildSystemPrompt({
      assistantId: cfg.assistantId,
      locale: cfg.locale,
      knownCounterparties: cfg.knownCounterparties,
      pendingConfirmation: cfg.pendingConfirmation,
      now: cfg.now,
      timezone: cfg.timezone,
      // Phase 6: the summary lives in checkpointed state, maintained by `summarize`.
      runningSummary: state.runningSummary
    });

    // Send only the boundary-safe recent window; older turns are represented by
    // `runningSummary` in the system prompt. The full thread stays in the
    // checkpointer untouched.
    const covered = state.summaryCoveredCount ?? 0;
    const view = state.messages.slice(covered);

    const aiMessage = await boundModel.invoke(
      [new SystemMessage(system), ...view],
      config
    );

    return { messages: [aiMessage] };
  };
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `npx tsx --tsconfig server/tsconfig.json --test "server/src/ai/v2/nodes/__tests__/agent.test.ts"`
Expected: PASS (2 tests).

- [ ] **Step 5: Commit**

```bash
git add server/src/ai/v2/agent.ts server/src/ai/v2/nodes/__tests__/agent.test.ts
git commit -m "refactor(ai): agent reads compressed view + summary from state"
```

---

## Task 5: Wire `summarize` into the single resumable graph

Insert the node so it runs before every agent call: `prepare → summarize → agent`, and re-route `tools → summarize → agent` (so a long tool chain stays bounded too). Pass the same `model` instance (it is used raw for summarization; `buildAgentNode` binds tools on its own copy).

**Files:**
- Modify: `server/src/ai/v2/hitl.ts:41-98` (imports + `buildResumableGraph`)
- Test: `server/src/ai/v2/__tests__/graph-wiring.test.ts`

**Interfaces:**
- Consumes: `buildSummarizationNode` from `./nodes/summarize.js`.
- Produces: `buildResumableGraph(checkpointer)` unchanged signature; topology now includes a `summarize` node.

- [ ] **Step 1: Write the failing test**

Create `server/src/ai/v2/__tests__/graph-wiring.test.ts`:

```ts
import assert from "node:assert/strict";
import { describe, test } from "node:test";

import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";

// Source assertion, NOT a build: buildResumableGraph() calls createV2ChatModel(),
// which constructs a ChatOpenAI and throws without an API key — so we must never
// call it in the no-key unit env. The compiled topology is validated by `tsc`
// (Task 9) and exercised live by the conformance suite (Task 9, Step 5).
describe("unified resumable graph wiring", () => {
  test("buildResumableGraph wires summarize between prepare/tools and agent", () => {
    const path = fileURLToPath(new URL("../hitl.ts", import.meta.url));
    const src = readFileSync(path, "utf8");
    assert.match(src, /\.addNode\("summarize",\s*buildSummarizationNode\(model\)\)/);
    assert.match(src, /\.addEdge\("prepare",\s*"summarize"\)/);
    assert.match(src, /\.addEdge\("summarize",\s*"agent"\)/);
    assert.match(src, /\.addEdge\("tools",\s*"summarize"\)/);
    // The money branch must remain intact.
    assert.match(src, /\.addNode\("transferGate"/);
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npx tsx --tsconfig server/tsconfig.json --test "server/src/ai/v2/__tests__/graph-wiring.test.ts"`
Expected: FAIL — `hitl.ts` does not yet contain the `summarize` wiring.

- [ ] **Step 3: Write minimal implementation**

In `server/src/ai/v2/hitl.ts`, add the import alongside the other node imports (near line 47-51):

```ts
import { buildSummarizationNode } from "./nodes/summarize.js";
```

Then replace `buildResumableGraph` (lines 77-98) with the re-wired topology:

```ts
export function buildResumableGraph(checkpointer: BaseCheckpointSaver) {
  const model = createV2ChatModel();
  return new StateGraph(V2AgentState)
    .addNode("prepare", prepareNode)
    .addNode("summarize", buildSummarizationNode(model))
    .addNode("agent", buildAgentNode(model))
    .addNode("tools", createV2ToolNode())
    .addNode("finalize", finalizeNode)
    .addNode("transferGate", transferGateNode, { ends: ["executeTransfer", "persist"] })
    .addNode("executeTransfer", executeTransferNode)
    .addNode("persist", persistNode)
    .addEdge(START, "prepare")
    .addEdge("prepare", "summarize")
    .addEdge("summarize", "agent")
    .addConditionalEdges("agent", routeAgent, { tools: "tools", finalize: "finalize" })
    .addEdge("tools", "summarize")
    .addConditionalEdges("finalize", routeAfterFinalize, {
      transferGate: "transferGate",
      persist: "persist"
    })
    .addEdge("executeTransfer", "persist")
    .addEdge("persist", END)
    .compile({ checkpointer });
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `npx tsx --tsconfig server/tsconfig.json --test "server/src/ai/v2/__tests__/graph-wiring.test.ts"`
Expected: PASS (1 test).

- [ ] **Step 5: Run the existing hitl tests to confirm no regression**

Run: `npx tsx --tsconfig server/tsconfig.json --test "server/src/ai/v2/__tests__/hitl.test.ts"`
Expected: PASS (existing tests still green — topology change is additive).

- [ ] **Step 6: Commit**

```bash
git add server/src/ai/v2/hitl.ts server/src/ai/v2/__tests__/graph-wiring.test.ts
git commit -m "feat(ai): wire summarization node into the resumable graph"
```

---

## Task 6: Persist long-term counterparties on the unified path

`graph.ts` wrote interacted counterparties to the BaseStore each turn (`upsertInteractedCounterparties`); the resumable entry never did. Since the resumable graph becomes the only path, port that long-term write into `invokeV2Resumable` and `streamAssistantV2` so the BaseStore (target layer 2) keeps getting fed. The rolling summary is **not** written here — it now lives in checkpointed state (Task 2/3).

**Files:**
- Modify: `server/src/ai/v2/hitl.ts` — import + post-turn write in both entries.
- Test: `server/src/ai/v2/__tests__/hitl-longterm.test.ts`

**Interfaces:**
- Consumes: `upsertInteractedCounterparties` from `./memory/loop.js`; `resolveLongTermStore` (already imported).
- Produces: no signature change; a side effect (BaseStore upsert) after each non-degraded turn.

> **Why a source-assertion test, not a behavioral one:** `invokeV2Resumable` returns a canned "unsupported" fallback *before* it ever touches the graph when `isV2ModelConfigured()` is false ([hitl.ts:175](../../../server/src/ai/v2/hitl.ts#L175)), and `config.ai.openAIApiKey` defaults to `""` and is read at import time. In the DB-free / no-key unit env a behavioral test through a stub graph would get the fallback, never exercise the upsert, and prove nothing. So we assert the wiring on the source (deterministic, no key/DB); the substantive long-term behavior is covered by the live conformance suite in Task 9.

- [ ] **Step 1: Write the failing test**

Create `server/src/ai/v2/__tests__/hitl-longterm.test.ts`:

```ts
import assert from "node:assert/strict";
import { describe, test } from "node:test";

import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";

describe("unified path long-term persistence wiring", () => {
  test("hitl.ts imports and calls upsertInteractedCounterparties in both entries", () => {
    const path = fileURLToPath(new URL("../hitl.ts", import.meta.url));
    const src = readFileSync(path, "utf8");
    assert.match(
      src,
      /import\s*{[^}]*upsertInteractedCounterparties[^}]*}\s*from\s*"\.\/memory\/loop\.js"/s,
      "should import upsertInteractedCounterparties from ./memory/loop.js"
    );
    // Called in BOTH invokeV2Resumable and streamAssistantV2 (>= 2 call sites).
    const calls = src.match(/upsertInteractedCounterparties\(/g) ?? [];
    assert.ok(calls.length >= 2, `expected >= 2 call sites, found ${calls.length}`);
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npx tsx --tsconfig server/tsconfig.json --test "server/src/ai/v2/__tests__/hitl-longterm.test.ts"`
Expected: FAIL — `hitl.ts` does not yet import or call `upsertInteractedCounterparties`.

- [ ] **Step 3: Add the long-term write**

In `server/src/ai/v2/hitl.ts`, extend the `loop.js` import to include `upsertInteractedCounterparties`:

```ts
import {
  resolveLongTermStore,
  upsertInteractedCounterparties,
  withLongTermCounterparties
} from "./memory/loop.js";
```

In `invokeV2Resumable`, after the audit-log block and before the final `return`, add:

```ts
    // Layer 2: feed cross-session long-term memory (counterparties). Best-effort;
    // a store outage must not fail the turn (upsert swallows its own errors).
    if (input.userId && longTermStore) {
      await upsertInteractedCounterparties(longTermStore, input.userId, memory);
    }
```

In `streamAssistantV2`, after the loop that consumes the stream and before yielding the final `result` envelope, add the same block (it has `longTermStore` and `memory` in scope from the entry setup).

- [ ] **Step 4: Run test to verify it passes**

Run: `npx tsx --tsconfig server/tsconfig.json --test "server/src/ai/v2/__tests__/hitl-longterm.test.ts"`
Expected: PASS (1 test).

- [ ] **Step 5: Commit**

```bash
git add server/src/ai/v2/hitl.ts server/src/ai/v2/__tests__/hitl-longterm.test.ts
git commit -m "feat(ai): persist long-term counterparties on the unified path"
```

---

## Task 7: Repoint `runAssistant` (and thus evals) at the unified graph

`runAssistant`'s v2 branch dispatches to `runAssistantGraphV2` (the path being deleted). Point it at `invokeV2Resumable`. The eval harness calls `runAssistant`, so this single change re-targets the whole conformance suite at the unified resumable graph (which falls back to an in-memory checkpointer when no DB is connected — see [hitl.ts:121-124](../../../server/src/ai/v2/hitl.ts#L121)).

**Files:**
- Modify: `server/src/ai/runAssistant.ts:11-28`
- Test: `server/src/ai/__tests__/runAssistant.test.ts`

**Interfaces:**
- Consumes: `invokeV2Resumable` from `./v2/hitl.js`; `runAssistantGraph` from `./graph.js` (v1, unchanged); `config.ai.graphVersion`.
- Produces: `runAssistant(input, options)` — same signature; v2 now routes to the resumable graph.

- [ ] **Step 1: Write the failing test**

Create `server/src/ai/__tests__/runAssistant.test.ts`:

```ts
import assert from "node:assert/strict";
import { describe, test } from "node:test";

import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";

describe("runAssistant v2 dispatch", () => {
  test("v2 branch imports invokeV2Resumable, not runAssistantGraphV2", () => {
    const path = fileURLToPath(new URL("../runAssistant.ts", import.meta.url));
    const src = readFileSync(path, "utf8");
    assert.match(src, /invokeV2Resumable/, "should dispatch to the resumable graph");
    assert.doesNotMatch(src, /runAssistantGraphV2/, "must not reference the deleted graph");
    assert.doesNotMatch(src, /v2\/graph\.js/, "must not import the deleted module");
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npx tsx --tsconfig server/tsconfig.json --test "server/src/ai/__tests__/runAssistant.test.ts"`
Expected: FAIL — file still imports `runAssistantGraphV2` from `./v2/graph.js`.

- [ ] **Step 3: Write minimal implementation**

Replace `server/src/ai/runAssistant.ts` (lines 11-28) with:

```ts
import { config } from "../config.js";
import { runAssistantGraph } from "./graph.js";
import type {
  RunAssistantInput,
  RunAssistantOptions,
  RunAssistantResult
} from "./state.js";
import { invokeV2Resumable } from "./v2/hitl.js";

export function runAssistant(
  input: RunAssistantInput,
  options: RunAssistantOptions = {}
): Promise<RunAssistantResult> {
  if (config.ai.graphVersion === "v2") {
    // The single v2 graph: resumable, checkpointer-backed, with the summarization
    // view. In the DB-free eval/test env the checkpointer degrades to in-memory.
    return invokeV2Resumable(input, options);
  }
  return runAssistantGraph(input, options);
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `npx tsx --tsconfig server/tsconfig.json --test "server/src/ai/__tests__/runAssistant.test.ts"`
Expected: PASS (1 test).

- [ ] **Step 5: Commit**

```bash
git add server/src/ai/runAssistant.ts server/src/ai/__tests__/runAssistant.test.ts
git commit -m "refactor(ai): route v2 dispatch to the unified resumable graph"
```

---

## Task 8: Delete the obsolete graph + BaseStore-summary code

With nothing pointing at them, remove `graph.ts`, the old `summary.ts` (replaced by `tokens.ts` + `summarize.ts`), the BaseStore summary read/write in `loop.ts`, and the now-unused `runningSummary` field on `V2Configurable`. This is the "one graph" cleanup.

**Files:**
- Delete: `server/src/ai/v2/graph.ts`
- Delete: `server/src/ai/v2/memory/summary.ts`
- Delete: `server/src/ai/v2/memory/__tests__/summary.test.ts`
- Modify: `server/src/ai/v2/memory/loop.ts` — remove `readConversationSummary`, `saveConversationSummary`, `SUMMARY_KEY`.
- Modify: `server/src/ai/v2/toolContext.ts:74-75` — remove the `runningSummary` field.

**Interfaces:**
- Removes: `runAssistantGraphV2`, `assistantGraphV2`, `foldRollingSummary`, `trimToWindow`, `SUMMARY_BUDGET_MESSAGES`, `KEEP_RECENT_MESSAGES`, `readConversationSummary`, `saveConversationSummary`, `V2Configurable.runningSummary`.

- [ ] **Step 1: Confirm there are no remaining importers**

Run:
```bash
grep -rn "v2/graph\.js\|runAssistantGraphV2\|assistantGraphV2\b" server/src --include="*.ts"
grep -rn "foldRollingSummary\|trimToWindow\|SUMMARY_BUDGET_MESSAGES\|KEEP_RECENT_MESSAGES" server/src --include="*.ts"
grep -rn "readConversationSummary\|saveConversationSummary" server/src --include="*.ts"
grep -rn "cfg\.runningSummary\|configurable\.runningSummary" server/src --include="*.ts"
```
Expected: only matches inside the files being deleted/edited in this task (no live consumers). If anything else appears, stop and resolve it first.

- [ ] **Step 2: Delete the obsolete files**

```bash
git rm server/src/ai/v2/graph.ts \
       server/src/ai/v2/memory/summary.ts \
       server/src/ai/v2/memory/__tests__/summary.test.ts
```

- [ ] **Step 3: Trim `loop.ts`**

In `server/src/ai/v2/memory/loop.ts`, delete the `SUMMARY_KEY` constant (line 48) and the `readConversationSummary` and `saveConversationSummary` functions (lines 55-83). Keep `resolveLongTermStore`, `withLongTermCounterparties`, and `upsertInteractedCounterparties`.

`userNamespace` was used ONLY by the two deleted summary functions (`readLongTermSnapshot`/`upsertCounterparty` do their own namespacing), so it becomes an unused import. Update the `store.js` import from:

```ts
import { readLongTermSnapshot, upsertCounterparty, userNamespace } from "./store.js";
```

to:

```ts
import { readLongTermSnapshot, upsertCounterparty } from "./store.js";
```

(The separate `createMongoLongTermStore` import on the line above is still used by `resolveLongTermStore` — keep it.)

- [ ] **Step 4: Remove the dead `runningSummary` config field**

In `server/src/ai/v2/toolContext.ts`, delete these two lines (74-75) from the `V2Configurable` type:

```ts
  /** Compressed earlier-conversation summary when the thread was trimmed (Phase 6). */
  runningSummary?: string;
```

- [ ] **Step 5: Typecheck the whole server**

Run: `npx tsc -p server/tsconfig.json --noEmit`
Expected: no errors. (If `tsc` flags an unused import in `loop.ts`, remove it.)

- [ ] **Step 6: Run the full v2 unit suite**

Run: `npx tsx --tsconfig server/tsconfig.json --test "server/src/ai/v2/**/__tests__/**/*.test.ts" "server/src/ai/__tests__/**/*.test.ts"`
Expected: PASS — all v2 unit tests green, no references to deleted modules.

- [ ] **Step 7: Commit**

```bash
git add -A
git commit -m "refactor(ai): delete graph.ts and BaseStore-summary code (single graph)"
```

---

## Task 9: Full verification — typecheck, suites, and a live conformance run

Confirm the unified path holds end to end: typecheck, the whole server unit suite, the contract suite, and (if a key is present) the live v2 conformance suite that exercises real multi-turn memory through the checkpointer + summarization view.

**Files:**
- No source changes (verification only). Fixes, if needed, loop back to the relevant task.

- [ ] **Step 1: Typecheck**

Run: `npx tsc -p server/tsconfig.json --noEmit`
Expected: clean.

- [ ] **Step 2: Server unit suite (node:test)**

Run: `npx tsx --tsconfig server/tsconfig.json --test "server/src/**/__tests__/**/*.test.ts"`
Expected: PASS. Pay attention to `server/src/ai/v2/memory/__tests__/checkpointer.test.ts` (unchanged) and the new summarize/agent/state tests.

- [ ] **Step 3: Contract suite**

Run: `npm run test:contract --workspace server`
Expected: PASS (or the project's known-baseline result — compare against `main`; no new failures attributable to this change).

- [ ] **Step 4: Studio graph sanity (it builds its own graph; confirm it still compiles)**

Run: `grep -rn "from \"\\.\\./graph\\.js\"\|v2/graph" server/src/ai/v2/studioGraph.ts`
Expected: no matches (studioGraph never imported the deleted module). Typecheck in Step 1 already proves it compiles.

- [ ] **Step 5: Live conformance (requires `OPENAI_API_KEY`)**

Run:
```bash
VIRLY_AI_V2_EVAL=1 VIRLY_AI_GRAPH_VERSION=v2 \
  OPENAI_API_KEY="$OPENAI_API_KEY" VIRLY_AI_MODEL="${VIRLY_AI_MODEL:-gpt-4o-mini}" \
  npx tsx --tsconfig server/tsconfig.json --test \
  "server/src/ai/evals/v2/__tests__/v2-conformance.test.ts"
```
The suite is **double-gated**: it skips unless `VIRLY_AI_V2_EVAL=1` is set AND a key/model are configured ([v2-conformance.test.ts:28-37](../../../server/src/ai/evals/v2/__tests__/v2-conformance.test.ts#L28)). These are read from `config.ai` at import time, so they MUST be set on the command line / in `server/.env` — not mutated inside the test.
Expected: PASS. This proves multi-turn coreference now flows through the checkpointer (not the deleted `conversationStore` replay) and that the summarization view does not break long conversations. If the suite reports SKIPPED (no key, or flag unset), record that — do NOT mark it passed.

- [ ] **Step 6: Final commit (if any verification fixes were made)**

```bash
git add -A
git commit -m "test(ai): verify unified memory path end to end"
```

---

## Self-Review

**Spec coverage:**
- Target 1 — *DB-backed checkpointer for durable short-term/thread state*: preserved; the single graph is the resumable, checkpointer-backed one (Task 5/7), unchanged backends (Mongo/Postgres/in-memory).
- Target 2 — *BaseStore for cross-session long-term memory*: Task 6 ports the counterparty upsert onto the unified path; the BaseStore no longer doubles as summary storage (Task 8).
- Target 3 — *langmem-style summarization view for token budget*: Tasks 1-5 add a token-budgeted, incremental, boundary-safe, off-channel summary in checkpointed state, consumed by the agent.
- *Unify the paths*: Task 7 repoints dispatch + evals; Task 8 deletes `graph.ts`.

**Notes / deliberate scope boundaries:**
- The summarizer remains a hand-rolled port (no `langmem` JS package exists). The counter is approximate (~4 chars/token); swap an exact tokenizer behind `tokens.ts` later if precision matters — that is intentionally out of scope.
- Per-turn capture of *new* counterparties into `mentionedCounterparties` was not done by `graph.ts` either; Task 6 faithfully ports the existing write without expanding capture. Flagged, not silently dropped.
- v2 no longer writes the `conversationStore` message transcript (the checkpointer is the source of truth) — this matches the prior production `hitl.ts` behavior, so it is not a regression.
- Summary token thresholds are module constants (`SUMMARY_TRIGGER_TOKENS`, `SUMMARY_RECENT_TOKENS`); promoting them to `config.ai` env vars is a trivial follow-up if runtime tuning is wanted.
- **No-key guardrail (read before writing any v2 test):** `invokeV2Resumable` returns a canned "unsupported" fallback *before* it touches the graph when `OPENAI_API_KEY` is unset ([hitl.ts:175](../../../server/src/ai/v2/hitl.ts#L175)), and `config.ai` is read at import time. Therefore any test that exercises the v2 graph via `runAssistant`/`invokeV2Resumable` must either run live (key set on the command line) or assert on source — never assert on graph *output* in the no-key unit env. The same applies to anything that calls `buildResumableGraph()`, which constructs a `ChatOpenAI` and throws without a key. This is why Tasks 5 and 6 are source-assertion tests.
- **Verification status:** this plan was adversarially reviewed against the installed `@langchain/langgraph` and the runtime gates; the no-key fallback (Tasks 5/6), the `VIRLY_AI_V2_EVAL=1` double-gate (Task 9), and the unused `userNamespace` import (Task 8) were caught and fixed. The LangGraph-introspection and deletion-safety reviewers were interrupted mid-run by a session limit — the executor should treat the Task 9 `tsc` + full-suite steps as the backstop and, if `getGraph()` introspection is ever reintroduced, verify the JS API shape first.

## Execution Handoff

Plan complete and saved to `docs/superpowers/plans/2026-06-28-unify-ai-memory-paths.md`. Two execution options:

1. **Subagent-Driven (recommended)** — I dispatch a fresh subagent per task, review between tasks, fast iteration.
2. **Inline Execution** — Execute tasks in this session using executing-plans, batch execution with checkpoints.

Which approach?
