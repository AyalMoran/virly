import assert from "node:assert/strict";
import test from "node:test";
import { executeTransfer } from "../transfer.service.js";
import { setRealtime, noopRealtime } from "../../realtime/registry.js";
import { setRepositories } from "../../repositories/index.js";
import { createMongoRepositories } from "../../repositories/mongo/index.js";
import type { Repositories } from "../../repositories/types.js";

function withTransferRepos() {
  const base = createMongoRepositories();
  const sender = { id: "sender-id", email: "sender@example.com", balance: 1000 } as never;
  const recipient = { id: "recipient-id", email: "recip@example.com", balance: 0 } as never;
  setRepositories({
    ...base,
    runInTransaction: (async (cb: (tx: unknown) => unknown) => cb(undefined)) as never,
    users: {
      ...base.users,
      findById: async (id: string) => (id === "sender-id" ? sender : null),
      findByEmail: async (email: string) => (email === "recip@example.com" ? recipient : null),
      setBalance: (async () => {}) as never
    } as Repositories["users"],
    transactions: {
      ...base.transactions,
      createMany: (async (records: Array<Record<string, unknown>>) =>
        records.map((r, i) => ({ ...r, id: `tx-${i}`, createdAt: new Date(0) }))) as never
    } as Repositories["transactions"]
  });
}

test("executeTransfer notifies the recipient in real time", async () => {
  withTransferRepos();
  const emits: Array<{ userId: string; event: string; amount: number }> = [];
  setRealtime({
    emitToUser: (userId, event, p) =>
      emits.push({ userId, event, amount: (p as { amount: number }).amount })
  });

  await executeTransfer({ senderId: "sender-id", recipientEmail: "recip@example.com", amount: 50, reason: null });

  assert.deepEqual(emits, [{ userId: "recipient-id", event: "transfer:received", amount: 50 }]);
  setRealtime(noopRealtime);
});

test("a realtime emit failure does not break the transfer", async () => {
  withTransferRepos();
  setRealtime({ emitToUser: () => { throw new Error("socket down"); } });

  const result = await executeTransfer({ senderId: "sender-id", recipientEmail: "recip@example.com", amount: 50, reason: null });

  assert.equal(result.newBalance, 950); // 1000 - 50; transfer still succeeded
  setRealtime(noopRealtime);
});
