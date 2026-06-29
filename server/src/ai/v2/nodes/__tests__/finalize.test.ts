import { messageText, finalizeNode } from "../finalize.js";
import { AIMessage, HumanMessage } from "@langchain/core/messages";
import type { LangGraphRunnableConfig } from "@langchain/langgraph";
import type { V2AgentStateType } from "../../state.js";
import type { V2Configurable, V2TurnOutcome } from "../../toolContext.js";

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function makeConfig(turnOutcome: Partial<V2TurnOutcome> = {}): LangGraphRunnableConfig {
  const outcome: V2TurnOutcome = { uiBlocks: [], ...turnOutcome };
  const configurable: Partial<V2Configurable> = {
    userId: "u1",
    conversationId: "c1",
    turnOutcome: outcome
  };
  return { configurable } as unknown as LangGraphRunnableConfig;
}

function makeState(messages: V2AgentStateType["messages"]): V2AgentStateType {
  return { messages } as unknown as V2AgentStateType;
}

// ---------------------------------------------------------------------------
// messageText
// ---------------------------------------------------------------------------

describe("messageText", () => {
  test("returns empty string for undefined message", () => {
    expect(messageText(undefined)).toBe("");
  });

  test("returns string content directly", () => {
    const msg = new AIMessage("Hello there!");
    expect(messageText(msg)).toBe("Hello there!");
  });

  test("returns empty string for AIMessage with empty string content", () => {
    const msg = new AIMessage("");
    expect(messageText(msg)).toBe("");
  });

  test("joins array parts when content is an array of strings", () => {
    const msg = new AIMessage({ content: ["Part one", " Part two"] } as never);
    expect(messageText(msg)).toBe("Part one Part two");
  });

  test("extracts text from content parts with a 'text' property", () => {
    const msg = new AIMessage({
      content: [{ type: "text", text: "extracted text" }]
    });
    expect(messageText(msg)).toBe("extracted text");
  });

  test("skips parts that have no 'text' field, contributing empty string", () => {
    const msg = new AIMessage({
      content: [
        { type: "tool_use", id: "tc1", name: "getBalance", input: {} },
        { type: "text", text: " answer" }
      ]
    });
    expect(messageText(msg)).toBe(" answer");
  });

  test("works for HumanMessage with string content", () => {
    const msg = new HumanMessage("user query");
    expect(messageText(msg)).toBe("user query");
  });
});

// ---------------------------------------------------------------------------
// finalizeNode
// ---------------------------------------------------------------------------

describe("finalizeNode", () => {
  test("extracts the last AI message text as responseMessage (trimmed)", async () => {
    const state = makeState([
      new HumanMessage("hi"),
      new AIMessage("  Hello, how can I help?  ")
    ]);
    const result = await finalizeNode(state, makeConfig());
    expect(result.responseMessage).toBe("Hello, how can I help?");
  });

  test("returns empty string when there are no AI messages", async () => {
    const state = makeState([new HumanMessage("hi")]);
    const result = await finalizeNode(state, makeConfig());
    expect(result.responseMessage).toBe("");
  });

  test("picks the LAST AI message when there are multiple AI messages", async () => {
    const state = makeState([
      new AIMessage("First answer"),
      new HumanMessage("follow-up"),
      new AIMessage("Final answer")
    ]);
    const result = await finalizeNode(state, makeConfig());
    expect(result.responseMessage).toBe("Final answer");
  });

  test("copies confirmation from turnOutcome into state", async () => {
    const card = {
      id: "conf-1",
      version: 1,
      type: "transfer" as const,
      status: "pending" as const,
      recipientEmail: "r@example.com",
      recipientFirstName: null,
      recipientLastName: null,
      amount: 100,
      currency: "ILS" as const,
      recipient: {
        email: "r@example.com",
        firstName: null,
        lastName: null,
        displayName: "R",
        verified: false
      },
      amountDetails: { value: 100, currency: "ILS" as const, formatted: "100 ILS" },
      reason: null,
      warnings: [],
      expiresAt: "2026-12-31T00:00:00.000Z",
      confirmAction: {
        method: "POST" as const,
        path: "/confirm",
        body: { action: "confirm" as const, version: 1 }
      },
      denyAction: {
        method: "POST" as const,
        path: "/deny",
        body: { action: "deny" as const, version: 1 }
      }
    };

    const state = makeState([new AIMessage("Transfer prepared.")]);
    const result = await finalizeNode(state, makeConfig({ confirmation: card }));
    expect(result.confirmation).toBe(card);
  });

  test("copies clarification from turnOutcome into state", async () => {
    const clarification = {
      reason: "missing_recipient" as const,
      message: "Who should I send to?",
      expectedReplyType: "recipient" as const
    };
    const state = makeState([new AIMessage("Please clarify.")]);
    const result = await finalizeNode(state, makeConfig({ clarification }));
    expect(result.clarification).toBe(clarification);
  });

  test("copies supersededConfirmationId from turnOutcome into state", async () => {
    const state = makeState([new AIMessage("Updated card.")]);
    const result = await finalizeNode(
      state,
      makeConfig({ supersededConfirmationId: "old-conf-99" })
    );
    expect(result.supersededConfirmationId).toBe("old-conf-99");
  });

  test("returns undefined confirmation when turnOutcome has none", async () => {
    const state = makeState([new AIMessage("No transfer here.")]);
    const result = await finalizeNode(state, makeConfig());
    expect(result.confirmation).toBeUndefined();
    expect(result.clarification).toBeUndefined();
    expect(result.supersededConfirmationId).toBeUndefined();
  });
});
