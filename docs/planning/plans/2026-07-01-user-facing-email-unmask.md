# User-Facing Email Unmask (v2) Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Stop the v2 assistant from showing masked counterparty emails (`a***@example.com`) to the user - the user should see the real email, while the LLM keeps seeing the masked form.

**Architecture:** Email masking is a privacy measure for the third-party LLM, but today the masked form leaks all the way into what the user sees (streamed prose + summary cards).
We fix this at the one client-facing seam - `streamAssistantV2` in `server/src/ai/v2/hitl.ts` - by building a per-turn `maskedLabel -> realEmail` map from conversation memory plus the counterparties the turn's tools resolved, then unmasking the token stream, the final `responseMessage`, and the totals-card label before they leave the server.
Nothing that the LLM or the conversation store sees changes, so the model's history stays masked.

**Tech Stack:** TypeScript (ESM, `.js` import specifiers), LangGraph v2 graph, Jest (`server/jest.config.mjs`, run with `NODE_OPTIONS=--experimental-vm-modules jest`).

## Global Constraints

- No em dashes anywhere in code, comments, or docs. Use a plain `-`.
- Server tests are Jest, live in `__tests__/` dirs beside the code, named `*.test.ts`, and run from `server/` with `npm test -- <path>` (which sets `NODE_OPTIONS=--experimental-vm-modules`).
- Type-check with `npm run build` from `server/` (runs `tsc -p tsconfig.json`); it must exit 0.
- ESM: every relative import ends in `.js` even though the source is `.ts` (match the files you edit).
- The masking function is `maskEmail` in `server/src/ai/counterpartyMemory.ts`: `alice@example.com` -> `a***@example.com`; an input without a single `@`-split returns the literal `"masked recipient"`.
- Masking is lossy: two different reals can collapse to one mask (`alice@x.com` and `andrew@x.com` both mask to `a***@x.com`). When a mask is ambiguous the unmasker MUST leave it masked rather than guess.
- Do NOT change what the LLM reads. The model-facing surfaces (`renderToolResult`, the system prompt, the checkpointed thread) stay exactly as they are. This plan only rewrites bytes on their way to the browser.

## Background: how an email reaches the user today

Traced in the v2 code (`server/src/ai/v2/`):

1. A counterparty tool (e.g. `getTotals`, `getCounterpartySummary`) is called by the model with the real `counterpartyEmail` as an argument. The wrapper builds `minimalCounterpartyRef(email)` = `{ email, maskedLabel: maskEmail(email), userLabel: email, ... }` and passes it as `resolvedCounterparty` (`tools/readOnly.ts`).
2. `callExecutor` (`tools/readOnly.ts:42`) runs the executor, then returns `renderToolResult(result)` as the **model-facing** string. That string carries the **masked** human summary (and, separately, a `[data]` JSON blob). This is all the LLM sees for the counterparty's identity in prose.
3. The model writes its answer echoing the masked label it saw, so the streamed tokens and the final `responseMessage` contain `a***@example.com`.
4. `streamAssistantV2` (`hitl.ts:322`) is the single place those tokens, the final `responseMessage`, and the `responseBlocks` are handed to the SSE route (`routes/ai.routes.ts`) and on to the browser. **There is no other path**: no REST endpoint serves stored assistant messages back to the client (`mongoConversationStore` is load-only, used to rebuild memory/history for the graph).

So the browser only ever sees assistant emails through `streamAssistantV2`'s output. Unmask there and the user sees real emails; leave the store/LLM untouched and the model stays masked. No client change is needed.

## Map source

The `maskedLabel -> realEmail` pairs for a turn come from two places, unioned:

- **Prior turns:** `memory.mentionedCounterparties` (loaded at `hitl.ts:334`); each `CounterpartyRef` has `email` and `maskedLabel` (`state.ts:536`).
- **This turn:** the v2 graph does NOT write per-turn counterparties back into `memory`, so we capture them ourselves. Every counterparty tool funnels through `callExecutor` with a `resolvedCounterparty` override that already holds `{ email, maskedLabel }`. We record those onto the per-turn `turnOutcome` object (created in `streamAssistantV2`, passed by reference into the graph), then read them back after the stream.

Graph ordering guarantees the map is populated before it is needed: tool calls (which resolve counterparties) always run before the model streams its final answer, so by the time an email-bearing token arrives, its pair is already on `turnOutcome`.

## File Structure

- **Create** `server/src/ai/v2/unmaskEmails.ts` - a pure, dependency-free module: build the map, unmask a finished string, and a streaming unmasker that survives a mask split across chunks. One responsibility: turning masked labels back into real emails. Fully unit-testable with no graph or DB.
- **Create** `server/src/ai/v2/__tests__/unmaskEmails.test.ts` - unit tests for the pure module.
- **Modify** `server/src/ai/v2/toolContext.ts` - add an optional `counterpartyLabels` sink to `V2TurnOutcome`.
- **Modify** `server/src/ai/v2/tools/readOnly.ts` - in `callExecutor`, record a resolved counterparty's `{ maskedLabel, email }` onto `turnOutcome.counterpartyLabels`.
- **Modify** `server/src/ai/v2/tools/__tests__/readOnly.capture.test.ts` (create) - prove the capture happens.
- **Modify** `server/src/ai/v2/hitl.ts` - build the map, unmask the token stream, unmask the final `responseMessage`.
- **Modify** `server/src/ai/v2/__tests__/hitl.unmask.test.ts` (create) - drive `streamAssistantV2` with a fake graph + store and assert tokens/result come out unmasked.
- **Modify** `server/src/ai/v2/blocks.ts` - flip the totals-card label so the real email wins over the masked one (blocks are user-facing only).
- **Modify** `server/src/ai/v2/__tests__/blocks.test.ts` - assert the totals card shows the real email.

---

### Task 1: Pure unmask module

**Files:**
- Create: `server/src/ai/v2/unmaskEmails.ts`
- Test: `server/src/ai/v2/__tests__/unmaskEmails.test.ts`

**Interfaces:**
- Consumes: nothing (pure module).
- Produces:
  - `buildUnmaskMap(refs: ReadonlyArray<{ maskedLabel: string; email: string }>): Map<string, string>` - maps each valid, unambiguous `maskedLabel` to its real `email`.
  - `unmaskText(text: string, map: ReadonlyMap<string, string>): string` - replaces every masked label in a finished string.
  - `createStreamingUnmasker(map: ReadonlyMap<string, string>): { push(chunk: string): string; flush(): string }` - replaces masked labels across streamed chunks, holding back a partial tail so a label split across chunks is still caught.

- [ ] **Step 1: Write the failing tests**

Create `server/src/ai/v2/__tests__/unmaskEmails.test.ts`:

```typescript
import {
  buildUnmaskMap,
  createStreamingUnmasker,
  unmaskText
} from "../unmaskEmails.js";

describe("buildUnmaskMap", () => {
  it("maps a masked label to its real email", () => {
    const map = buildUnmaskMap([
      { maskedLabel: "a***@example.com", email: "alice@example.com" }
    ]);
    expect(map.get("a***@example.com")).toBe("alice@example.com");
  });

  it("drops an ambiguous mask shared by two different reals", () => {
    const map = buildUnmaskMap([
      { maskedLabel: "a***@x.com", email: "alice@x.com" },
      { maskedLabel: "a***@x.com", email: "andrew@x.com" }
    ]);
    expect(map.has("a***@x.com")).toBe(false);
  });

  it("keeps a mask that repeats with the same real", () => {
    const map = buildUnmaskMap([
      { maskedLabel: "a***@x.com", email: "alice@x.com" },
      { maskedLabel: "a***@x.com", email: "alice@x.com" }
    ]);
    expect(map.get("a***@x.com")).toBe("alice@x.com");
  });

  it("ignores the degenerate 'masked recipient' label", () => {
    const map = buildUnmaskMap([
      { maskedLabel: "masked recipient", email: "alice@example.com" }
    ]);
    expect(map.size).toBe(0);
  });
});

describe("unmaskText", () => {
  it("replaces a masked email inside prose", () => {
    const map = buildUnmaskMap([
      { maskedLabel: "a***@example.com", email: "alice@example.com" }
    ]);
    expect(unmaskText("You sent 20 to a***@example.com today.", map)).toBe(
      "You sent 20 to alice@example.com today."
    );
  });

  it("is a no-op when the map is empty", () => {
    expect(unmaskText("hello a***@example.com", new Map())).toBe(
      "hello a***@example.com"
    );
  });

  it("replaces every occurrence", () => {
    const map = buildUnmaskMap([
      { maskedLabel: "a***@example.com", email: "alice@example.com" }
    ]);
    expect(
      unmaskText("a***@example.com and a***@example.com", map)
    ).toBe("alice@example.com and alice@example.com");
  });
});

describe("createStreamingUnmasker", () => {
  it("unmasks a label delivered in one chunk", () => {
    const map = buildUnmaskMap([
      { maskedLabel: "a***@example.com", email: "alice@example.com" }
    ]);
    const u = createStreamingUnmasker(map);
    const out = u.push("Sent to a***@example.com.") + u.flush();
    expect(out).toBe("Sent to alice@example.com.");
  });

  it("unmasks a label split across chunk boundaries", () => {
    const map = buildUnmaskMap([
      { maskedLabel: "a***@example.com", email: "alice@example.com" }
    ]);
    const u = createStreamingUnmasker(map);
    let out = "";
    for (const chunk of ["Sent to a***", "@examp", "le.com now."]) {
      out += u.push(chunk);
    }
    out += u.flush();
    expect(out).toBe("Sent to alice@example.com now.");
  });

  it("passes through text that never completes a masked label", () => {
    const map = buildUnmaskMap([
      { maskedLabel: "a***@example.com", email: "alice@example.com" }
    ]);
    const u = createStreamingUnmasker(map);
    const out = u.push("a normal sentence about apples") + u.flush();
    expect(out).toBe("a normal sentence about apples");
  });
});
```

- [ ] **Step 2: Run the tests to verify they fail**

Run (from `server/`): `npm test -- src/ai/v2/__tests__/unmaskEmails.test.ts`
Expected: FAIL - `Cannot find module '../unmaskEmails.js'`.

- [ ] **Step 3: Write the module**

Create `server/src/ai/v2/unmaskEmails.ts`:

```typescript
/**
 * Turn masked counterparty labels back into real emails on their way to the
 * browser. Masking (see `maskEmail`) is a privacy measure for the LLM; the user
 * owns their data and should see the real address. This module is pure - it has
 * no idea about graphs or streams, only about a `maskedLabel -> realEmail` map.
 */

/** The exact shape `maskEmail` emits, e.g. "a***@example.com". */
const MASKED_EMAIL = /^.\*\*\*@\S+$/;

/**
 * Build the replacement map from counterparty refs. A mask that two different
 * reals collapse to is dropped (ambiguous - we must not guess), and the
 * degenerate "masked recipient" fallback is ignored.
 */
export function buildUnmaskMap(
  refs: ReadonlyArray<{ maskedLabel: string; email: string }>
): Map<string, string> {
  const resolved = new Map<string, string>();
  const conflicted = new Set<string>();
  for (const { maskedLabel, email } of refs) {
    if (!maskedLabel || !email) continue;
    if (!MASKED_EMAIL.test(maskedLabel)) continue;
    if (maskedLabel === email) continue;
    const existing = resolved.get(maskedLabel);
    if (existing !== undefined && existing !== email) {
      conflicted.add(maskedLabel);
      continue;
    }
    resolved.set(maskedLabel, email);
  }
  for (const key of conflicted) resolved.delete(key);
  return resolved;
}

function escapeRegExp(value: string): string {
  return value.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}

/** Replace every masked label in a finished string with its real email. */
export function unmaskText(text: string, map: ReadonlyMap<string, string>): string {
  if (map.size === 0 || !text) return text;
  // Longest masks first so a longer label wins over a shorter prefix of it.
  const needles = [...map.keys()].sort((a, b) => b.length - a.length);
  const pattern = new RegExp(needles.map(escapeRegExp).join("|"), "g");
  return text.replace(pattern, (match) => map.get(match) ?? match);
}

/**
 * Streaming variant: feed it token chunks, it returns the emit-safe portion with
 * masks replaced. It holds back the longest trailing suffix that could still be
 * the start of some mask, so a label split across chunks is not missed. Call
 * `flush()` once the stream ends to release the final buffer.
 */
export function createStreamingUnmasker(
  map: ReadonlyMap<string, string>
): { push(chunk: string): string; flush(): string } {
  let buffer = "";

  function heldBackLength(needles: readonly string[], maxLen: number): number {
    const max = Math.min(buffer.length, Math.max(0, maxLen - 1));
    for (let h = max; h >= 1; h -= 1) {
      const suffix = buffer.slice(buffer.length - h);
      if (needles.some((n) => n.length > h && n.startsWith(suffix))) return h;
    }
    return 0;
  }

  return {
    push(chunk: string): string {
      if (map.size === 0) return chunk;
      buffer += chunk;
      const needles = [...map.keys()];
      const maxLen = needles.reduce((m, n) => Math.max(m, n.length), 0);
      const hold = heldBackLength(needles, maxLen);
      const emit = buffer.slice(0, buffer.length - hold);
      buffer = buffer.slice(buffer.length - hold);
      return unmaskText(emit, map);
    },
    flush(): string {
      const out = map.size === 0 ? buffer : unmaskText(buffer, map);
      buffer = "";
      return out;
    }
  };
}
```

- [ ] **Step 4: Run the tests to verify they pass**

Run (from `server/`): `npm test -- src/ai/v2/__tests__/unmaskEmails.test.ts`
Expected: PASS - all tests green.

- [ ] **Step 5: Type-check**

Run (from `server/`): `npm run build`
Expected: PASS - `tsc` exits 0.

- [ ] **Step 6: Commit**

```bash
git add server/src/ai/v2/unmaskEmails.ts server/src/ai/v2/__tests__/unmaskEmails.test.ts
git commit -m "feat(ai): add pure email unmask module for user-facing output"
```

---

### Task 2: Capture this turn's resolved counterparties

**Files:**
- Modify: `server/src/ai/v2/toolContext.ts:39-45` (the `V2TurnOutcome` type)
- Modify: `server/src/ai/v2/tools/readOnly.ts:42-68` (the `callExecutor` helper)
- Test: `server/src/ai/v2/tools/__tests__/readOnly.capture.test.ts` (create)

**Interfaces:**
- Consumes: `ToolContext.resolvedCounterparty` (a `CounterpartyRef` with `email` and `maskedLabel`), passed as an override into `callExecutor`.
- Produces: `V2TurnOutcome.counterpartyLabels?: Array<{ maskedLabel: string; email: string }>` - the per-turn sink Task 3 reads.

- [ ] **Step 1: Write the failing test**

Create `server/src/ai/v2/tools/__tests__/readOnly.capture.test.ts`:

```typescript
import type { LangGraphRunnableConfig } from "@langchain/langgraph";

import { getTotalsTool } from "../readOnly.js";
import type { V2Configurable, V2TurnOutcome } from "../../toolContext.js";
import type { RuntimeToolResult, ToolContext } from "../../../state.js";

function makeConfig(turnOutcome: V2TurnOutcome): LangGraphRunnableConfig {
  const executor = async (_ctx: ToolContext): Promise<RuntimeToolResult> => ({
    toolName: "getTotalSentToCounterparty",
    status: "ok",
    data: null,
    displayData: { summary: "You sent 20 to a***@example.com.", metadata: {} }
  });
  const configurable: Partial<V2Configurable> = {
    userId: "u1",
    conversationId: "c1",
    message: "how much did I send alice?",
    turnOutcome,
    executors: {
      getTotalSentToCounterparty: executor
    } as unknown as V2Configurable["executors"]
  };
  return { configurable } as LangGraphRunnableConfig;
}

describe("callExecutor counterparty capture", () => {
  it("records the resolved counterparty's masked/real pair on the turn outcome", async () => {
    const turnOutcome: V2TurnOutcome = { uiBlocks: [], counterpartyLabels: [] };
    await getTotalsTool.invoke(
      { counterpartyEmail: "alice@example.com", direction: "sent" },
      makeConfig(turnOutcome)
    );
    expect(turnOutcome.counterpartyLabels).toContainEqual({
      maskedLabel: "a***@example.com",
      email: "alice@example.com"
    });
  });
});
```

- [ ] **Step 2: Run the test to verify it fails**

Run (from `server/`): `npm test -- src/ai/v2/tools/__tests__/readOnly.capture.test.ts`
Expected: FAIL - `counterpartyLabels` is not a property of `V2TurnOutcome` (type error) and/or the array is empty.

- [ ] **Step 3: Add the sink to `V2TurnOutcome`**

In `server/src/ai/v2/toolContext.ts`, extend the type (currently lines 39-45):

```typescript
export type V2TurnOutcome = {
  confirmation?: TransferConfirmation;
  clarification?: ClarificationRequest;
  supersededConfirmationId?: string;
  /** Structured UI cards the tools produced this turn (design §5.2, Phase 8). */
  uiBlocks: AssistantResponseBlock[];
  /**
   * Masked/real counterparty pairs resolved by this turn's tools, so the graph
   * entry can unmask emails on their way to the browser (the LLM keeps the
   * masked form). Read-only; not persisted.
   */
  counterpartyLabels?: Array<{ maskedLabel: string; email: string }>;
};
```

- [ ] **Step 4: Record the pair in `callExecutor`**

In `server/src/ai/v2/tools/readOnly.ts`, inside `callExecutor`, after the executor runs and before `return renderToolResult(result);` (currently around line 64), add the capture. The `overrides` argument already carries `resolvedCounterparty` when the tool resolved one:

```typescript
    const result = await executor({ ...baseToolContext(cfg), ...overrides });
    // Record the masked/real email pair so the graph entry can unmask
    // user-facing output later. The model still only reads the masked summary.
    const resolved = overrides.resolvedCounterparty;
    if (resolved?.maskedLabel && resolved.email) {
      (cfg.turnOutcome.counterpartyLabels ??= []).push({
        maskedLabel: resolved.maskedLabel,
        email: resolved.email
      });
    }
    // Structured cards render the figures authoritatively (Phase 8); each also
    // streams as a `block` event so the UI can render it before the text lands.
    const blocks = buildBlocksFromResult(name, result);
```

- [ ] **Step 5: Run the test to verify it passes**

Run (from `server/`): `npm test -- src/ai/v2/tools/__tests__/readOnly.capture.test.ts`
Expected: PASS.

- [ ] **Step 6: Type-check and run the existing readOnly/tool tests**

Run (from `server/`): `npm run build`
Expected: PASS - `tsc` exits 0.

Run (from `server/`): `npm test -- src/ai/v2/tools`
Expected: PASS - no existing tool test regressed.

- [ ] **Step 7: Commit**

```bash
git add server/src/ai/v2/toolContext.ts server/src/ai/v2/tools/readOnly.ts server/src/ai/v2/tools/__tests__/readOnly.capture.test.ts
git commit -m "feat(ai): capture resolved counterparty masked/real pairs per turn"
```

---

### Task 3: Unmask the stream and final message in `streamAssistantV2`

**Files:**
- Modify: `server/src/ai/v2/hitl.ts:322-437` (the `streamAssistantV2` generator)
- Test: `server/src/ai/v2/__tests__/hitl.unmask.test.ts` (create)

**Interfaces:**
- Consumes: `buildUnmaskMap`, `createStreamingUnmasker`, `unmaskText` (Task 1); `memory.mentionedCounterparties` (`CounterpartyRef[]`); `turnOutcome.counterpartyLabels` (Task 2); `mapStreamChunk` (existing, `streamEvents.ts`).
- Produces: the same `V2StreamEnvelope` sequence as before, but `token` events and the final `result.responseMessage`/`result.message` have masked emails replaced by real ones.

- [ ] **Step 1: Write the failing test**

`streamAssistantV2` takes its graph as an injectable third argument, so we drive it with a fake graph that scripts the exact `[mode, payload]` chunks LangGraph would emit, plus a fake store that seeds counterparty memory. `streamAssistantV2` also calls `communicationProfileService.getOrSeedForUser`, which touches the repository layer, so we mock that service module (native-ESM Jest pattern: `import { jest } from "@jest/globals"`, `jest.unstable_mockModule` before a dynamic `import()` of `hitl.js` - see `src/routes/__tests__/communicationProfile.routes.test.ts`). The other external hooks degrade to no-ops in a DB-less test: `resolveLongTermStore()` returns `undefined`, so `withLongTermCounterparties` returns its input and `upsertInteractedCounterparties` is skipped; `extractCommunicationSignal` is gated behind `isV2ModelConfigured()` (false in tests).

Create `server/src/ai/v2/__tests__/hitl.unmask.test.ts`:

```typescript
import { jest } from "@jest/globals";
import type { CounterpartyRef, ConversationStore } from "../../state.js";
import type { CommunicationProfile } from "../../../domain/communicationProfile.js";

// Mock the communication-profile service BEFORE importing hitl (it would
// otherwise hit the repository layer). Return an all-null profile.
const emptyProfile: CommunicationProfile = {
  formality: null,
  verbosity: null,
  complexity: null,
  humor: null,
  pace: null,
  memory: ""
};
jest.unstable_mockModule("../../../services/communicationProfile.service.js", () => ({
  communicationProfileService: {
    getOrSeedForUser: jest.fn(async () => emptyProfile),
    applyLearned: jest.fn(async () => undefined)
  }
}));

// Import the module-under-test AFTER the mock is wired up.
const { streamAssistantV2 } = await import("../hitl.js");

// A CounterpartyRef with the fields the unmask map needs.
function ref(email: string, masked: string): CounterpartyRef {
  return {
    email,
    maskedLabel: masked,
    firstMentionedAtTurn: 0,
    lastReferencedAtTurn: 0
  };
}

// Fake store: returns seeded memory; save is a no-op.
function fakeStore(refs: CounterpartyRef[]): ConversationStore {
  return {
    load: async () => ({
      messages: [],
      memory: {
        mentionedCounterparties: refs,
        pendingConfirmation: null
      } as never
    }),
    save: async () => {}
  };
}

// Fake graph: yields a masked token then a finalize update carrying the
// masked responseMessage, mimicking LangGraph's ["messages","updates"] modes.
function fakeGraph(maskedText: string) {
  return {
    async stream() {
      async function* gen(): AsyncGenerator<[string, unknown]> {
        yield ["messages", [{ content: maskedText }, {}]];
        yield ["updates", { finalize: { responseMessage: maskedText } }];
      }
      return gen();
    }
  } as unknown as Parameters<typeof streamAssistantV2>[2];
}

describe("streamAssistantV2 unmasking", () => {
  it("unmasks tokens and the final message from seeded memory", async () => {
    const masked = "You sent 20 to a***@example.com.";
    const store = fakeStore([ref("alice@example.com", "a***@example.com")]);

    const events: Array<{ event: string; data: Record<string, unknown> }> = [];
    for await (const envelope of streamAssistantV2(
      { userId: "u1", conversationId: "c1", message: "how much to alice?" },
      { conversationStore: store },
      fakeGraph(masked)
    )) {
      events.push(envelope as { event: string; data: Record<string, unknown> });
    }

    const tokenText = events
      .filter((e) => e.event === "token")
      .map((e) => e.data.text as string)
      .join("");
    expect(tokenText).toBe("You sent 20 to alice@example.com.");

    const result = events.find((e) => e.event === "result");
    expect(result?.data.responseMessage).toBe("You sent 20 to alice@example.com.");
  });

  it("leaves text untouched when memory has no matching counterparty", async () => {
    const masked = "You sent 20 to a***@example.com.";
    const store = fakeStore([]);

    const events: Array<{ event: string; data: Record<string, unknown> }> = [];
    for await (const envelope of streamAssistantV2(
      { userId: "u1", conversationId: "c1", message: "hi" },
      { conversationStore: store },
      fakeGraph(masked)
    )) {
      events.push(envelope as { event: string; data: Record<string, unknown> });
    }

    const tokenText = events
      .filter((e) => e.event === "token")
      .map((e) => e.data.text as string)
      .join("");
    expect(tokenText).toBe(masked);
  });
});
```

- [ ] **Step 2: Run the test to verify it fails**

Run (from `server/`): `npm test -- src/ai/v2/__tests__/hitl.unmask.test.ts`
Expected: FAIL - the first test's `tokenText` is still `You sent 20 to a***@example.com.` (unmasking not wired yet).

- [ ] **Step 3: Import the unmask helpers**

In `server/src/ai/v2/hitl.ts`, add to the existing imports near the top (beside the other `./` imports such as `import { mapStreamChunk } from "./streamEvents.js";`):

```typescript
import {
  buildUnmaskMap,
  createStreamingUnmasker,
  unmaskText
} from "./unmaskEmails.js";
```

- [ ] **Step 4: Seed the per-turn sink**

In `streamAssistantV2`, change the `turnOutcome` initializer (currently `const turnOutcome: V2TurnOutcome = { uiBlocks: [] };` at line 336):

```typescript
  const turnOutcome: V2TurnOutcome = { uiBlocks: [], counterpartyLabels: [] };
```

- [ ] **Step 5: Build the live map and unmask the token stream**

Replace the stream loop (currently lines 362-384, from `let finalText = "";` through the `for await` loop) with:

```typescript
  let finalText = "";
  // Live map, rebuilt from prior-turn memory + counterparties this turn's tools
  // resolve. Tool calls run before the final answer streams, so the pair for any
  // email-bearing token is present by the time that token arrives.
  const unmaskMap = new Map<string, string>();
  const refreshUnmaskMap = () => {
    const next = buildUnmaskMap([
      ...memory.mentionedCounterparties,
      ...(turnOutcome.counterpartyLabels ?? [])
    ]);
    unmaskMap.clear();
    for (const [masked, real] of next) unmaskMap.set(masked, real);
  };
  refreshUnmaskMap();
  const unmasker = createStreamingUnmasker(unmaskMap);

  const stream = await graph.stream(
    { messages: [new HumanMessage(input.message)] },
    {
      configurable: { ...configurable, thread_id: input.conversationId },
      streamMode: ["messages", "custom", "updates"],
      recursionLimit: 25
    }
  );

  for await (const chunk of stream) {
    const [mode, payload] = chunk as [string, unknown];
    refreshUnmaskMap();
    if (mode === "updates") {
      const update = payload as Record<string, { responseMessage?: string } | undefined>;
      const finalized = update.finalize?.responseMessage ?? update.executeTransfer?.responseMessage;
      if (finalized) {
        finalText = finalized;
      }
    }
    for (const sse of mapStreamChunk(mode, payload)) {
      if (sse.event === "token") {
        const text = unmasker.push(sse.data.text);
        if (text) {
          yield { event: "token", data: { text } } as V2StreamEnvelope;
        }
      } else {
        yield sse as V2StreamEnvelope;
      }
    }
  }
  const tail = unmasker.flush();
  if (tail) {
    yield { event: "token", data: { text: tail } } as V2StreamEnvelope;
  }
```

- [ ] **Step 6: Unmask the final `responseMessage`**

The `responseMessage` is derived a few lines below (currently lines 386-392). Wrap the resolved text in `unmaskText` so the persisted-to-client final message matches the token stream. Replace:

```typescript
  const responseMessage =
    finalText.trim() ||
    (turnOutcome.confirmation
      ? locale === "he"
        ? "הכנתי העברה לאישורך."
        : "I've prepared a transfer for your confirmation."
      : "");
```

with:

```typescript
  const responseMessage = unmaskText(
    finalText.trim() ||
      (turnOutcome.confirmation
        ? locale === "he"
          ? "הכנתי העברה לאישורך."
          : "I've prepared a transfer for your confirmation."
        : ""),
    unmaskMap
  );
```

(The fallback strings contain no emails, so `unmaskText` is a no-op on them; wrapping keeps a single seam.)

- [ ] **Step 7: Run the test to verify it passes**

Run (from `server/`): `npm test -- src/ai/v2/__tests__/hitl.unmask.test.ts`
Expected: PASS - both tests green.

- [ ] **Step 8: Type-check and run the full v2 suite**

Run (from `server/`): `npm run build`
Expected: PASS - `tsc` exits 0.

Run (from `server/`): `npm test -- src/ai/v2`
Expected: PASS - no existing v2 test regressed (the change only rewrites emitted bytes; masked-free output is untouched).

- [ ] **Step 9: Commit**

```bash
git add server/src/ai/v2/hitl.ts server/src/ai/v2/__tests__/hitl.unmask.test.ts
git commit -m "feat(ai): unmask counterparty emails in v2 stream and final message"
```

---

### Task 4: Show the real email on the totals card

**Files:**
- Modify: `server/src/ai/v2/blocks.ts:126-134` (the totals-card counterparty label)
- Test: `server/src/ai/v2/__tests__/blocks.test.ts`

**Interfaces:**
- Consumes: `ToolResultMetadata` fields `displayName`, `counterpartyEmail` (real), `maskedLabel` (masked).
- Produces: the same block shape; only the rendered label string changes (real email preferred over masked). Blocks are user-facing only (built into `turnOutcome.uiBlocks`, never fed to the LLM - the model reads `renderToolResult`), so showing the real email here is safe.

- [ ] **Step 1: Write the failing test**

Add to `server/src/ai/v2/__tests__/blocks.test.ts` (it already imports `buildBlocksFromResult` and has a `makeResult` helper):

```typescript
describe("totals card counterparty label", () => {
  it("shows the real email, not the masked one, when there is no display name", () => {
    const result = makeResult("getTotalSentToCounterparty", "ok", {
      amount: 250,
      recordCount: 3,
      counterpartyEmail: "alice@example.com",
      maskedLabel: "a***@example.com"
    });
    const [block] = buildBlocksFromResult("getTotalSentToCounterparty", result);
    const label = (block as { items: Array<{ label: { text: string } }> }).items[0]
      .label.text;
    expect(label).toBe("Sent to alice@example.com");
  });

  it("still prefers a human display name when present", () => {
    const result = makeResult("getTotalSentToCounterparty", "ok", {
      amount: 250,
      recordCount: 3,
      displayName: "Alice Smith",
      counterpartyEmail: "alice@example.com",
      maskedLabel: "a***@example.com"
    });
    const [block] = buildBlocksFromResult("getTotalSentToCounterparty", result);
    const label = (block as { items: Array<{ label: { text: string } }> }).items[0]
      .label.text;
    expect(label).toBe("Sent to Alice Smith");
  });
});
```

- [ ] **Step 2: Run the test to verify it fails**

Run (from `server/`): `npm test -- src/ai/v2/__tests__/blocks.test.ts`
Expected: FAIL - the first new test gets `Sent to a***@example.com` (masked wins today).

- [ ] **Step 3: Flip the label preference**

In `server/src/ai/v2/blocks.ts`, change the counterparty label line (currently lines 127-128):

```typescript
        const counterparty =
          meta.displayName ?? meta.maskedLabel ?? meta.counterpartyEmail ?? "this counterparty";
```

to prefer the real email over the masked label (cards are user-facing):

```typescript
        const counterparty =
          meta.displayName ?? meta.counterpartyEmail ?? meta.maskedLabel ?? "this counterparty";
```

- [ ] **Step 4: Run the test to verify it passes**

Run (from `server/`): `npm test -- src/ai/v2/__tests__/blocks.test.ts`
Expected: PASS - both new tests green and the existing block tests unchanged.

- [ ] **Step 5: Type-check**

Run (from `server/`): `npm run build`
Expected: PASS - `tsc` exits 0.

- [ ] **Step 6: Commit**

```bash
git add server/src/ai/v2/blocks.ts server/src/ai/v2/__tests__/blocks.test.ts
git commit -m "feat(ai): show real counterparty email on totals card"
```

---

## Deferred (out of scope for this plan)

- **Truly masking the LLM surface.** The model already reads real emails in two places today - the `[KNOWN COUNTERPARTIES]` list in the system prompt (`prompt.ts`, rendered `label -> realEmail`) and the `[data]` JSON in `renderToolResult` (`toolContext.ts`, which includes `counterpartyEmail`). So "masked for the LLM" is only half-true regardless of this plan. Making it real needs opaque counterparty handles the tools can resolve, which is a separate design. Filed as a Todoist suggestion.
- **`transaction_list` card names.** Those render `tx.counterpartyLabel` from per-transaction metadata, which has no real email attached to unmask from. Left masked here; revisit if users report it. The prose (Tasks 1-3) and totals card (Task 4) cover the reported pain.

## Self-Review

- **Spec coverage.** The task is "emails should not be masked to the user; only for the LLM." User-facing surfaces are the streamed prose (Task 3), the final message (Task 3), and the totals card (Task 4); the map that makes unmasking possible is Tasks 1-2. The LLM/store side is untouched by construction, so the "only for the LLM" half holds for everything this plan ships. The one place the LLM is NOT actually masked today is called out under Deferred and filed as a suggestion.
- **Placeholder scan.** Every code step shows complete code; every run step gives an exact command and expected result. No TBD/TODO/"handle edge cases".
- **Type consistency.** `buildUnmaskMap` / `unmaskText` / `createStreamingUnmasker` signatures are identical across Task 1 (definition), Task 3 (use), and the tests. `V2TurnOutcome.counterpartyLabels` is `Array<{ maskedLabel: string; email: string }>` in Task 2 (definition), Task 2's capture push, and Task 3's map build. `CounterpartyRef` fields used (`email`, `maskedLabel`) match `state.ts:536`. The token envelope `{ event: "token"; data: { text } }` matches `V2SseEvent` in `streamEvents.ts`.
