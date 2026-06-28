// Created: 2026-06-15

import assert from "node:assert/strict";
import { describe, test } from "node:test";

import {
  AIMessage,
  AIMessageChunk,
  HumanMessage,
  ToolMessage
} from "@langchain/core/messages";

import { aiToolCalls, isAiMessage } from "../messages.js";
import { finalizeNode } from "../nodes/finalize.js";

describe("v2 message-type helpers (streaming-robust)", () => {
  test("isAiMessage matches AIMessage AND AIMessageChunk, not others", () => {
    assert.equal(isAiMessage(new AIMessage("hi")), true);
    // The streaming case that instanceof AIMessage misses:
    assert.equal(isAiMessage(new AIMessageChunk("hi")), true);
    assert.equal(isAiMessage(new HumanMessage("hi")), false);
    assert.equal(
      isAiMessage(new ToolMessage({ content: "x", tool_call_id: "t" })),
      false
    );
    assert.equal(isAiMessage(undefined), false);
  });

  test("aiToolCalls reads tool calls off a streamed AIMessageChunk", () => {
    const chunk = new AIMessageChunk({
      content: "",
      tool_calls: [{ name: "getBalance", args: {}, id: "call_1" }]
    });
    assert.equal(aiToolCalls(chunk).length, 1);
    assert.equal(aiToolCalls(new HumanMessage("hi")).length, 0);
  });
});

describe("finalize extracts the reply from a streamed AIMessageChunk", () => {
  const config = {
    configurable: {
      userId: "u",
      conversationId: "c",
      turnOutcome: { uiBlocks: [] }
    }
  };

  test("AIMessageChunk final answer becomes responseMessage (the streaming bug)", async () => {
    const state = {
      messages: [
        new HumanMessage("what's my balance?"),
        new AIMessageChunk("Your balance is ₪1,840.50.")
      ]
    };
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const out = await finalizeNode(state as any, config as any);
    assert.equal(out.responseMessage, "Your balance is ₪1,840.50.");
  });

  test("plain AIMessage still works (non-streaming path)", async () => {
    const state = {
      messages: [
        new HumanMessage("what's my balance?"),
        new AIMessage("Your balance is ₪1,840.50.")
      ]
    };
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const out = await finalizeNode(state as any, config as any);
    assert.equal(out.responseMessage, "Your balance is ₪1,840.50.");
  });
});
