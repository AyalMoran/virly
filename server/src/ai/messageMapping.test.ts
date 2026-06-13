

import assert from "node:assert/strict";
import test from "node:test";

import {
  AIMessage,
  HumanMessage,
  SystemMessage,
  ToolMessage
} from "@langchain/core/messages";

import { fromStored, toProviderMessages, toStored } from "./messageMapping.js";
import type { StoredChatMessage } from "./state.js";

test("fromStored maps user to HumanMessage and assistant to AIMessage", () => {
  const messages = fromStored([
    { role: "user", content: "a" },
    { role: "assistant", content: "b" }
  ]);

  assert.equal(messages.length, 2);
  assert.equal(messages[0].getType(), "human");
  assert.equal(messages[1].getType(), "ai");
  assert.equal(String(messages[0].content), "a");
  assert.equal(String(messages[1].content), "b");
});

test("toStored(fromStored(...)) round-trips role and content", () => {
  const input: StoredChatMessage[] = [
    { role: "user", content: "a" },
    { role: "assistant", content: "b" },
    { role: "user", content: "c" }
  ];

  const roundTripped = toStored(fromStored(input));

  assert.deepEqual(
    roundTripped,
    input.map((message) => ({ role: message.role, content: message.content }))
  );
});

test("toStored drops system and tool messages (not persisted)", () => {
  const stored = toStored([
    new SystemMessage("policy"),
    new HumanMessage("hello"),
    new ToolMessage({ content: "tool output", tool_call_id: "call-1" }),
    new AIMessage("hi there")
  ]);

  assert.deepEqual(stored, [
    { role: "user", content: "hello" },
    { role: "assistant", content: "hi there" }
  ]);
});

test("toProviderMessages produces the same {role,content} projection as toStored", () => {
  const messages = [new HumanMessage("question"), new AIMessage("answer")];

  assert.deepEqual(toProviderMessages(messages), toStored(messages));
  assert.deepEqual(toProviderMessages(messages), [
    { role: "user", content: "question" },
    { role: "assistant", content: "answer" }
  ]);
});

test("toStored coerces non-string content to a safe string (R4 guard)", () => {
  const stored = toStored([
    new AIMessage({ content: [{ type: "text", text: "block" }] as never })
  ]);

  assert.equal(stored.length, 1);
  assert.equal(stored[0].role, "assistant");
  assert.equal(typeof stored[0].content, "string");
});
