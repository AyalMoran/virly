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
    expect(isAiMessage(new AIMessage("hi"))).toBe(true);
    // The streaming case that instanceof AIMessage misses:
    expect(isAiMessage(new AIMessageChunk("hi"))).toBe(true);
    expect(isAiMessage(new HumanMessage("hi"))).toBe(false);
    expect(
      isAiMessage(new ToolMessage({ content: "x", tool_call_id: "t" }))
    ).toBe(false);
    expect(isAiMessage(undefined)).toBe(false);
  });

  test("aiToolCalls reads tool calls off a streamed AIMessageChunk", () => {
    const chunk = new AIMessageChunk({
      content: "",
      tool_calls: [{ name: "getBalance", args: {}, id: "call_1" }]
    });
    expect(aiToolCalls(chunk).length).toBe(1);
    expect(aiToolCalls(new HumanMessage("hi")).length).toBe(0);
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
    expect(out.responseMessage).toBe("Your balance is ₪1,840.50.");
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
    expect(out.responseMessage).toBe("Your balance is ₪1,840.50.");
  });
});
