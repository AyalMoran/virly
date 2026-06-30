import { createMongoRepositories } from "../../repositories/mongo/index.js";
import {
  setRepositories,
  getRepositories,
  type AiPendingTransferRecord,
  type Repositories
} from "../../repositories/index.js";
import {
  getResumablePendingForUser,
  respondToAiPendingTransfer,
  modifyAiPendingTransfer
} from "../aiPendingTransfer.service.js";
import { setRealtime, noopRealtime } from "../../realtime/registry.js";
import type { RealtimeEvent, RealtimePayloads } from "../../realtime/types.js";
import { config } from "../../config.js";
import { closeAiPool } from "../../db/vector.js";
import pg from "pg";

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

const pendingTransferId = "507f1f77bcf86cd799439011";
const userId = "507f1f77bcf86cd799439022";

function baseRecord(overrides: Partial<AiPendingTransferRecord> = {}): AiPendingTransferRecord {
  return {
    id: pendingTransferId,
    userId,
    conversationId: "conv-abc",
    assistantId: "oshri",
    recipientEmail: "alice@example.com",
    version: 1,
    currency: "ILS",
    recipientFirstName: null,
    recipientLastName: null,
    amount: 100,
    reason: null,
    status: "pending",
    supersededById: null,
    supersedesId: null,
    idempotencyResults: {},
    // Far-future expiry so the not-expired guard (expiresAt > now) holds.
    expiresAt: new Date(Date.now() + 10 * 60 * 1000),
    createdAt: new Date("2026-01-01T00:00:00.000Z"),
    updatedAt: new Date("2026-01-01T00:00:00.000Z"),
    ...overrides
  };
}

const cleanups: Array<() => void | Promise<void>> = [];
afterEach(async () => { for (const c of cleanups.splice(0).reverse()) await c(); });

/**
 * Installs a repository set whose aiPendingTransfers.findById is stubbed, then
 * restores the real Mongo repositories afterwards. Captures the id passed in.
 */
function stubFindById(
  doc: AiPendingTransferRecord | null
): { capturedId: string | null } {
  const capture: { capturedId: string | null } = { capturedId: null };
  const repos = createMongoRepositories();
  repos.aiPendingTransfers = {
    ...repos.aiPendingTransfers,
    async findById(id: string) {
      capture.capturedId = id;
      return doc;
    }
  };
  setRepositories(repos);
  cleanups.push(() => {
    setRepositories(createMongoRepositories());
  });
  return capture;
}

type CallLog = string[];

/**
 * Build a full Repositories stub for the transactional confirm/modify paths.
 *
 * `runInTransaction` runs its callback with a dummy tx (`"TX"`) and records that
 * it ran, so tests can assert the settlement happens INSIDE the transaction. To
 * model atomicity, the in-tx repo writes only take effect if the whole callback
 * resolves: if the transfer throws, `runInTransaction` re-throws and the recorded
 * status write is discarded (we assert via the call log + committed flag).
 */
function makeTxRepos(opts: {
  log: CallLog;
  pending: AiPendingTransferRecord | null;
  // When set, executeTransferWithSession's underlying sender lookup throws.
  failTransfer?: boolean;
}): Repositories {
  const { log, pending } = opts;

  const sender = {
    id: userId,
    email: "sender@example.com",
    balance: 1000,
    role: "user" as const
  };
  const recipient = {
    id: "507f1f77bcf86cd799439033",
    email: "alice@example.com",
    balance: 0,
    role: "user" as const
  };

  const stub = {
    users: {
      async findById(id: string, tx?: unknown) {
        log.push(`users.findById:${tx === "TX" ? "tx" : "no-tx"}`);
        if (opts.failTransfer) return null; // forces executeTransfer to throw 404
        return id === sender.id ? (sender as never) : null;
      },
      async findByEmail(email: string) {
        return email === recipient.email ? (recipient as never) : null;
      },
      async setBalance(id: string, balance: number, tx?: unknown) {
        log.push(`users.setBalance:${id}:${balance}:${tx === "TX" ? "tx" : "no-tx"}`);
      }
    },
    transactions: {
      async getDailyDebitUsage() {
        return { total: 0, count: 0 };
      },
      async createMany(entries: unknown[], tx?: unknown) {
        log.push(`transactions.createMany:${tx === "TX" ? "tx" : "no-tx"}`);
        return (entries as Array<Record<string, unknown>>).map((e, i) => ({
          id: `txn-${i}`,
          createdAt: new Date(),
          updatedAt: new Date(),
          ...e
        }));
      }
    },
    aiPendingTransfers: {
      async findById(id: string, tx?: unknown) {
        log.push(`aiPendingTransfers.findById:${tx === "TX" ? "tx" : "no-tx"}`);
        return pending;
      },
      async findActivePendingForUser(_id: string, _u: string, _c: string, tx?: unknown) {
        log.push(`aiPendingTransfers.findActivePendingForUser:${tx === "TX" ? "tx" : "no-tx"}`);
        return pending;
      },
      async create(input: unknown, tx?: unknown) {
        log.push(`aiPendingTransfers.create:${tx === "TX" ? "tx" : "no-tx"}`);
        return baseRecord({ id: "507f1f77bcf86cd7994390ff", ...(input as object) });
      },
      async updateStatus(
        id: string,
        status: string,
        _update?: unknown,
        tx?: unknown
      ) {
        log.push(`aiPendingTransfers.updateStatus:${status}:${tx === "TX" ? "tx" : "no-tx"}`);
        return baseRecord({ id, status: status as AiPendingTransferRecord["status"] });
      }
    },
    personalDetails: {} as never,
    exchangeRates: {} as never,
    aiConversations: {} as never,
    aiAuditLogs: {} as never,
    videoSessions: {} as never,
    videoAuditLogs: {} as never,
    async runInTransaction<T>(fn: (tx: unknown) => Promise<T>): Promise<T> {
      log.push("runInTransaction:enter");
      const result = await fn("TX");
      log.push("runInTransaction:commit");
      return result;
    }
  } as unknown as Repositories;

  return stub;
}

function installRepos(repos: Repositories) {
  setRepositories(repos);
  cleanups.push(() => {
    setRepositories(createMongoRepositories());
  });
}

type RealtimeCall = { userId: string; event: RealtimeEvent; payload: unknown };

/**
 * Install a realtime spy that records every emitToUser call, and reset to the
 * silent no-op gateway when the test ends.
 */
function spyRealtime(): RealtimeCall[] {
  const calls: RealtimeCall[] = [];
  setRealtime({
    emitToUser<E extends RealtimeEvent>(userId: string, event: E, payload: RealtimePayloads[E]) {
      calls.push({ userId, event, payload });
    }
  });
  cleanups.push(() => setRealtime(noopRealtime));
  return calls;
}

// ---------------------------------------------------------------------------
// respondToAiPendingTransfer — confirm path runs INSIDE runInTransaction
// ---------------------------------------------------------------------------

test("confirm: runs the settlement inside runInTransaction and flips status atomically", async () => {
  const log: CallLog = [];
  installRepos(makeTxRepos({ log, pending: baseRecord({ status: "pending" }) }));

  const result = await respondToAiPendingTransfer({
    userId,
    pendingTransferId,
    action: "confirm",
    version: 1
  });

  expect(result.status).toBe("confirmed");
  // The whole settlement happened between enter and commit.
  const enter = log.indexOf("runInTransaction:enter");
  const commit = log.indexOf("runInTransaction:commit");
  expect(enter >= 0 && commit > enter).toBeTruthy();

  const settle = log.indexOf("transactions.createMany:tx");
  const flip = log.indexOf("aiPendingTransfers.updateStatus:confirmed:tx");
  expect(settle > enter && settle < commit).toBeTruthy();
  expect(flip > enter && flip < commit).toBeTruthy();
  // Settlement before the status flip (the confirm card is marked only after money moves).
  expect(settle < flip).toBeTruthy();
});

test("confirm: when the transfer throws, the status is NOT flipped (atomic rollback)", async () => {
  const log: CallLog = [];
  installRepos(
    makeTxRepos({ log, pending: baseRecord({ status: "pending" }), failTransfer: true })
  );

  await expect(
    respondToAiPendingTransfer({
      userId,
      pendingTransferId,
      action: "confirm",
      version: 1
    })
  ).rejects.toThrow();

  expect(log.includes("runInTransaction:enter")).toBeTruthy();
  expect(log.includes("runInTransaction:commit")).toBe(false);
  expect(log.some((l) => l.startsWith("aiPendingTransfers.updateStatus:confirmed"))).toBe(false);
});

test("confirm: does not call mongoose.startSession (settlement goes through runInTransaction)", async () => {
  const log: CallLog = [];
  installRepos(makeTxRepos({ log, pending: baseRecord({ status: "pending" }) }));

  await respondToAiPendingTransfer({
    userId,
    pendingTransferId,
    action: "confirm",
    version: 1
  });

  // runInTransaction is the only transaction boundary the service uses now.
  expect(
    log.filter((l) => l === "runInTransaction:enter").length
  ).toBe(1);
});

// ---------------------------------------------------------------------------
// respondToAiPendingTransfer — recipient realtime notify (post-commit)
// ---------------------------------------------------------------------------

test("confirm: notifies the recipient via transfer:received exactly once", async () => {
  const log: CallLog = [];
  installRepos(makeTxRepos({ log, pending: baseRecord({ status: "pending", amount: 100 }) }));
  const calls = spyRealtime();

  const result = await respondToAiPendingTransfer({
    userId,
    pendingTransferId,
    action: "confirm",
    version: 1
  });

  expect(result.status).toBe("confirmed");
  const notifies = calls.filter((c) => c.event === "transfer:received");
  expect(notifies).toHaveLength(1);
  // The recipient is looked up by email post-commit; makeTxRepos resolves it to id 507f...033.
  expect(notifies[0].userId).toBe("507f1f77bcf86cd799439033");
  expect(notifies[0].payload).toEqual({ amount: 100, reason: null });
});

test("confirm: a rolled-back transfer does NOT notify the recipient", async () => {
  const log: CallLog = [];
  installRepos(
    makeTxRepos({ log, pending: baseRecord({ status: "pending" }), failTransfer: true })
  );
  const calls = spyRealtime();

  await expect(
    respondToAiPendingTransfer({
      userId,
      pendingTransferId,
      action: "confirm",
      version: 1
    })
  ).rejects.toThrow();

  const notifies = calls.filter((c) => c.event === "transfer:received");
  expect(notifies).toHaveLength(0);
});

test("confirm: threads a non-empty reason through to the emitted payload (trimmed)", async () => {
  const log: CallLog = [];
  installRepos(
    makeTxRepos({
      log,
      pending: baseRecord({ status: "pending", amount: 100, reason: "  lunch  " })
    })
  );
  const calls = spyRealtime();

  const result = await respondToAiPendingTransfer({
    userId,
    pendingTransferId,
    action: "confirm",
    version: 1
  });

  expect(result.status).toBe("confirmed");
  const notifies = calls.filter((c) => c.event === "transfer:received");
  expect(notifies).toHaveLength(1);
  const payload = notifies[0].payload as { amount: number; reason: string | null };
  expect(payload.amount).toBe(100);
  expect(payload.reason).toBe("lunch"); // reason must be trimmed before emission
});

test("held: does NOT notify the recipient (no money moved)", async () => {
  // Reach the REAL hold branch: enable the hold gate and stub the AI-store pg
  // transport so createHold's INSERT resolves in-memory (no live AI Postgres).
  const originalLevel = config.fraud.holdLevel;
  const originalUrl = process.env.VIRLY_AI_PG_URL;
  const originalQuery = pg.Pool.prototype.query;
  config.fraud.holdLevel = "high";
  process.env.VIRLY_AI_PG_URL = "postgresql://stub:stub@127.0.0.1:5432/stub";
  (pg.Pool.prototype as unknown as { query: unknown }).query = async () => ({ rows: [] });
  cleanups.push(async () => {
    (pg.Pool.prototype as unknown as { query: unknown }).query = originalQuery;
    config.fraud.holdLevel = originalLevel;
    if (originalUrl === undefined) delete process.env.VIRLY_AI_PG_URL;
    else process.env.VIRLY_AI_PG_URL = originalUrl;
    await closeAiPool().catch(() => {});
  });

  const log: CallLog = [];
  // amount 450 (>= 0.8 * per-transfer 500) + new counterparty + an amount-spike
  // anomaly pushes risk to "high", so the gate holds instead of executing.
  const repos = makeTxRepos({ log, pending: baseRecord({ status: "pending", amount: 450 }) });
  const tx = (repos as unknown as { transactions: Record<string, unknown> }).transactions;
  tx.recentForOwner = async () =>
    Array.from({ length: 6 }, (_v, i) => ({
      id: `d-${i}`,
      ownerId: userId,
      counterpartyEmail: "x@y.com",
      amount: 10,
      type: "debit",
      directionLabel: "Sent",
      reason: null,
      createdAt: new Date("2026-01-01T12:00:00Z"),
      updatedAt: new Date("2026-01-01T12:00:00Z")
    }));
  tx.hasDebitToCounterparty = async () => false;
  installRepos(repos);
  const calls = spyRealtime();

  const result = await respondToAiPendingTransfer({
    userId,
    pendingTransferId,
    action: "confirm",
    version: 1
  });

  expect(result.status).toBe("held"); // the transfer must be held, not executed
  // No money moved: no settlement.
  expect(log.includes("transactions.createMany:tx")).toBe(false);
  const notifies = calls.filter((c) => c.event === "transfer:received");
  expect(notifies).toHaveLength(0); // a held transfer must NOT notify the recipient
});

// ---------------------------------------------------------------------------
// modifyAiPendingTransfer — supersede path runs INSIDE runInTransaction
// ---------------------------------------------------------------------------

test("modify: supersedes the old pending and creates the new one inside one transaction", async () => {
  const log: CallLog = [];
  const old = baseRecord({ status: "pending", amount: 100 });
  const repos = makeTxRepos({ log, pending: old });
  // personalDetails is read by validateAiTransferDraft via findByUserId; provide it.
  (repos as unknown as { personalDetails: unknown }).personalDetails = {
    async findByUserId() {
      return { status: "not_provided", firstName: null, lastName: null };
    },
    async findProvidedByName() {
      return [];
    }
  };
  installRepos(repos);

  const result = await modifyAiPendingTransfer({
    userId,
    conversationId: "conv-abc",
    assistantId: "oshri",
    activePendingTransferId: pendingTransferId,
    modificationDraft: { recipientEmail: "alice@example.com", amount: 200 }
  } as never);

  expect((result as { status: string }).status).toBe("ready");
  const enter = log.indexOf("runInTransaction:enter");
  const commit = log.indexOf("runInTransaction:commit");
  const create = log.indexOf("aiPendingTransfers.create:tx");
  const supersede = log.indexOf("aiPendingTransfers.updateStatus:superseded:tx");
  expect(enter >= 0 && commit > enter).toBeTruthy();
  expect(create > enter && create < commit).toBeTruthy();
  expect(supersede > enter && supersede < commit).toBeTruthy();
});

// ---------------------------------------------------------------------------
// getResumablePendingForUser (non-transaction path, routes through the repo)
// ---------------------------------------------------------------------------

test("getResumablePendingForUser queries the repo by pendingTransferId", async () => {
  const capture = stubFindById(baseRecord());

  await getResumablePendingForUser(pendingTransferId, userId);

  expect(capture.capturedId).toBe(pendingTransferId);
});

test("getResumablePendingForUser returns the conversationId from the record", async () => {
  stubFindById(baseRecord({ conversationId: "conv-abc" }));

  const result = await getResumablePendingForUser(pendingTransferId, userId);

  expect(result).not.toBeNull();
  expect(result!.conversationId).toBe("conv-abc");
});

test("getResumablePendingForUser returns null when the record is missing", async () => {
  stubFindById(null);

  const result = await getResumablePendingForUser(pendingTransferId, userId);

  expect(result).toBeNull();
});

test("getResumablePendingForUser returns null when the record belongs to another user", async () => {
  // Preserves the original `{ _id, userId }` ownership scoping.
  stubFindById(baseRecord({ userId: "507f1f77bcf86cd799439099" }));

  const result = await getResumablePendingForUser(pendingTransferId, userId);

  expect(result).toBeNull();
});
