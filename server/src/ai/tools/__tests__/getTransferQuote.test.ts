import { setRepositories, clearRepositories } from "../../../repositories/index.js";
import { createMongoRepositories } from "../../../repositories/mongo/index.js";
import { getTransferQuote } from "../getTransferQuote.js";
import type { ToolContext } from "../../state.js";
import type { UserRecord } from "../../../repositories/types.js";

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function makeContext(message: string, extra: Partial<ToolContext> = {}): ToolContext {
  return {
    userId: "user-sender",
    conversationId: "conv1",
    message,
    ...extra
  };
}

function makeUser(id: string, email: string, balance: number): UserRecord {
  return {
    id,
    email,
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

function makeRepos(opts: {
  senderUser: UserRecord | null;
  recipientUser: UserRecord | null;
  dailyUsed?: number;
  hasPriorDebit?: boolean;
}) {
  const base = createMongoRepositories();
  return {
    ...base,
    users: {
      ...base.users,
      findById: async (id: string) =>
        id === opts.senderUser?.id ? opts.senderUser : null,
      findByEmail: async () => opts.recipientUser
    },
    transactions: {
      ...base.transactions,
      getDailyDebitUsage: async () => ({
        total: opts.dailyUsed ?? 0,
        count: 0
      }),
      hasDebitToCounterparty: async () => opts.hasPriorDebit ?? true
    }
  };
}

// ---------------------------------------------------------------------------
// Tests
// ---------------------------------------------------------------------------

afterEach(() => {
  clearRepositories();
});

const SENDER = makeUser("user-sender", "sender@example.com", 500);
const RECIPIENT = makeUser("user-recip", "bob@example.com", 0);

describe("getTransferQuote - sender not found", () => {
  it("returns error when sender is missing", async () => {
    setRepositories(makeRepos({ senderUser: null, recipientUser: null }) as ReturnType<typeof createMongoRepositories>);
    const result = await getTransferQuote(makeContext("send 100 ILS to bob@example.com", {
      requestSlots: {
        intent: "transfer_prepare",
        counterparty: { explicitEmail: "bob@example.com" }
      }
    }));
    expect(result.status).toBe("error");
    const summary = (result.displayData as { summary: string }).summary;
    expect(summary).toMatch(/sender account/i);
  });
});

describe("getTransferQuote - missing amount or recipient", () => {
  it("returns error when no amount is in context", async () => {
    setRepositories(makeRepos({ senderUser: SENDER, recipientUser: RECIPIENT }) as ReturnType<typeof createMongoRepositories>);
    const result = await getTransferQuote(makeContext("send money to bob@example.com", {
      requestSlots: {
        intent: "transfer_prepare",
        counterparty: { explicitEmail: "bob@example.com" }
      }
    }));
    expect(result.status).toBe("error");
    const summary = (result.displayData as { summary: string }).summary;
    expect(summary).toMatch(/recipient.*amount|amount.*recipient/i);
  });

  it("returns error when no recipient is in context", async () => {
    setRepositories(makeRepos({ senderUser: SENDER, recipientUser: RECIPIENT }) as ReturnType<typeof createMongoRepositories>);
    const result = await getTransferQuote(makeContext("send 100 ILS"));
    expect(result.status).toBe("error");
  });
});

describe("getTransferQuote - eligible transfer", () => {
  it("returns ok status for a valid transfer", async () => {
    setRepositories(makeRepos({ senderUser: SENDER, recipientUser: RECIPIENT, hasPriorDebit: true }) as ReturnType<typeof createMongoRepositories>);
    const result = await getTransferQuote(makeContext("send 100 ILS to bob@example.com", {
      requestSlots: {
        intent: "transfer_prepare",
        counterparty: { explicitEmail: "bob@example.com" },
        amount: { value: 100, currency: "ILS", currencyMentioned: true }
      }
    }));
    expect(result.status).toBe("ok");
    const data = result.data as { eligible: boolean; amount: number; currency: string };
    expect(data.eligible).toBe(true);
    expect(data.amount).toBe(100);
    expect(data.currency).toBe("ILS");
  });

  it("summary says eligible", async () => {
    setRepositories(makeRepos({ senderUser: SENDER, recipientUser: RECIPIENT, hasPriorDebit: true }) as ReturnType<typeof createMongoRepositories>);
    const result = await getTransferQuote(makeContext("send 50 ILS", {
      requestSlots: {
        intent: "transfer_prepare",
        counterparty: { explicitEmail: "bob@example.com" },
        amount: { value: 50, currency: "ILS", currencyMentioned: true }
      }
    }));
    const summary = (result.displayData as { summary: string }).summary;
    expect(summary).toMatch(/eligible/i);
  });

  it("remainingBalanceAfterTransfer is correct", async () => {
    setRepositories(makeRepos({ senderUser: SENDER, recipientUser: RECIPIENT, hasPriorDebit: true }) as ReturnType<typeof createMongoRepositories>);
    const result = await getTransferQuote(makeContext("send 150 ILS", {
      requestSlots: {
        intent: "transfer_prepare",
        counterparty: { explicitEmail: "bob@example.com" },
        amount: { value: 150, currency: "ILS", currencyMentioned: true }
      }
    }));
    const data = result.data as { remainingBalanceAfterTransfer: number };
    expect(data.remainingBalanceAfterTransfer).toBe(350);
  });
});

describe("getTransferQuote - ineligible transfer", () => {
  it("adds INSUFFICIENT_BALANCE warning when amount > balance", async () => {
    setRepositories(makeRepos({ senderUser: SENDER, recipientUser: RECIPIENT, hasPriorDebit: true }) as ReturnType<typeof createMongoRepositories>);
    const result = await getTransferQuote(makeContext("send 600 ILS", {
      requestSlots: {
        intent: "transfer_prepare",
        counterparty: { explicitEmail: "bob@example.com" },
        amount: { value: 600, currency: "ILS", currencyMentioned: true }
      }
    }));
    expect(result.status).toBe("error");
    const data = result.data as { eligible: boolean; warnings: string[] };
    expect(data.eligible).toBe(false);
    expect(data.warnings).toContain("INSUFFICIENT_BALANCE");
  });

  it("adds INVALID_RECIPIENT when recipient is not found", async () => {
    setRepositories(makeRepos({ senderUser: SENDER, recipientUser: null }) as ReturnType<typeof createMongoRepositories>);
    const result = await getTransferQuote(makeContext("send 50 ILS", {
      requestSlots: {
        intent: "transfer_prepare",
        counterparty: { explicitEmail: "ghost@example.com" },
        amount: { value: 50, currency: "ILS", currencyMentioned: true }
      }
    }));
    expect(result.status).toBe("error");
    const data = result.data as { warnings: string[] };
    expect(data.warnings).toContain("INVALID_RECIPIENT");
  });

  it("adds INVALID_RECIPIENT when sending to self", async () => {
    const selfSender = makeUser("user-sender", "sender@example.com", 500);
    const selfRecipient = makeUser("user-sender", "sender@example.com", 500);
    setRepositories(makeRepos({ senderUser: selfSender, recipientUser: selfRecipient }) as ReturnType<typeof createMongoRepositories>);
    const result = await getTransferQuote(makeContext("send 50 ILS to myself", {
      requestSlots: {
        intent: "transfer_prepare",
        counterparty: { explicitEmail: "sender@example.com" },
        amount: { value: 50, currency: "ILS", currencyMentioned: true }
      }
    }));
    const data = result.data as { warnings: string[] };
    expect(data.warnings).toContain("INVALID_RECIPIENT");
  });

  it("adds NEW_RECIPIENT when no prior debit history", async () => {
    setRepositories(makeRepos({ senderUser: SENDER, recipientUser: RECIPIENT, hasPriorDebit: false }) as ReturnType<typeof createMongoRepositories>);
    const result = await getTransferQuote(makeContext("send 100 ILS", {
      requestSlots: {
        intent: "transfer_prepare",
        counterparty: { explicitEmail: "bob@example.com" },
        amount: { value: 100, currency: "ILS", currencyMentioned: true }
      }
    }));
    const data = result.data as { warnings: string[] };
    expect(data.warnings).toContain("NEW_RECIPIENT");
  });

  it("adds LOW_REMAINING_BALANCE when remaining < 50", async () => {
    const nearlyEmpty = makeUser("user-sender", "sender@example.com", 120);
    setRepositories(makeRepos({ senderUser: nearlyEmpty, recipientUser: RECIPIENT, hasPriorDebit: true }) as ReturnType<typeof createMongoRepositories>);
    const result = await getTransferQuote(makeContext("send 100 ILS", {
      requestSlots: {
        intent: "transfer_prepare",
        counterparty: { explicitEmail: "bob@example.com" },
        amount: { value: 100, currency: "ILS", currencyMentioned: true }
      }
    }));
    const data = result.data as { warnings: string[] };
    expect(data.warnings).toContain("LOW_REMAINING_BALANCE");
    expect(data.warnings).not.toContain("INSUFFICIENT_BALANCE");
  });
});
