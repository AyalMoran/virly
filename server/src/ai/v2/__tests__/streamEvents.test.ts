import { AIMessageChunk } from "@langchain/core/messages";

import { mapStreamChunk } from "../streamEvents.js";

describe("v2 stream chunk -> SSE mapping", () => {
  test("messages mode yields token events for text deltas", () => {
    const events = mapStreamChunk("messages", [new AIMessageChunk("hel"), {}]);
    expect(events).toStrictEqual([{ event: "token", data: { text: "hel" } }]);
  });

  test("messages mode with empty content yields nothing", () => {
    const events = mapStreamChunk("messages", [new AIMessageChunk(""), {}]);
    expect(events).toStrictEqual([]);
  });

  test("custom status events map to status SSE", () => {
    const events = mapStreamChunk("custom", { kind: "status", label: "Checking your balance" });
    expect(events).toStrictEqual([{ event: "status", data: { label: "Checking your balance" } }]);
  });

  test("custom block events map to block SSE", () => {
    const block = { id: "b1", type: "account_summary" };
    const events = mapStreamChunk("custom", { kind: "block", block });
    expect(events).toStrictEqual([{ event: "block", data: { block } }]);
  });

  test("updates mode is not a client SSE event", () => {
    expect(mapStreamChunk("updates", { finalize: { responseMessage: "x" } })).toStrictEqual([]);
  });
});
