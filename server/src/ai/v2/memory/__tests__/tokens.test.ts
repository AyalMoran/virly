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
