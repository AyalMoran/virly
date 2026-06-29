/**
 * Shared stub factory for AI tool unit tests.
 * Import helpers from here to avoid duplication across test files.
 */
import type {
  Repositories,
  TransactionRecord,
  UserRecord,
  PersonalDetailsRecord,
  AiPendingTransferRecord
} from "../../../repositories/types.js";
import { setRepositories, clearRepositories } from "../../../repositories/index.js";

// ------ minimal record builders ------------------------------------------------

export function makeUserRecord(overrides: Partial<UserRecord> = {}): UserRecord {
  return {
    id: "user-1",
    email: "owner@example.com",
    passwordHash: "hash",
    phone: "+1234",
    isVerified: true,
    personalDetails: null,
    balance: 500,
    role: "user",
    createdAt: new Date("2024-01-01"),
    updatedAt: new Date("2024-01-01"),
    ...overrides
  };
}

export function makeTransactionRecord(
  overrides: Partial<TransactionRecord> = {}
): TransactionRecord {
  return {
    id: "tx-1",
    ownerId: "user-1",
    counterpartyEmail: "bob@example.com",
    amount: 100,
    type: "debit",
    directionLabel: "sent",
    reason: null,
    createdAt: new Date("2024-06-01T10:00:00Z"),
    updatedAt: new Date("2024-06-01T10:00:00Z"),
    ...overrides
  };
}

export function makePersonalDetailsRecord(
  overrides: Partial<PersonalDetailsRecord> = {}
): PersonalDetailsRecord {
  return {
    id: "pd-1",
    userId: "user-cp-1",
    status: "provided",
    firstName: "Bob",
    lastName: "Smith",
    dateOfBirth: null,
    address: {},
    lastSkippedAt: null,
    createdAt: new Date("2024-01-01"),
    updatedAt: new Date("2024-01-01"),
    ...overrides
  };
}

export function makePendingTransferRecord(
  overrides: Partial<AiPendingTransferRecord> = {}
): AiPendingTransferRecord {
  return {
    id: "pt-1",
    userId: "user-1",
    conversationId: "conv-1",
    assistantId: "virly-assistant",
    recipientEmail: "bob@example.com",
    version: 1,
    currency: "ILS",
    recipientFirstName: "Bob",
    recipientLastName: "Smith",
    amount: 200,
    reason: "lunch",
    status: "pending",
    supersededById: null,
    supersedesId: null,
    idempotencyResults: {},
    expiresAt: new Date("2025-01-01T12:00:00Z"),
    createdAt: new Date("2024-01-01"),
    updatedAt: new Date("2024-01-01"),
    ...overrides
  };
}

// ------ stub repositories -------------------------------------------------------

type DeepPartial<T> = {
  [P in keyof T]?: T[P] extends object ? DeepPartial<T[P]> : T[P];
};

/**
 * Build a minimal Repositories stub. Pass only the sub-repos you need to
 * override — all other methods throw a "not stubbed" error.
 */
export function makeRepos(
  overrides: Partial<Repositories> = {}
): Repositories {
  const notStubbed = (name: string) => async (..._args: unknown[]) => {
    throw new Error(`Repository method not stubbed in this test: ${name}`);
  };

  const defaultUsers: Repositories["users"] = {
    findById: notStubbed("users.findById") as Repositories["users"]["findById"],
    findByIdSafe: notStubbed("users.findByIdSafe") as Repositories["users"]["findByIdSafe"],
    findByEmail: notStubbed("users.findByEmail") as Repositories["users"]["findByEmail"],
    findByEmails: async () => [],
    findManyByIds: async () => [],
    create: notStubbed("users.create") as Repositories["users"]["create"],
    setBalance: notStubbed("users.setBalance") as Repositories["users"]["setBalance"],
    markVerified: notStubbed("users.markVerified") as Repositories["users"]["markVerified"],
    setPersonalDetails: notStubbed("users.setPersonalDetails") as Repositories["users"]["setPersonalDetails"]
  };

  const defaultTransactions: Repositories["transactions"] = {
    createMany: notStubbed("transactions.createMany") as Repositories["transactions"]["createMany"],
    listForOwner: notStubbed("transactions.listForOwner") as Repositories["transactions"]["listForOwner"],
    recentWithCounterparty: async () => [],
    getRelationshipStats: notStubbed("transactions.getRelationshipStats") as Repositories["transactions"]["getRelationshipStats"],
    getDirectionalTotals: async () => ({ creditTotal: 0, creditCount: 0, debitTotal: 0, debitCount: 0 }),
    getDailyDebitUsage: async () => ({ total: 0, count: 0 }),
    findByIdForOwner: async () => null,
    listForOwnerFiltered: async () => [],
    recentForOwner: async () => [],
    lastForOwner: async () => null,
    hasDebitToCounterparty: async () => false
  };

  const defaultPersonalDetails: Repositories["personalDetails"] = {
    findByUserId: notStubbed("personalDetails.findByUserId") as Repositories["personalDetails"]["findByUserId"],
    ensureForUser: notStubbed("personalDetails.ensureForUser") as Repositories["personalDetails"]["ensureForUser"],
    update: notStubbed("personalDetails.update") as Repositories["personalDetails"]["update"],
    findProvidedByUserIds: async () => [],
    findProvidedByName: notStubbed("personalDetails.findProvidedByName") as Repositories["personalDetails"]["findProvidedByName"]
  };

  const defaultAiPendingTransfers: Repositories["aiPendingTransfers"] = {
    findById: notStubbed("aiPendingTransfers.findById") as Repositories["aiPendingTransfers"]["findById"],
    findActiveForConversation: notStubbed("aiPendingTransfers.findActiveForConversation") as Repositories["aiPendingTransfers"]["findActiveForConversation"],
    findActivePendingForUser: notStubbed("aiPendingTransfers.findActivePendingForUser") as Repositories["aiPendingTransfers"]["findActivePendingForUser"],
    listActivePendingForUser: async () => [],
    create: notStubbed("aiPendingTransfers.create") as Repositories["aiPendingTransfers"]["create"],
    updateStatus: notStubbed("aiPendingTransfers.updateStatus") as Repositories["aiPendingTransfers"]["updateStatus"],
    setIdempotencyResult: notStubbed("aiPendingTransfers.setIdempotencyResult") as Repositories["aiPendingTransfers"]["setIdempotencyResult"]
  };

  const noop = async (..._args: unknown[]) => { throw new Error("not stubbed"); };

  return {
    users: defaultUsers,
    transactions: defaultTransactions,
    personalDetails: defaultPersonalDetails,
    exchangeRates: {
      latestForBase: noop as Repositories["exchangeRates"]["latestForBase"],
      findForDate: noop as Repositories["exchangeRates"]["findForDate"],
      upsertForDate: noop as Repositories["exchangeRates"]["upsertForDate"]
    },
    aiConversations: {
      findByConversationId: noop as Repositories["aiConversations"]["findByConversationId"],
      upsert: noop as Repositories["aiConversations"]["upsert"]
    },
    aiPendingTransfers: defaultAiPendingTransfers,
    aiAuditLogs: {
      create: noop as Repositories["aiAuditLogs"]["create"]
    },
    videoSessions: {
      findById: noop as Repositories["videoSessions"]["findById"],
      findByRoomName: noop as Repositories["videoSessions"]["findByRoomName"],
      create: noop as Repositories["videoSessions"]["create"],
      update: noop as Repositories["videoSessions"]["update"],
      listForUser: noop as Repositories["videoSessions"]["listForUser"],
      listForAgentQueue: noop as Repositories["videoSessions"]["listForAgentQueue"]
    },
    videoAuditLogs: {
      create: noop as Repositories["videoAuditLogs"]["create"]
    },
    verificationTokens: {
      upsertForUser: noop as Repositories["verificationTokens"]["upsertForUser"],
      findByUserId: noop as Repositories["verificationTokens"]["findByUserId"],
      deleteForUser: noop as Repositories["verificationTokens"]["deleteForUser"],
      deleteExpired: noop as Repositories["verificationTokens"]["deleteExpired"]
    },
    runInTransaction: async (fn) => fn(undefined),
    ...overrides
  };
}

/** Install a stub repo set and return a cleanup function (call in afterEach). */
export function withRepos(overrides: Partial<Repositories> = {}) {
  setRepositories(makeRepos(overrides));
  return () => clearRepositories();
}
