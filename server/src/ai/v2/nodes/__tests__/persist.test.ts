import { persistNode } from "../persist.js";
import type { LangGraphRunnableConfig } from "@langchain/langgraph";
import type { V2AgentStateType } from "../../state.js";
import { AIMessage } from "@langchain/core/messages";

const anyConfig = {} as LangGraphRunnableConfig;

describe("persistNode", () => {
  test("returns an empty object (pure pass-through)", async () => {
    const state = { messages: [] } as unknown as V2AgentStateType;
    const result = await persistNode(state, anyConfig);
    expect(result).toEqual({});
  });

  test("has no side effects: calling twice returns the same empty result", async () => {
    const state = { messages: [new AIMessage("hi")] } as unknown as V2AgentStateType;
    const r1 = await persistNode(state, anyConfig);
    const r2 = await persistNode(state, anyConfig);
    expect(r1).toEqual({});
    expect(r2).toEqual({});
  });

  test("returns an empty object regardless of state content", async () => {
    const states: V2AgentStateType[] = [
      { messages: [] } as unknown as V2AgentStateType,
      {
        messages: [new AIMessage("hello")],
        responseMessage: "hello",
        confirmation: undefined,
        clarification: undefined
      } as unknown as V2AgentStateType
    ];
    for (const state of states) {
      expect(await persistNode(state, anyConfig)).toEqual({});
    }
  });
});
