import { prepareNode } from "../prepare.js";
import type { LangGraphRunnableConfig } from "@langchain/langgraph";
import type { V2AgentStateType } from "../../state.js";
import type { V2Configurable } from "../../toolContext.js";

function makeConfig(configurable?: Partial<V2Configurable>): LangGraphRunnableConfig {
  const base: Partial<V2Configurable> = {
    userId: "user-1",
    conversationId: "conv-1",
    assistantId: "oshri",
    message: "test",
    now: new Date(),
    timezone: "Asia/Jerusalem",
    locale: "en",
    executors: {},
    turnOutcome: { uiBlocks: [] },
    knownCounterparties: []
  };
  return {
    configurable: configurable !== undefined ? configurable : base
  } as unknown as LangGraphRunnableConfig;
}

const emptyState = { messages: [] } as unknown as V2AgentStateType;

describe("prepareNode", () => {
  test("returns an empty partial state when identity is valid", async () => {
    const result = await prepareNode(emptyState, makeConfig());
    expect(result).toEqual({});
  });

  test("is a pass-through — does not mutate state fields", async () => {
    const result = await prepareNode(emptyState, makeConfig());
    expect(Object.keys(result)).toHaveLength(0);
  });

  test("throws when userId is missing from configurable", async () => {
    const config = makeConfig({ conversationId: "conv-1" });
    await expect(prepareNode(emptyState, config)).rejects.toThrow(
      "v2 tool invoked without userId/conversationId in config"
    );
  });

  test("throws when conversationId is missing from configurable", async () => {
    const config = makeConfig({ userId: "user-1" });
    await expect(prepareNode(emptyState, config)).rejects.toThrow(
      "v2 tool invoked without userId/conversationId in config"
    );
  });

  test("throws when configurable is entirely absent", async () => {
    const config = {} as LangGraphRunnableConfig;
    await expect(prepareNode(emptyState, config)).rejects.toThrow();
  });
});
