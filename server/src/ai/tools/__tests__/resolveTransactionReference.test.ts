import { resolveTransactionReference } from "../resolveTransactionReference.js";
import type { ToolContext, ConversationEntity } from "../../state.js";

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function makeEntity(
  transactionId: string,
  amount: number,
  direction: "sent" | "received" = "sent",
  turnLastReferenced = 1,
  turnIntroduced = 1
): ConversationEntity {
  return {
    id: transactionId,
    type: "transaction",
    transactionId,
    turnIntroduced,
    turnLastReferenced,
    source: "tool_result",
    confidence: "high",
    displayName: `tx ${transactionId}`,
    amount,
    currency: "ILS",
    aliases: direction === "received" ? [`received ${amount}`] : [`sent ${amount}`]
  };
}

function makeContext(
  message: string,
  entities: ConversationEntity[] = [],
  extra: Partial<ToolContext> = {}
): ToolContext {
  return {
    userId: "user1",
    conversationId: "conv1",
    message,
    counterpartyMemory: {
      turn: 1,
      mentionedCounterparties: [],
      entities
    },
    ...extra
  };
}

// ---------------------------------------------------------------------------
// empty state
// ---------------------------------------------------------------------------

describe("resolveTransactionReference - no candidates", () => {
  it("returns unresolved when no entities and no clarification", async () => {
    const ctx = makeContext("what was the first one?");
    const result = await resolveTransactionReference(ctx);
    expect(result.status).toBe("empty");
    const data = result.data as { status: string };
    expect(data.status).toBe("unresolved");
  });
});

// ---------------------------------------------------------------------------
// ordinal resolution
// ---------------------------------------------------------------------------

describe("resolveTransactionReference - ordinal", () => {
  it("resolves by 'first' keyword", async () => {
    const ctx = makeContext("show me the first one", [makeEntity("tx1", 100), makeEntity("tx2", 200)]);
    const result = await resolveTransactionReference(ctx);
    expect(result.status).toBe("ok");
    const data = result.data as { status: string; transactionId: string };
    expect(data.status).toBe("resolved");
    expect(data.transactionId).toBe("tx1");
  });

  it("resolves by 'second' keyword", async () => {
    const ctx = makeContext("what about the second one", [makeEntity("tx1", 100), makeEntity("tx2", 200)]);
    const result = await resolveTransactionReference(ctx);
    const data = result.data as { status: string; transactionId: string };
    expect(data.status).toBe("resolved");
    expect(data.transactionId).toBe("tx2");
  });

  it("resolves by '1st' numeric ordinal", async () => {
    const ctx = makeContext("the 1st transaction", [makeEntity("txA", 50)]);
    const result = await resolveTransactionReference(ctx);
    const data = result.data as { status: string; transactionId: string };
    expect(data.status).toBe("resolved");
    expect(data.transactionId).toBe("txA");
  });

  it("returns unresolved when ordinal is out of range", async () => {
    const ctx = makeContext("show the fifth one", [makeEntity("tx1", 100), makeEntity("tx2", 200)]);
    const result = await resolveTransactionReference(ctx);
    expect(result.status).toBe("empty");
    const data = result.data as { status: string };
    expect(data.status).toBe("unresolved");
  });

  it("prefers slot ordinal over message parsing", async () => {
    const entities = [
      makeEntity("tx1", 100),
      makeEntity("tx2", 200),
      makeEntity("tx3", 300)
    ];
    const ctx = makeContext("the first one", entities, {
      requestSlots: {
        intent: "transaction_detail",
        ordinalReference: { rawText: "third", ordinal: 3 }
      }
    });
    const result = await resolveTransactionReference(ctx);
    const data = result.data as { status: string; transactionId: string };
    expect(data.status).toBe("resolved");
    expect(data.transactionId).toBe("tx3");
  });
});

// ---------------------------------------------------------------------------
// exact amount resolution
// ---------------------------------------------------------------------------

describe("resolveTransactionReference - exact amount", () => {
  it("resolves when exactly one transaction matches the amount", async () => {
    const ctx = makeContext("the 150 ILS one", [makeEntity("tx1", 100), makeEntity("tx2", 150)]);
    const result = await resolveTransactionReference(ctx);
    const data = result.data as { status: string; transactionId: string };
    expect(data.status).toBe("resolved");
    expect(data.transactionId).toBe("tx2");
  });

  it("returns ambiguous when multiple transactions match the amount", async () => {
    const ctx = makeContext("the 100 ILS transaction", [
      makeEntity("tx1", 100),
      makeEntity("tx2", 100)
    ]);
    const result = await resolveTransactionReference(ctx);
    const data = result.data as { status: string };
    expect(data.status).toBe("ambiguous");
  });
});

// ---------------------------------------------------------------------------
// clarification candidates
// ---------------------------------------------------------------------------

describe("resolveTransactionReference - clarification", () => {
  it("uses clarification candidates when type is 'transaction'", async () => {
    const ctx = makeContext("the first one", [], {
      clarification: {
        reason: "ambiguous_transaction",
        message: "Which transaction?",
        expectedReplyType: "transaction",
        options: [
          { id: "txClar1", label: "sent 100 ILS", value: "txClar1" },
          { id: "txClar2", label: "received 200 ILS", value: "txClar2" }
        ]
      }
    });
    const result = await resolveTransactionReference(ctx);
    const data = result.data as { status: string; transactionId: string };
    expect(data.status).toBe("resolved");
    expect(data.transactionId).toBe("txClar1");
  });

  it("ignores clarification when expectedReplyType is not 'transaction'", async () => {
    const ctx = makeContext("show recent", [], {
      clarification: {
        reason: "ambiguous_recipient",
        message: "Which person?",
        expectedReplyType: "recipient",
        options: [{ id: "some-id", label: "option", value: "val" }]
      }
    });
    const result = await resolveTransactionReference(ctx);
    expect(result.status).toBe("empty");
  });
});

// ---------------------------------------------------------------------------
// unresolvable message
// ---------------------------------------------------------------------------

describe("resolveTransactionReference - fallback unresolved", () => {
  it("returns unresolved when message has no amount or ordinal", async () => {
    const ctx = makeContext("show me that transaction", [
      makeEntity("tx1", 100),
      makeEntity("tx2", 200)
    ]);
    const result = await resolveTransactionReference(ctx);
    expect(result.status).toBe("empty");
    const data = result.data as { status: string; candidates: unknown[] };
    expect(data.status).toBe("unresolved");
    expect(data.candidates.length).toBeGreaterThan(0);
  });
});
