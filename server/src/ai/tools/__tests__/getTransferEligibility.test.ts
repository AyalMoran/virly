import { setRepositories, clearRepositories } from "../../../repositories/index.js";
import { createMongoRepositories } from "../../../repositories/mongo/index.js";
import { getTransferEligibility } from "../getTransferEligibility.js";
import type { ToolContext } from "../../state.js";
import type { UserRecord } from "../../../repositories/types.js";

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function makeContext(message: string, extra: Partial<ToolContext> = {}): ToolContext {
  return {
    userId: "user1",
    conversationId: "conv1",
    message,
    ...extra
  };
}

function stubUser(balance: number): UserRecord {
  return {
    id: "user1",
    email: "alice@example.com",
    passwordHash: "hash",
    phone: "+972501234567",
    isVerified: true,
    personalDetails: null,
    balance,
    role: "user",
    createdAt: new Date(),
    updatedAt: new Date()
  };
}

function makeRepos(user: UserRecord | null, dailyUsed = 0) {
  const base = createMongoRepositories();
  return {
    ...base,
    users: {
      ...base.users,
      findById: async () => user
    },
    transactions: {
      ...base.transactions,
      getDailyDebitUsage: async () => ({ total: dailyUsed, count: 0 })
    }
  };
}

// ---------------------------------------------------------------------------
// Tests
// ---------------------------------------------------------------------------

afterEach(() => {
  clearRepositories();
});

describe("getTransferEligibility - sender not found", () => {
  it("returns error status when sender is missing", async () => {
    setRepositories(makeRepos(null) as ReturnType<typeof createMongoRepositories>);
    const result = await getTransferEligibility(makeContext("am I eligible?"));
    expect(result.status).toBe("error");
    const summary = (result.displayData as { summary: string }).summary;
    expect(summary).toMatch(/sender account/i);
  });
});

describe("getTransferEligibility - no amount in context", () => {
  it("returns ok with maxSendableNow when no amount is specified", async () => {
    setRepositories(makeRepos(stubUser(800), 0) as ReturnType<typeof createMongoRepositories>);
    const result = await getTransferEligibility(makeContext("can I send money?"));
    expect(result.status).toBe("ok");
    const data = result.data as { eligible: boolean; maxSendableNow: number };
    expect(data.eligible).toBe(true);
    // min(800, 500 perTransferLimit, 1000 dailyRemaining) = 500
    expect(data.maxSendableNow).toBe(500);
  });

  it("summary mentions balance and daily remaining", async () => {
    setRepositories(makeRepos(stubUser(200), 0) as ReturnType<typeof createMongoRepositories>);
    const result = await getTransferEligibility(makeContext("can I send?"));
    const summary = (result.displayData as { summary: string }).summary;
    expect(summary).toMatch(/balance/i);
    expect(summary).toMatch(/daily remaining/i);
  });
});

describe("getTransferEligibility - with amount, eligible", () => {
  it("returns ok when amount is within balance and limits", async () => {
    setRepositories(makeRepos(stubUser(300), 0) as ReturnType<typeof createMongoRepositories>);
    const result = await getTransferEligibility(makeContext("can I send 100 ILS?"));
    expect(result.status).toBe("ok");
    const data = result.data as { eligible: boolean; amount: number };
    expect(data.eligible).toBe(true);
    expect(data.amount).toBe(100);
  });

  it("summary confirms eligibility", async () => {
    setRepositories(makeRepos(stubUser(400), 0) as ReturnType<typeof createMongoRepositories>);
    const result = await getTransferEligibility(makeContext("can I send 200 ILS?"));
    const summary = (result.displayData as { summary: string }).summary;
    expect(summary).toMatch(/eligible/i);
  });
});

describe("getTransferEligibility - with amount, ineligible", () => {
  it("returns error when amount exceeds balance", async () => {
    setRepositories(makeRepos(stubUser(50), 0) as ReturnType<typeof createMongoRepositories>);
    const result = await getTransferEligibility(makeContext("can I send 100 ILS?"));
    expect(result.status).toBe("error");
    const data = result.data as { eligible: boolean; reasons: string[] };
    expect(data.eligible).toBe(false);
    expect(data.reasons).toContain("INSUFFICIENT_BALANCE");
  });

  it("returns error when amount exceeds per-transfer limit (>500)", async () => {
    setRepositories(makeRepos(stubUser(10000), 0) as ReturnType<typeof createMongoRepositories>);
    const result = await getTransferEligibility(makeContext("can I send 600 ILS?"));
    expect(result.status).toBe("error");
    const data = result.data as { eligible: boolean; reasons: string[] };
    expect(data.reasons).toContain("EXCEEDS_PER_TRANSFER_LIMIT");
  });

  it("returns error when daily limit is exhausted", async () => {
    // dailyTransferLimit default = 1000, usedToday = 1000 => remainingToday = 0
    setRepositories(makeRepos(stubUser(10000), 1000) as ReturnType<typeof createMongoRepositories>);
    const result = await getTransferEligibility(makeContext("can I send 50 ILS?"));
    expect(result.status).toBe("error");
    const data = result.data as { eligible: boolean; reasons: string[] };
    expect(data.reasons).toContain("EXCEEDS_DAILY_LIMIT");
  });
});
