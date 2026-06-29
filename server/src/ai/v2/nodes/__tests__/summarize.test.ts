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
