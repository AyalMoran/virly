import { recordTransferRiskFlag, scoreTransfer } from "../service.js";
import { setRepositories } from "../../repositories/index.js";
import { createMongoRepositories } from "../../repositories/mongo/index.js";
import type { Repositories } from "../../repositories/types.js";

type TxStub = {
  hasDebit?: boolean;
  dailyTotal?: number;
  recent?: Array<{ amount: number; createdAt: Date }>;
  throwOnHasDebit?: boolean;
};

function withTransactions(stub: TxStub) {
  const base = createMongoRepositories();
  setRepositories({
    ...base,
    transactions: {
      ...base.transactions,
      hasDebitToCounterparty: async () => {
        if (stub.throwOnHasDebit) throw new Error("repo down");
        return stub.hasDebit ?? true;
      },
      getDailyDebitUsage: async () => ({
        total: stub.dailyTotal ?? 0,
        count: 0
      }),
      recentForOwner: async () => (stub.recent ?? []) as never
    } as Repositories["transactions"]
  });
}

const MIDDAY = new Date(Date.UTC(2026, 5, 1, 12, 0, 0));
const ODD_HOUR = new Date(Date.UTC(2026, 5, 1, 3, 0, 0));

describe("scoreTransfer", () => {
  test("a small transfer to a known recipient at midday scores low", async () => {
    withTransactions({ hasDebit: true });
    const result = await scoreTransfer({
      userId: "u1",
      recipientEmail: "bob@example.com",
      amount: 1,
      now: MIDDAY
    });
    expect(result.level).toBe("low");
    expect(result.flags.newCounterparty).toBe(false);
    expect(result.flags.oddHour).toBe(false);
    expect(typeof result.score).toBe("number");
    expect(Array.isArray(result.reasons)).toBe(true);
  });

  test("a first-ever recipient at an odd hour raises new-counterparty and odd-hour flags", async () => {
    withTransactions({ hasDebit: false });
    const result = await scoreTransfer({
      userId: "u1",
      recipientEmail: "new@example.com",
      amount: 1,
      now: ODD_HOUR
    });
    expect(result.flags.newCounterparty).toBe(true);
    expect(result.flags.oddHour).toBe(true);
    expect(result.reasons).toContain("First transfer to this recipient.");
    // 0.2 (new) + 0.1 (odd hour) at minimum.
    expect(result.score).toBeGreaterThanOrEqual(0.3);
  });

  test("normalises the recipient email before scoring", async () => {
    let seenEmail = "";
    const base = createMongoRepositories();
    setRepositories({
      ...base,
      transactions: {
        ...base.transactions,
        hasDebitToCounterparty: async (input) => {
          seenEmail = input.counterpartyEmail;
          return true;
        },
        getDailyDebitUsage: async () => ({ total: 0, count: 0 }),
        recentForOwner: async () => [] as never
      } as Repositories["transactions"]
    });
    await scoreTransfer({
      userId: "u1",
      recipientEmail: "  BOB@Example.COM ",
      amount: 1,
      now: MIDDAY
    });
    expect(seenEmail).toBe("bob@example.com");
  });
});

describe("recordTransferRiskFlag", () => {
  test("returns the low-risk result without attempting persistence", async () => {
    withTransactions({ hasDebit: true });
    const result = await recordTransferRiskFlag({
      userId: "u1",
      recipientEmail: "bob@example.com",
      amount: 1,
      now: MIDDAY
    });
    expect(result?.level).toBe("low");
  });

  test("returns null when scoring itself fails", async () => {
    withTransactions({ throwOnHasDebit: true });
    const result = await recordTransferRiskFlag({
      userId: "u1",
      recipientEmail: "bob@example.com",
      amount: 1,
      now: MIDDAY
    });
    expect(result).toBeNull();
  });
});
