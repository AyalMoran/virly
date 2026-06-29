

import {
  AIMessage,
  HumanMessage,
  SystemMessage,
  ToolMessage
} from "@langchain/core/messages";

import { fromStored, toProviderMessages, toStored } from "../messageMapping.js";
import type { StoredChatMessage } from "../state.js";

test("fromStored maps user to HumanMessage and assistant to AIMessage", () => {
  const messages = fromStored([
    { role: "user", content: "a" },
    { role: "assistant", content: "b" }
  ]);

  expect(messages.length).toBe(2);
  expect(messages[0].getType()).toBe("human");
  expect(messages[1].getType()).toBe("ai");
  expect(String(messages[0].content)).toBe("a");
  expect(String(messages[1].content)).toBe("b");
});

test("toStored(fromStored(...)) round-trips role and content", () => {
  const input: StoredChatMessage[] = [
    { role: "user", content: "a" },
    { role: "assistant", content: "b" },
    { role: "user", content: "c" }
  ];

  const roundTripped = toStored(fromStored(input));

  expect(roundTripped).toStrictEqual(
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

  expect(stored).toStrictEqual([
    { role: "user", content: "hello" },
    { role: "assistant", content: "hi there" }
  ]);
});

test("toProviderMessages produces the same {role,content} projection as toStored", () => {
  const messages = [new HumanMessage("question"), new AIMessage("answer")];

  expect(toProviderMessages(messages)).toStrictEqual(toStored(messages));
  expect(toProviderMessages(messages)).toStrictEqual([
    { role: "user", content: "question" },
    { role: "assistant", content: "answer" }
  ]);
});

test("toStored coerces non-string content to a safe string (R4 guard)", () => {
  const stored = toStored([
    new AIMessage({ content: [{ type: "text", text: "block" }] as never })
  ]);

  expect(stored.length).toBe(1);
  expect(stored[0].role).toBe("assistant");
  expect(typeof stored[0].content).toBe("string");
});
