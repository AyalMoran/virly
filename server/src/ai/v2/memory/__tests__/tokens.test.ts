import { AIMessage, HumanMessage } from "@langchain/core/messages";

import {
  approximateTokens,
  countMessageTokens,
  messageTokens
} from "../tokens.js";

describe("v2 token counter", () => {
  test("approximateTokens is ~1 token per 4 chars, rounded up", () => {
    expect(approximateTokens("")).toBe(0);
    expect(approximateTokens("abcd")).toBe(1);
    expect(approximateTokens("abcde")).toBe(2);
  });

  test("messageTokens adds per-message overhead to content tokens", () => {
    // 8 content chars -> 2 content tokens, + 4 overhead = 6
    expect(messageTokens(new HumanMessage("12345678"))).toBe(6);
  });

  test("countMessageTokens sums across the thread", () => {
    const messages = [new HumanMessage("12345678"), new AIMessage("12345678")];
    expect(countMessageTokens(messages)).toBe(12);
  });

  test("handles array (multi-part) message content without throwing", () => {
    const message = new HumanMessage({
      content: [{ type: "text", text: "abcd" }]
    });
    // 4 chars -> 1 content token + 4 overhead = 5
    expect(messageTokens(message)).toBe(5);
  });
});
