import assert from "node:assert/strict";
import { describe, test } from "node:test";

import { AIMessageChunk } from "@langchain/core/messages";

import { mapStreamChunk } from "./streamEvents.js";

describe("v2 stream chunk -> SSE mapping", () => {
  test("messages mode yields token events for text deltas", () => {
    const events = mapStreamChunk("messages", [new AIMessageChunk("hel"), {}]);
    assert.deepEqual(events, [{ event: "token", data: { text: "hel" } }]);
  });

  test("messages mode with empty content yields nothing", () => {
    const events = mapStreamChunk("messages", [new AIMessageChunk(""), {}]);
    assert.deepEqual(events, []);
  });

  test("custom status events map to status SSE", () => {
    const events = mapStreamChunk("custom", { kind: "status", label: "Checking your balance" });
    assert.deepEqual(events, [{ event: "status", data: { label: "Checking your balance" } }]);
  });

  test("custom block events map to block SSE", () => {
    const block = { id: "b1", type: "account_summary" };
    const events = mapStreamChunk("custom", { kind: "block", block });
    assert.deepEqual(events, [{ event: "block", data: { block } }]);
  });

  test("updates mode is not a client SSE event", () => {
    assert.deepEqual(mapStreamChunk("updates", { finalize: { responseMessage: "x" } }), []);
  });
});
