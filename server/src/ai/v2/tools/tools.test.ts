import assert from "node:assert/strict";
import { describe, test } from "node:test";

import { DEFAULT_ASSISTANT_ID } from "../../assistants.js";
import {
  createTransferModificationService,
  createTransferPreparationService
} from "../../evals/support.js";
import { WORLD } from "../../evals/v2/world.js";
import { createV2WorldTools } from "../../evals/v2/worldTools.js";
import type { V2Configurable, V2TurnOutcome } from "../toolContext.js";
import {
  getBalanceTool,
  getTotalsTool,
  findCounterpartyTool,
  searchTransactionsTool,
  getTransactionReceiptTool
} from "./readOnly.js";
import { modifyPendingTransferTool, prepareTransferTool } from "./money.js";

function makeConfig(message: string, outcome: V2TurnOutcome = { uiBlocks: [] }) {
  const configurable: V2Configurable = {
    userId: WORLD.userId,
    conversationId: "tools-test",
    assistantId: DEFAULT_ASSISTANT_ID,
    message,
    now: new Date("2026-06-14T00:00:00.000Z"),
    timezone: "Asia/Jerusalem",
    locale: "en",
    executors: createV2WorldTools(),
    transferPreparationService: createTransferPreparationService(),
    transferModificationService: createTransferModificationService(),
    pendingConfirmation: null,
    turnOutcome: outcome,
    knownCounterparties: []
  };
  return { configurable };
}

describe("v2 read-only tool wrappers (DB-free world)", () => {
  test("getBalance surfaces the world balance from config identity", async () => {
    const out = await getBalanceTool.invoke({}, makeConfig("what's my balance"));
    assert.match(String(out), /1840\.50|1840\.5/);
  });

  test("getTotals(sent) reads the resolved counterparty email from args", async () => {
    const out = await getTotalsTool.invoke(
      { counterpartyEmail: "rani@example.com", direction: "sent" },
      makeConfig("how much did I send Rani")
    );
    assert.match(String(out), /320/);
  });

  test("getTotals(received) for Dan returns 200", async () => {
    const out = await getTotalsTool.invoke(
      { counterpartyEmail: "dan@example.com", direction: "received" },
      makeConfig("how much did Dan send me")
    );
    assert.match(String(out), /200/);
  });

  test("findCounterparty resolves a name to an authoritative email", async () => {
    const out = await findCounterpartyTool.invoke(
      { query: "Rani", relationHint: "any" },
      makeConfig("Rani")
    );
    assert.match(String(out), /rani@example\.com/);
  });

  test("searchTransactions(list) exposes rows with ids for ordinal follow-ups", async () => {
    const out = await searchTransactionsTool.invoke(
      { mode: "list", direction: "both", limit: 10, sort: "newest" },
      makeConfig("show me my recent transactions")
    );
    const text = String(out);
    assert.match(text, /120/);
    assert.match(text, /90/);
    assert.match(text, /tx-2/); // second row id available to the model
  });

  test("getTransactionReceipt resolves by the passed transactionId", async () => {
    const out = await getTransactionReceiptTool.invoke(
      { transactionId: "tx-2" },
      makeConfig("tell me more about the second one")
    );
    const text = String(out);
    assert.match(text, /90/);
    assert.match(text, /Dan/);
  });
});

describe("v2 money tools build cards without executing (DB-free world)", () => {
  test("prepareTransfer records a confirmation card in the turn outcome", async () => {
    const outcome: V2TurnOutcome = { uiBlocks: [] };
    const config = makeConfig("send Dan 320", outcome);
    const text = await prepareTransferTool.invoke(
      { recipientEmail: "dan@example.com", amount: 320 },
      config
    );

    assert.match(String(text), /NOT sent/i);
    assert.equal(outcome.confirmation?.recipientEmail, "dan@example.com");
    assert.equal(outcome.confirmation?.amount, 320);
  });

  test("prepareTransfer without a recipient asks for clarification, no card", async () => {
    const outcome: V2TurnOutcome = { uiBlocks: [] };
    const config = makeConfig("send 250", outcome);
    await prepareTransferTool.invoke({ amount: 250 }, config);

    assert.equal(outcome.confirmation, undefined);
    assert.equal(outcome.clarification?.reason, "missing_recipient");
  });

  test("modifyPendingTransfer supersedes the active card with the new amount", async () => {
    const outcome: V2TurnOutcome = { uiBlocks: [] };
    const config = makeConfig("make it 400", outcome);
    config.configurable.pendingConfirmation = {
      confirmationId: "pending-transfer-1",
      type: "transfer",
      status: "pending",
      createdAt: new Date().toISOString(),
      expiresAt: new Date().toISOString(),
      recipientEmail: "rani@example.com",
      amount: 200,
      currency: "ILS",
      turnCreated: 1,
      version: 1
    };

    await modifyPendingTransferTool.invoke({ amount: 400 }, config);

    assert.equal(outcome.confirmation?.amount, 400);
    // recipient carries over from the active card
    assert.equal(outcome.confirmation?.recipientEmail, "rani@example.com");
    assert.equal(outcome.supersededConfirmationId, "pending-transfer-1");
  });
});
