import { Command, END, MemorySaver, START, StateGraph } from "@langchain/langgraph";

import { DEFAULT_ASSISTANT_ID } from "../../assistants.js";
import type { TransferConfirmation } from "../../state.js";
import { executeTransferNode } from "../nodes/executeTransfer.js";
import { transferGateNode } from "../nodes/transferGate.js";
import { V2AgentState } from "../state.js";
import type { V2Configurable } from "../toolContext.js";

function fakeCard(): TransferConfirmation {
  return {
    id: "pending-transfer-1",
    version: 1,
    type: "transfer",
    status: "pending",
    recipientEmail: "dan@example.com",
    recipientFirstName: "Dan",
    recipientLastName: "Levi",
    amount: 100,
    currency: "ILS",
    recipient: {
      email: "dan@example.com",
      firstName: "Dan",
      lastName: "Levi",
      displayName: "Dan Levi",
      verified: true
    },
    amountDetails: { value: 100, currency: "ILS", formatted: "₪100" },
    reason: null,
    warnings: [],
    expiresAt: new Date(Date.now() + 600000).toISOString(),
    confirmAction: { method: "POST", path: "/api/ai/confirmations/pending-transfer-1", body: { action: "confirm", version: 1 } },
    denyAction: { method: "POST", path: "/api/ai/confirmations/pending-transfer-1", body: { action: "deny", version: 1 } }
  };
}

function buildGateGraph(checkpointer: MemorySaver, calls: string[]) {
  return new StateGraph(V2AgentState)
    .addNode("seed", () => ({ confirmation: fakeCard() }))
    .addNode("transferGate", transferGateNode, { ends: ["executeTransfer", "persist"] })
    .addNode("executeTransfer", executeTransferNode)
    .addNode("persist", () => ({}))
    .addEdge(START, "seed")
    .addEdge("seed", "transferGate")
    .addEdge("executeTransfer", "persist")
    .addEdge("persist", END)
    .compile({ checkpointer });
}

function configurable(calls: string[]): Partial<V2Configurable> {
  return {
    userId: "user-1",
    conversationId: "conv-1",
    assistantId: DEFAULT_ASSISTANT_ID,
    message: "",
    now: new Date(),
    timezone: "Asia/Jerusalem",
    locale: "en",
    executors: {},
    turnOutcome: { uiBlocks: [] },
    knownCounterparties: [],
    transferResponseService: async (input) => {
      calls.push(`${input.action}:${input.pendingTransferId}:${input.version}`);
      return { status: input.action === "confirm" ? "confirmed" : "denied" };
    }
  };
}

describe("v2 HITL transfer gate (interrupt / Command resume)", () => {
  test("prepared card pauses at the gate (interrupt) without executing", async () => {
    const checkpointer = new MemorySaver();
    const calls: string[] = [];
    const graph = buildGateGraph(checkpointer, calls);
    const config = { configurable: { ...configurable(calls), thread_id: "conv-1" } };

    const out = (await graph.invoke({ messages: [] }, config)) as {
      __interrupt__?: unknown[];
      confirmation?: TransferConfirmation;
    };

    const interrupts = out.__interrupt__;
    expect(Array.isArray(interrupts) && interrupts.length > 0).toBeTruthy();
    expect(out.confirmation?.id).toBe("pending-transfer-1");
    expect(calls.length).toBe(0);
  });

  test("resume(confirm) executes exactly once via the backend service", async () => {
    const checkpointer = new MemorySaver();
    const calls: string[] = [];
    const graph = buildGateGraph(checkpointer, calls);
    const config = { configurable: { ...configurable(calls), thread_id: "conv-confirm" } };

    await graph.invoke({ messages: [] }, { configurable: { ...config.configurable } });
    const resumed = (await graph.invoke(
      new Command({ resume: { action: "confirm", version: 1 } }),
      { configurable: { ...config.configurable } }
    )) as { transferResult?: { status?: string } };

    expect(calls).toStrictEqual(["confirm:pending-transfer-1:1"]);
    expect(resumed.transferResult?.status).toBe("confirmed");
  });

  test("resume(deny) executes nothing", async () => {
    const checkpointer = new MemorySaver();
    const calls: string[] = [];
    const graph = buildGateGraph(checkpointer, calls);
    const config = { configurable: { ...configurable(calls), thread_id: "conv-deny" } };

    await graph.invoke({ messages: [] }, { configurable: { ...config.configurable } });
    const resumed = (await graph.invoke(
      new Command({ resume: { action: "deny", version: 1 } }),
      { configurable: { ...config.configurable } }
    )) as { transferResult?: unknown; confirmation?: unknown };

    expect(calls.length).toBe(0);
    expect(resumed.transferResult).toBeUndefined();
  });
});
