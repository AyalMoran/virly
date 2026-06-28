/**
 * Additional unit tests for tools/money.ts.
 *
 * tools.test.ts (sibling) already covers prepareTransfer and
 * modifyPendingTransfer. This file covers:
 *   - cancelPendingTransferTool
 *   - requestClarificationTool
 *   - overPerTransferLimit (via tool invocation)
 *   - prepareTransfer service-unavailable path
 *   - modifyPendingTransfer service/card-unavailable paths
 */
import { DEFAULT_ASSISTANT_ID } from "../../../assistants.js";
import {
  createTransferModificationService,
  createTransferPreparationService
} from "../../../evals/support.js";
import { WORLD } from "../../../evals/v2/world.js";
import { createV2WorldTools } from "../../../evals/v2/worldTools.js";
import type { V2Configurable, V2TurnOutcome } from "../../toolContext.js";
import {
  cancelPendingTransferTool,
  requestClarificationTool,
  prepareTransferTool,
  modifyPendingTransferTool
} from "../money.js";
import type { PendingConfirmationMemory } from "../../../state.js";

function makeConfig(
  message: string,
  outcome: V2TurnOutcome = { uiBlocks: [] }
) {
  const configurable: V2Configurable = {
    userId: WORLD.userId,
    conversationId: "money-test",
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

function activePendingCard(): PendingConfirmationMemory {
  return {
    confirmationId: "pending-card-1",
    type: "transfer",
    status: "pending",
    createdAt: new Date("2026-06-14T08:00:00.000Z").toISOString(),
    expiresAt: new Date("2026-06-14T10:00:00.000Z").toISOString(),
    recipientEmail: "rani@example.com",
    amount: 200,
    currency: "ILS",
    turnCreated: 1,
    version: 1
  };
}

// ---------------------------------------------------------------------------
// cancelPendingTransferTool
// ---------------------------------------------------------------------------

describe("cancelPendingTransferTool", () => {
  test("cancels the active card and records supersededConfirmationId", async () => {
    const outcome: V2TurnOutcome = { uiBlocks: [] };
    const config = makeConfig("cancel that", outcome);
    config.configurable.pendingConfirmation = activePendingCard();

    const result = await cancelPendingTransferTool.invoke({}, config);

    expect(String(result)).toMatch(/Discard|discard|cancel|cancel/i);
    expect(outcome.supersededConfirmationId).toBe("pending-card-1");
  });

  test("reports no active card when pendingConfirmation is null", async () => {
    const outcome: V2TurnOutcome = { uiBlocks: [] };
    const config = makeConfig("cancel", outcome);
    // pendingConfirmation is already null by default in makeConfig

    const result = await cancelPendingTransferTool.invoke({}, config);

    expect(String(result)).toMatch(/no active/i);
    expect(outcome.supersededConfirmationId).toBeUndefined();
  });

  test("does not set a confirmation or clarification on the outcome", async () => {
    const outcome: V2TurnOutcome = { uiBlocks: [] };
    const config = makeConfig("cancel", outcome);
    config.configurable.pendingConfirmation = activePendingCard();

    await cancelPendingTransferTool.invoke({}, config);

    expect(outcome.confirmation).toBeUndefined();
    expect(outcome.clarification).toBeUndefined();
  });
});

// ---------------------------------------------------------------------------
// requestClarificationTool
// ---------------------------------------------------------------------------

describe("requestClarificationTool", () => {
  test("missing_recipient sets clarification with recipient expectedReplyType", async () => {
    const outcome: V2TurnOutcome = { uiBlocks: [] };
    const config = makeConfig("send 200", outcome);

    await requestClarificationTool.invoke(
      { reason: "missing_recipient", question: "Who do you want to send to?" },
      config
    );

    expect(outcome.clarification?.reason).toBe("missing_recipient");
    expect(outcome.clarification?.expectedReplyType).toBe("recipient");
    expect(outcome.clarification?.message).toBe("Who do you want to send to?");
  });

  test("missing_amount sets clarification with amount expectedReplyType", async () => {
    const outcome: V2TurnOutcome = { uiBlocks: [] };
    const config = makeConfig("send Dan something", outcome);

    await requestClarificationTool.invoke(
      { reason: "missing_amount", question: "How much do you want to send?" },
      config
    );

    expect(outcome.clarification?.reason).toBe("missing_amount");
    expect(outcome.clarification?.expectedReplyType).toBe("amount");
  });

  test("ambiguous_amount sets clarification with amount expectedReplyType", async () => {
    const outcome: V2TurnOutcome = { uiBlocks: [] };
    const config = makeConfig("send Dan some money", outcome);

    await requestClarificationTool.invoke(
      { reason: "ambiguous_amount", question: "What amount?" },
      config
    );

    expect(outcome.clarification?.expectedReplyType).toBe("amount");
  });

  test("ambiguous_recipient sets clarification with recipient expectedReplyType", async () => {
    const outcome: V2TurnOutcome = { uiBlocks: [] };
    const config = makeConfig("send him 100", outcome);

    await requestClarificationTool.invoke(
      { reason: "ambiguous_recipient", question: "Which person do you mean?" },
      config
    );

    expect(outcome.clarification?.expectedReplyType).toBe("recipient");
  });

  test("returns a message that includes the question text", async () => {
    const outcome: V2TurnOutcome = { uiBlocks: [] };
    const config = makeConfig("send", outcome);
    const question = "Who should receive the transfer?";

    const result = await requestClarificationTool.invoke(
      { reason: "missing_recipient", question },
      config
    );

    expect(String(result)).toContain(question);
  });
});

// ---------------------------------------------------------------------------
// overPerTransferLimit (via prepareTransferTool)
// ---------------------------------------------------------------------------

describe("overPerTransferLimit (via prepareTransferTool)", () => {
  test("rejects an amount above the default 500 ILS limit (en locale)", async () => {
    const outcome: V2TurnOutcome = { uiBlocks: [] };
    const config = makeConfig("send dan 600", outcome);
    // locale is already "en" in makeConfig

    const result = await prepareTransferTool.invoke(
      { recipientEmail: "dan@example.com", amount: 600 },
      config
    );

    const text = String(result);
    expect(text).toMatch(/limit/i);
    expect(text).toMatch(/600/);
    expect(outcome.confirmation).toBeUndefined();
    expect(outcome.clarification?.reason).toBe("ambiguous_amount");
  });

  test("rejects an over-limit amount with Hebrew message when locale is he", async () => {
    const outcome: V2TurnOutcome = { uiBlocks: [] };
    const config = makeConfig("שלח 600", outcome);
    config.configurable.locale = "he";

    const result = await prepareTransferTool.invoke(
      { recipientEmail: "dan@example.com", amount: 600 },
      config
    );

    const text = String(result);
    // Hebrew refusal message should mention the amount
    expect(text).toMatch(/600/);
    expect(outcome.confirmation).toBeUndefined();
  });

  test("accepts an amount exactly at the limit (500 ILS)", async () => {
    const outcome: V2TurnOutcome = { uiBlocks: [] };
    const config = makeConfig("send dan 500", outcome);

    await prepareTransferTool.invoke(
      { recipientEmail: "dan@example.com", amount: 500 },
      config
    );

    // Should have built a card, not a limit refusal
    expect(outcome.confirmation).toBeDefined();
    expect(outcome.clarification?.reason).not.toBe("ambiguous_amount");
  });

  test("accepts an amount just below the limit (499 ILS)", async () => {
    const outcome: V2TurnOutcome = { uiBlocks: [] };
    const config = makeConfig("send dan 499", outcome);

    await prepareTransferTool.invoke(
      { recipientEmail: "dan@example.com", amount: 499 },
      config
    );

    expect(outcome.confirmation).toBeDefined();
  });
});

// ---------------------------------------------------------------------------
// prepareTransferTool — service-unavailable path
// ---------------------------------------------------------------------------

describe("prepareTransferTool service unavailable", () => {
  test("returns unavailable message when no transferPreparationService is set", async () => {
    const outcome: V2TurnOutcome = { uiBlocks: [] };
    const config = makeConfig("send dan 100", outcome);
    config.configurable.transferPreparationService = undefined;

    const result = await prepareTransferTool.invoke(
      { recipientEmail: "dan@example.com", amount: 100 },
      config
    );

    expect(String(result)).toMatch(/unavailable/i);
    expect(outcome.confirmation).toBeUndefined();
  });
});

// ---------------------------------------------------------------------------
// modifyPendingTransferTool — unavailable paths
// ---------------------------------------------------------------------------

describe("modifyPendingTransferTool unavailable paths", () => {
  test("returns unavailable message when no transferModificationService is set", async () => {
    const outcome: V2TurnOutcome = { uiBlocks: [] };
    const config = makeConfig("make it 400", outcome);
    config.configurable.pendingConfirmation = activePendingCard();
    config.configurable.transferModificationService = undefined;

    const result = await modifyPendingTransferTool.invoke({ amount: 400 }, config);

    expect(String(result)).toMatch(/unavailable/i);
  });

  test("returns no-card message when pendingConfirmation is null", async () => {
    const outcome: V2TurnOutcome = { uiBlocks: [] };
    const config = makeConfig("make it 400", outcome);
    // pendingConfirmation is null by default

    const result = await modifyPendingTransferTool.invoke({ amount: 400 }, config);

    expect(String(result)).toMatch(/no active/i);
  });

  test("rejects an over-limit amount on modification", async () => {
    const outcome: V2TurnOutcome = { uiBlocks: [] };
    const config = makeConfig("make it 600", outcome);
    config.configurable.pendingConfirmation = activePendingCard();

    const result = await modifyPendingTransferTool.invoke({ amount: 600 }, config);

    const text = String(result);
    expect(text).toMatch(/limit/i);
    expect(outcome.clarification?.reason).toBe("ambiguous_amount");
  });
});
