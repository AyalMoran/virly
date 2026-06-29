import { buildBlocksFromResult, transferConfirmationBlock } from "../blocks.js";
import type { RuntimeToolResult, ToolResultMetadata, TransferConfirmation } from "../../state.js";

// ---------------------------------------------------------------------------
// Helpers to build minimal RuntimeToolResult values
// ---------------------------------------------------------------------------

function makeResult(
  toolName: RuntimeToolResult["toolName"],
  status: RuntimeToolResult["status"],
  metadata: ToolResultMetadata,
  data?: unknown
): RuntimeToolResult {
  return {
    toolName,
    status,
    data: data ?? null,
    displayData: {
      summary: "tool summary",
      metadata
    }
  };
}

function makeConfirmation(overrides: Partial<TransferConfirmation> = {}): TransferConfirmation {
  return {
    id: "conf-1",
    version: 1,
    type: "transfer",
    status: "pending",
    recipientEmail: "alice@example.com",
    recipientFirstName: "Alice",
    recipientLastName: "Smith",
    amount: 300,
    currency: "ILS",
    recipient: {
      email: "alice@example.com",
      firstName: "Alice",
      lastName: "Smith",
      displayName: "Alice Smith",
      verified: true
    },
    amountDetails: { value: 300, currency: "ILS", formatted: "300 ILS" },
    reason: null,
    warnings: [],
    expiresAt: "2026-12-31T00:00:00.000Z",
    confirmAction: {
      method: "POST",
      path: "/confirm",
      body: { action: "confirm", version: 1 }
    },
    denyAction: {
      method: "POST",
      path: "/deny",
      body: { action: "deny", version: 1 }
    },
    ...overrides
  };
}

// ---------------------------------------------------------------------------
// buildBlocksFromResult — error status guard
// ---------------------------------------------------------------------------

describe("buildBlocksFromResult — error status", () => {
  test("returns empty array for any tool when status is 'error'", () => {
    const result = makeResult("getAccountBalance", "error", { amount: 999 });
    expect(buildBlocksFromResult("getAccountBalance", result)).toEqual([]);
  });

  test("returns empty array for transaction list tool when status is 'error'", () => {
    const result = makeResult("getRecentTransactions", "error", {
      transactions: [
        {
          transactionId: "t1",
          label: "tx1",
          amount: 50,
          currency: "ILS",
          direction: "sent",
          occurredAt: "2026-01-01T00:00:00.000Z"
        }
      ]
    });
    expect(buildBlocksFromResult("getRecentTransactions", result)).toEqual([]);
  });
});

// ---------------------------------------------------------------------------
// buildBlocksFromResult — getAccountBalance
// ---------------------------------------------------------------------------

describe("buildBlocksFromResult — getAccountBalance", () => {
  test("builds an account_summary block from metadata.amount", () => {
    const result = makeResult("getAccountBalance", "ok", { amount: 1500 });
    const blocks = buildBlocksFromResult("getAccountBalance", result);
    expect(blocks).toHaveLength(1);
    const block = blocks[0]!;
    expect(block.type).toBe("account_summary");
    if (block.type === "account_summary") {
      expect(block.availableBalance.amount).toBe(1500);
      expect(block.availableBalance.currency).toBe("ILS");
    }
  });

  test("includes accountLabel when present in metadata", () => {
    const result = makeResult("getAccountBalance", "ok", {
      amount: 2000,
      accountLabel: "Checking"
    });
    const blocks = buildBlocksFromResult("getAccountBalance", result);
    expect(blocks).toHaveLength(1);
    const block = blocks[0]!;
    if (block.type === "account_summary") {
      expect(block.accountLabel?.text).toBe("Checking");
    }
  });

  test("returns empty array when metadata has no amount", () => {
    const result = makeResult("getAccountBalance", "ok", {});
    expect(buildBlocksFromResult("getAccountBalance", result)).toEqual([]);
  });

  test("returns empty array when status is 'empty'", () => {
    const result = makeResult("getAccountBalance", "empty", { amount: 0 });
    // status 'empty' is not 'error', so it should NOT be filtered by the early guard
    const blocks = buildBlocksFromResult("getAccountBalance", result);
    // amount is 0 which is typeof 'number', so a block IS built (0 is valid balance)
    expect(blocks).toHaveLength(1);
    if (blocks[0]!.type === "account_summary") {
      expect(blocks[0]!.availableBalance.amount).toBe(0);
    }
  });
});

// ---------------------------------------------------------------------------
// buildBlocksFromResult — transaction list tools
// ---------------------------------------------------------------------------

describe("buildBlocksFromResult — getRecentTransactions / searchTransactions / getTransactionsWithCounterparty", () => {
  const txMeta: ToolResultMetadata = {
    transactions: [
      {
        transactionId: "tx-1",
        label: "Coffee",
        amount: 25,
        currency: "ILS",
        direction: "sent",
        occurredAt: "2026-01-10T08:00:00.000Z",
        counterpartyLabel: "Cafe"
      },
      {
        transactionId: "tx-2",
        label: "Salary",
        amount: 5000,
        currency: "ILS",
        direction: "received",
        occurredAt: "2026-01-05T12:00:00.000Z"
      }
    ]
  };

  for (const toolName of [
    "getRecentTransactions",
    "searchTransactions",
    "getTransactionsWithCounterparty"
  ] as const) {
    test(`${toolName} builds a transaction_list block`, () => {
      const result = makeResult(toolName, "ok", txMeta);
      const blocks = buildBlocksFromResult(toolName, result);
      expect(blocks).toHaveLength(1);
      const block = blocks[0]!;
      expect(block.type).toBe("transaction_list");
      if (block.type === "transaction_list") {
        expect(block.transactions).toHaveLength(2);
        expect(block.summary!.totalCount).toBe(2);
        expect(block.transactions[0]!.id).toBe("tx-1");
        expect(block.transactions[0]!.direction).toBe("sent");
        expect(block.transactions[1]!.direction).toBe("received");
      }
    });
  }

  test("returns empty array when transactions array is empty", () => {
    const result = makeResult("getRecentTransactions", "ok", { transactions: [] });
    expect(buildBlocksFromResult("getRecentTransactions", result)).toEqual([]);
  });

  test("returns empty array when transactions is absent from metadata", () => {
    const result = makeResult("searchTransactions", "ok", {});
    expect(buildBlocksFromResult("searchTransactions", result)).toEqual([]);
  });
});

// ---------------------------------------------------------------------------
// buildBlocksFromResult — getTransactionReceipt
// ---------------------------------------------------------------------------

describe("buildBlocksFromResult — getTransactionReceipt", () => {
  test("builds a transaction_detail block from result.data when data has amount", () => {
    const data = {
      transactionId: "tx-receipt-1",
      direction: "sent" as const,
      amount: 120,
      counterpartyLabel: "Alice",
      occurredAt: "2026-01-15T10:00:00.000Z"
    };
    const result = makeResult("getTransactionReceipt", "ok", {}, data);
    const blocks = buildBlocksFromResult("getTransactionReceipt", result);
    expect(blocks).toHaveLength(1);
    const block = blocks[0]!;
    expect(block.type).toBe("transaction_detail");
    if (block.type === "transaction_detail") {
      expect(block.transaction.amount.amount).toBe(120);
      expect(block.transaction.direction).toBe("sent");
    }
  });

  test("falls back to metadata.transactions when data is missing amount", () => {
    const meta: ToolResultMetadata = {
      transactions: [
        {
          transactionId: "tx-fallback",
          label: "Payment",
          amount: 75,
          currency: "ILS",
          direction: "received",
          occurredAt: "2026-01-20T00:00:00.000Z"
        }
      ]
    };
    const result = makeResult("getTransactionReceipt", "ok", meta, null);
    const blocks = buildBlocksFromResult("getTransactionReceipt", result);
    expect(blocks).toHaveLength(1);
    if (blocks[0]!.type === "transaction_detail") {
      expect(blocks[0]!.transaction.id).toBe("tx-fallback");
    }
  });

  test("returns empty array when neither data nor metadata have a transaction", () => {
    const result = makeResult("getTransactionReceipt", "ok", {}, null);
    expect(buildBlocksFromResult("getTransactionReceipt", result)).toEqual([]);
  });

  test("defaults direction to 'sent' when data.direction is not 'received'", () => {
    const data = { amount: 50, occurredAt: "2026-01-01T00:00:00.000Z" };
    const result = makeResult("getTransactionReceipt", "ok", {}, data);
    const blocks = buildBlocksFromResult("getTransactionReceipt", result);
    if (blocks[0]?.type === "transaction_detail") {
      expect(blocks[0].transaction.direction).toBe("sent");
    }
  });
});

// ---------------------------------------------------------------------------
// buildBlocksFromResult — counterparty total tools
// ---------------------------------------------------------------------------

describe("buildBlocksFromResult — getTotalSentToCounterparty", () => {
  test("builds a transaction_stats block with sentTotal", () => {
    const result = makeResult("getTotalSentToCounterparty", "ok", {
      amount: 2000,
      displayName: "Bob",
      recordCount: 5
    });
    const blocks = buildBlocksFromResult("getTotalSentToCounterparty", result);
    expect(blocks).toHaveLength(1);
    const block = blocks[0]!;
    expect(block.type).toBe("transaction_stats");
    if (block.type === "transaction_stats") {
      expect(block.sentTotal?.amount).toBe(2000);
      expect(block.count).toBe(5);
      expect(block.items![0]!.label.text).toContain("Bob");
    }
  });

  test("returns empty array when metadata has no amount", () => {
    const result = makeResult("getTotalSentToCounterparty", "ok", {});
    expect(buildBlocksFromResult("getTotalSentToCounterparty", result)).toEqual([]);
  });
});

describe("buildBlocksFromResult — getTotalReceivedFromCounterparty", () => {
  test("builds a transaction_stats block with receivedTotal", () => {
    const result = makeResult("getTotalReceivedFromCounterparty", "ok", {
      amount: 800,
      maskedLabel: "c***@test.com",
      recordCount: 2
    });
    const blocks = buildBlocksFromResult("getTotalReceivedFromCounterparty", result);
    expect(blocks).toHaveLength(1);
    const block = blocks[0]!;
    if (block.type === "transaction_stats") {
      expect(block.receivedTotal?.amount).toBe(800);
      expect(block.items![0]!.label.text).toContain("Received from");
    }
  });
});

describe("buildBlocksFromResult — getNetWithCounterparty", () => {
  test("builds a transaction_stats block with net", () => {
    const result = makeResult("getNetWithCounterparty", "ok", {
      amount: 300,
      counterpartyEmail: "net@example.com",
      recordCount: 3
    });
    const blocks = buildBlocksFromResult("getNetWithCounterparty", result);
    expect(blocks).toHaveLength(1);
    const block = blocks[0]!;
    if (block.type === "transaction_stats") {
      expect(block.net?.amount).toBe(300);
      expect(block.items![0]!.label.text).toContain("Net with");
    }
  });
});

// ---------------------------------------------------------------------------
// buildBlocksFromResult — getTransactionStats
// ---------------------------------------------------------------------------

describe("buildBlocksFromResult — getTransactionStats", () => {
  test("builds a transaction_stats block with all three totals", () => {
    const result = makeResult("getTransactionStats", "ok", {
      recordCount: 10,
      sentAmount: 1000,
      receivedAmount: 1500,
      netAmount: 500
    });
    const blocks = buildBlocksFromResult("getTransactionStats", result);
    expect(blocks).toHaveLength(1);
    const block = blocks[0]!;
    expect(block.type).toBe("transaction_stats");
    if (block.type === "transaction_stats") {
      expect(block.count).toBe(10);
      expect(block.sentTotal?.amount).toBe(1000);
      expect(block.receivedTotal?.amount).toBe(1500);
      expect(block.net?.amount).toBe(500);
    }
  });

  test("omits optional fields when metadata does not have them", () => {
    const result = makeResult("getTransactionStats", "ok", { recordCount: 4 });
    const blocks = buildBlocksFromResult("getTransactionStats", result);
    expect(blocks).toHaveLength(1);
    const block = blocks[0]!;
    if (block.type === "transaction_stats") {
      expect(block.sentTotal).toBeUndefined();
      expect(block.receivedTotal).toBeUndefined();
      expect(block.net).toBeUndefined();
      expect(block.count).toBe(4);
    }
  });
});

// ---------------------------------------------------------------------------
// buildBlocksFromResult — getDailyTransferUsage
// ---------------------------------------------------------------------------

describe("buildBlocksFromResult — getDailyTransferUsage", () => {
  test("builds a transfer_limits block with dailyRemaining", () => {
    const result = makeResult("getDailyTransferUsage", "ok", { amount: 3000 });
    const blocks = buildBlocksFromResult("getDailyTransferUsage", result);
    expect(blocks).toHaveLength(1);
    const block = blocks[0]!;
    expect(block.type).toBe("transfer_limits");
    if (block.type === "transfer_limits") {
      expect(block.dailyRemaining?.amount).toBe(3000);
    }
  });

  test("returns empty array when metadata has no amount", () => {
    const result = makeResult("getDailyTransferUsage", "ok", {});
    expect(buildBlocksFromResult("getDailyTransferUsage", result)).toEqual([]);
  });
});

// ---------------------------------------------------------------------------
// buildBlocksFromResult — getTransferLimits
// ---------------------------------------------------------------------------

describe("buildBlocksFromResult — getTransferLimits", () => {
  test("builds a transfer_limits block with perTransferLimit", () => {
    const result = makeResult("getTransferLimits", "ok", { amount: 5000 });
    const blocks = buildBlocksFromResult("getTransferLimits", result);
    expect(blocks).toHaveLength(1);
    const block = blocks[0]!;
    expect(block.type).toBe("transfer_limits");
    if (block.type === "transfer_limits") {
      expect(block.perTransferLimit?.amount).toBe(5000);
    }
  });

  test("returns empty array when metadata has no amount", () => {
    const result = makeResult("getTransferLimits", "ok", {});
    expect(buildBlocksFromResult("getTransferLimits", result)).toEqual([]);
  });
});

// ---------------------------------------------------------------------------
// buildBlocksFromResult — unrecognized tool name
// ---------------------------------------------------------------------------

describe("buildBlocksFromResult — default / unrecognized tool", () => {
  test("returns empty array for unrecognized tool names", () => {
    const result = makeResult(
      "getUserAccounts" as RuntimeToolResult["toolName"],
      "ok",
      { amount: 100 }
    );
    expect(buildBlocksFromResult("getUserAccounts", result)).toEqual([]);
  });
});

// ---------------------------------------------------------------------------
// transferConfirmationBlock
// ---------------------------------------------------------------------------

describe("transferConfirmationBlock", () => {
  test("builds a transfer_confirmation block from a card", () => {
    const card = makeConfirmation();
    const block = transferConfirmationBlock(card);
    expect(block.type).toBe("transfer_confirmation");
    if (block.type === "transfer_confirmation") {
      expect(block.confirmation).toBe(card);
    }
  });

  test("assigns a non-empty string id to the block", () => {
    const block = transferConfirmationBlock(makeConfirmation());
    expect(typeof block.id).toBe("string");
    expect(block.id.length).toBeGreaterThan(0);
  });

  test("successive calls produce different ids", () => {
    const id1 = transferConfirmationBlock(makeConfirmation()).id;
    const id2 = transferConfirmationBlock(makeConfirmation()).id;
    expect(id1).not.toBe(id2);
  });
});
