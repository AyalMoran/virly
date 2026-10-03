// src/services/__tests__/transfer.origin.test.ts
//
// Capture placement matters: the activity event is written AFTER the money
// transaction commits (never with the money `tx`), at the transaction-boundary
// choke point `executeTransfer`. These tests pin that placement.
import { clearRepositories, setRepositories } from "../../repositories/index.js";
import type { ActivityEventCreateInput, Repositories, TxContext } from "../../repositories/types.js";

function worldRepos(opts: { failActivityWrite?: boolean } = {}) {
  const activityCreates: Array<{ input: ActivityEventCreateInput; tx: TxContext | undefined }> = [];
  const txState = { open: false, committed: false };
  const users = [
    { id: "6867f000000000000000000a", email: "sender@test.com", balance: 500 },
    { id: "6867f000000000000000000b", email: "rcpt@test.com", balance: 10 }
  ];
  const repos = {
    async runInTransaction<T>(fn: (tx: TxContext) => Promise<T>): Promise<T> {
      txState.open = true;
      const out = await fn({ session: "fake" } as unknown as TxContext);
      txState.open = false;
      txState.committed = true;
      return out;
    },
    users: {
      async findById(id: string) {
        return users.find((u) => u.id === id) ?? null;
      },
      async findByEmail(email: string) {
        return users.find((u) => u.email === email) ?? null;
      },
      async setBalance() {}
    },
    transactions: {
      async createMany(inputs: Array<Record<string, unknown>>) {
        return inputs.map((input, i) => ({
          ...input,
          id: String(i).padStart(24, "d"), // 24-hex-shaped fake ids: "000...0" / "000...1" with d-padding
          createdAt: new Date(),
          updatedAt: new Date()
        }));
      }
    },
    activityEvents: {
      async create(input: ActivityEventCreateInput, tx?: TxContext) {
        activityCreates.push({ input, tx });
        if (opts.failActivityWrite) throw new Error("activity insert exploded");
        return { ...input, id: "6867f00000000000000000aa", transactionId: input.transactionId ?? null, createdAt: input.at, updatedAt: input.at };
      },
      async listRecentByUser() {
        return [];
      },
      async deleteExpired() {
        return 0;
      }
    }
  } as unknown as Repositories;
  return { repos, activityCreates, txState };
}

afterEach(() => clearRepositories());

test("executeTransfer records the sender's transfer event AFTER the tx commits, without the money tx", async () => {
  const { repos, activityCreates, txState } = worldRepos();
  setRepositories(repos);
  const { executeTransfer } = await import("../transfer.service.js");
  const result = await executeTransfer({
    senderId: "6867f000000000000000000a",
    recipientEmail: "rcpt@test.com",
    amount: 50,
    origin: { ip: "203.0.113.7", geo: { country: "FR", city: "Paris", lat: 48.8566, lng: 2.3522 } }
  });
  expect(activityCreates).toHaveLength(1);
  expect(activityCreates[0]!.input.kind).toBe("transfer");
  expect(activityCreates[0]!.input.userId).toBe("6867f000000000000000000a");
  expect(activityCreates[0]!.input.geo?.city).toBe("Paris");
  expect(activityCreates[0]!.input.transactionId).toBe(result.transaction.id);
  // The write must NOT ride the money transaction, and must land post-commit.
  expect(activityCreates[0]!.tx).toBeUndefined();
  expect(txState.open).toBe(false);
  expect(txState.committed).toBe(true);
});

test("executeTransferWithSession itself writes no activity event (capture is post-commit)", async () => {
  const { repos, activityCreates } = worldRepos();
  setRepositories(repos);
  const { executeTransferWithSession } = await import("../transfer.service.js");
  await executeTransferWithSession(
    {
      senderId: "6867f000000000000000000a",
      recipientEmail: "rcpt@test.com",
      amount: 50,
      origin: { ip: "203.0.113.7", geo: { country: "FR", city: "Paris", lat: 48.8566, lng: 2.3522 } }
    },
    { session: "fake" } as unknown as TxContext
  );
  expect(activityCreates).toHaveLength(0);
});

test("no origin -> no event", async () => {
  const { repos, activityCreates } = worldRepos();
  setRepositories(repos);
  const { executeTransfer } = await import("../transfer.service.js");
  await executeTransfer({
    senderId: "6867f000000000000000000a",
    recipientEmail: "rcpt@test.com",
    amount: 50
  });
  expect(activityCreates).toHaveLength(0);
});

test("a failing event write never fails the transfer", async () => {
  const { repos, activityCreates } = worldRepos({ failActivityWrite: true });
  setRepositories(repos);
  const { executeTransfer } = await import("../transfer.service.js");
  const result = await executeTransfer({
    senderId: "6867f000000000000000000a",
    recipientEmail: "rcpt@test.com",
    amount: 50,
    origin: { ip: "203.0.113.7", geo: { country: "FR", city: "Paris", lat: 48.8566, lng: 2.3522 } }
  });
  expect(activityCreates).toHaveLength(1);
  expect(result.newBalance).toBe(450);
});
