
import { Annotation, StateGraph } from "@langchain/langgraph";

import { createCheckpointer, createInMemoryCheckpointer } from "../checkpointer.js";

const ThreadState = Annotation.Root({
  turns: Annotation<string[]>({
    reducer: (a, b) => [...(a ?? []), ...(b ?? [])],
    default: () => []
  })
});

function buildCountingGraph(checkpointer: ReturnType<typeof createInMemoryCheckpointer>) {
  return new StateGraph(ThreadState)
    // Pass-through: the input is merged by the appending reducer at __start__,
    // so the node itself must not re-emit turns (that would double-append).
    .addNode("echo", () => ({}))
    .addEdge("__start__", "echo")
    .addEdge("echo", "__end__")
    .compile({ checkpointer });
}

describe("v2 thread checkpointer", () => {
  test("createCheckpointer returns an in-memory saver when no client is supplied", () => {
    const saver = createCheckpointer();
    expect(saver).toBeTruthy();
    expect(typeof saver.getTuple).toBe("function");
    expect(typeof saver.put).toBe("function");
  });

  test("a thread written in turn 1 is restored in turn 2 (same thread_id)", async () => {
    const checkpointer = createInMemoryCheckpointer();
    const graph = buildCountingGraph(checkpointer);
    const config = { configurable: { thread_id: "conv-abc" } };

    await graph.invoke({ turns: ["turn-1"] }, config);
    const second = await graph.invoke({ turns: ["turn-2"] }, config);

    // The checkpointer restored turn 1's state, so the appending reducer has both.
    expect(second.turns).toStrictEqual(["turn-1", "turn-2"]);
  });

  test("different thread_ids do not share state", async () => {
    const checkpointer = createInMemoryCheckpointer();
    const graph = buildCountingGraph(checkpointer);

    await graph.invoke({ turns: ["a"] }, { configurable: { thread_id: "t1" } });
    const other = await graph.invoke(
      { turns: ["b"] },
      { configurable: { thread_id: "t2" } }
    );

    expect(other.turns).toStrictEqual(["b"]);
  });
});
