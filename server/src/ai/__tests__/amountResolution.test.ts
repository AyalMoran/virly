

import {
  classifyAmountReference,
  parseAmountExpression,
  resolveContextualAmount
} from "../amountResolution.js";
import { createEmptyCounterpartyMemory } from "../counterpartyMemory.js";
import type {
  CounterpartyMemory,
  PendingConfirmationMemory
} from "../state.js";

function pending(amount: number): PendingConfirmationMemory {
  return {
    confirmationId: "pending-1",
    type: "transfer",
    status: "pending",
    createdAt: new Date().toISOString(),
    expiresAt: new Date(Date.now() + 600000).toISOString(),
    recipientEmail: "sga@thunder.com",
    amount,
    currency: "ILS",
    turnCreated: 2,
    version: 1
  };
}

function memoryWithPending(amount: number): CounterpartyMemory {
  return {
    ...createEmptyCounterpartyMemory(),
    pendingConfirmation: pending(amount)
  };
}

test("parseAmountExpression recognizes arithmetic and discourse references", () => {
  expect(parseAmountExpression("double it")).toStrictEqual({
    base: "pending_amount",
    op: "mul",
    operand: 2
  });
  expect(parseAmountExpression("כפול שתיים")).toStrictEqual({
    base: "pending_amount",
    op: "mul",
    operand: 2
  });
  expect(parseAmountExpression("half of it")).toStrictEqual({
    base: "pending_amount",
    op: "div",
    operand: 2
  });
  expect(parseAmountExpression("×3")).toStrictEqual({
    base: "pending_amount",
    op: "mul",
    operand: 3
  });
  expect(parseAmountExpression("the amount we discussed")).toStrictEqual({
    base: "discussed_amount"
  });
  expect(parseAmountExpression("את הסכום שדיברנו עליו")).toStrictEqual({
    base: "discussed_amount"
  });
});

test("parseAmountExpression leaves the legacy contextual vocabulary alone", () => {
  // These remain owned by classifyAmountReference.
  expect(parseAmountExpression("same amount")).toBeNull();
  expect(parseAmountExpression("that amount")).toBeNull();
  expect(parseAmountExpression("what he sent me")).toBeNull();
  expect(parseAmountExpression("אותו סכום")).toBeNull();
  expect(classifyAmountReference("same amount")).toBe("last_pending_transfer");
  expect(classifyAmountReference("that amount")).toBe("last_answer_total");
});

test("resolveContextualAmount doubles the active pending amount", async () => {
  const result = await resolveContextualAmount({
    userId: "507f1f77bcf86cd799439011",
    conversationId: "double-pending",
    transferDraft: { amountReferenceText: "double it" },
    counterpartyMemory: memoryWithPending(62.41)
  });

  expect(result.status).toBe("resolved");
  expect(result.status === "resolved" ? result.amount.amount : 0).toBe(124.82);
  expect(
    result.status === "resolved" ? result.amount.source : undefined
  ).toBe("pending_confirmation");
});

test("resolveContextualAmount halves the active pending amount", async () => {
  const result = await resolveContextualAmount({
    userId: "507f1f77bcf86cd799439011",
    conversationId: "half-pending",
    transferDraft: { amountReferenceText: "half" },
    counterpartyMemory: memoryWithPending(62.41)
  });

  expect(result.status).toBe("resolved");
  expect(result.status === "resolved" ? result.amount.amount : 0).toBe(31.21);
});

test("resolveContextualAmount resolves the discussed amount from the salient total", async () => {
  const memory: CounterpartyMemory = {
    ...createEmptyCounterpartyMemory(),
    entities: [
      {
        id: "total:received:sga@thunder.com",
        type: "total",
        turnIntroduced: 1,
        turnLastReferenced: 1,
        source: "tool_result",
        confidence: "high",
        counterpartyEmail: "sga@thunder.com",
        direction: "received",
        amount: 62.41,
        currency: "ILS",
        aliases: []
      }
    ]
  };

  const result = await resolveContextualAmount({
    userId: "507f1f77bcf86cd799439011",
    conversationId: "discussed-amount",
    transferDraft: { amountReferenceText: "the amount we discussed" },
    counterpartyMemory: memory
  });

  expect(result.status).toBe("resolved");
  expect(result.status === "resolved" ? result.amount.amount : 0).toBe(62.41);
  expect(
    result.status === "resolved" ? result.amount.source : undefined
  ).toBe("discussed_amount");
});

test("resolveContextualAmount cannot double a pending amount that is absent", async () => {
  const result = await resolveContextualAmount({
    userId: "507f1f77bcf86cd799439011",
    conversationId: "double-no-pending",
    transferDraft: { amountReferenceText: "double it" },
    counterpartyMemory: createEmptyCounterpartyMemory()
  });

  expect(result.status).toBe("unresolved");
  expect(
    result.status === "unresolved" ? result.reason : undefined
  ).toBe("no_pending_amount");
});
