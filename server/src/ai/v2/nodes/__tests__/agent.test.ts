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
    expect(captured.length).toBe(3);
    expect(captured[0] instanceof SystemMessage).toBe(true);
    expect((captured[1] as HumanMessage).content).toBe("recent-2");
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
    expect(system).toMatch(/Dan totals/);
  });
});
