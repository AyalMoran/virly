import { AIMessage, HumanMessage } from "@langchain/core/messages";
import type { BaseMessage } from "@langchain/core/messages";
import type { ChatOpenAI } from "@langchain/openai";

import {
  foldRollingSummary,
  KEEP_RECENT_MESSAGES,
  SUMMARY_BUDGET_MESSAGES,
  trimToWindow
} from "../summary.js";

function thread(n: number): BaseMessage[] {
  const messages: BaseMessage[] = [];
  for (let i = 0; i < n; i += 1) {
    messages.push(i % 2 === 0 ? new HumanMessage(`u${i}`) : new AIMessage(`a${i}`));
  }
  return messages;
}

let summarizerCalls = 0;
const stubModel = {
  invoke: async () => {
    summarizerCalls += 1;
    return new AIMessage("Earlier: user asked about Dan and Rani totals.");
  }
} as unknown as ChatOpenAI;

describe("v2 rolling summary + trim", () => {
  test("within budget: no summarization, thread unchanged", async () => {
    summarizerCalls = 0;
    const messages = thread(SUMMARY_BUDGET_MESSAGES);
    const result = await foldRollingSummary(messages, "prev", stubModel);
    expect(summarizerCalls).toBe(0);
    expect(result.runningSummary).toBe("prev");
    expect(result.recentMessages.length).toBe(SUMMARY_BUDGET_MESSAGES);
  });

  test("over budget: folds older messages into a summary, keeps recent window", async () => {
    summarizerCalls = 0;
    const messages = thread(SUMMARY_BUDGET_MESSAGES + 10);
    const result = await foldRollingSummary(messages, undefined, stubModel);
    expect(summarizerCalls).toBe(1);
    expect(result.runningSummary ?? "").toMatch(/Dan and Rani/);
    expect(result.recentMessages.length).toBe(KEEP_RECENT_MESSAGES);
    // the recent window is the tail of the thread
    expect(
      (result.recentMessages.at(-1) as AIMessage).content
    ).toBe(messages.at(-1)?.content);
  });

  test("trimToWindow keeps only the last `max` messages", () => {
    const messages = thread(30);
    expect(trimToWindow(messages, 16).length).toBe(16);
    expect(trimToWindow(thread(5), 16).length).toBe(5);
  });
});
