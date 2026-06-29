import { executeTransferNode } from "../executeTransfer.js";
import { DEFAULT_ASSISTANT_ID } from "../../../assistants.js";
import type { LangGraphRunnableConfig } from "@langchain/langgraph";
import type { V2AgentStateType } from "../../state.js";

function configWith(respond: unknown): LangGraphRunnableConfig {
  return {
    configurable: {
      userId: "u1",
      conversationId: "c1",
      assistantId: DEFAULT_ASSISTANT_ID,
      message: "",
      now: new Date(),
      timezone: "Asia/Jerusalem",
      locale: "en",
      executors: {},
      turnOutcome: { uiBlocks: [] },
      knownCounterparties: [],
      transferResponseService: respond
    }
  } as unknown as LangGraphRunnableConfig;
}

const state = {
  confirmation: { id: "pt1", amount: 450, recipientEmail: "dan@example.com", version: 1 },
  resumeMeta: { version: 1, idempotencyKey: "k" }
} as unknown as V2AgentStateType;

describe("executeTransferNode", () => {
  test("a held result yields a 'check your email' message, not 'Done'", async () => {
    const respond = async () => ({
      status: "held",
      heldId: "h1",
      level: "high",
      reasons: ["new recipient"],
      expiresAt: new Date().toISOString(),
      message: "held"
    });
    const out = await executeTransferNode(state, configWith(respond));
    expect((out.transferResult as { status: string }).status).toBe("held");
    expect(String(out.responseMessage)).toMatch(/held for review|check your email/i);
    expect(String(out.responseMessage)).not.toMatch(/on its way/i);
  });

  test("a confirmed result yields the success message", async () => {
    const respond = async () => ({
      status: "confirmed",
      message: "ok",
      newBalance: 100,
      transaction: { id: "t1" }
    });
    const out = await executeTransferNode(state, configWith(respond));
    expect((out.transferResult as { status: string }).status).toBe("confirmed");
    expect(String(out.responseMessage)).toMatch(/on its way/i);
  });
});
