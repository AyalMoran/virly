// Contract test for the held-transfer store + CAS confirm (RAG_PLAN.md M4 hold).
//
// Self-skips unless an AI Postgres URL is set. Run with:
//   CONTRACT_VECTOR_URL=postgres://virly:virly@localhost:5433/virly npm run test:contract
import assert from "node:assert/strict";
import test from "node:test";

const url = process.env.CONTRACT_VECTOR_URL ?? process.env.VIRLY_AI_PG_URL;

test(
  "[pgvector] held transfers",
  { skip: url ? false : "set CONTRACT_VECTOR_URL (or VIRLY_AI_PG_URL) to run" },
  async (t) => {
    process.env.VIRLY_AI_PG_URL = url;
    const { getAiDb, closeAiPool } = await import("../../src/db/vector.js");
    const holds = await import("../../src/fraud/holds.js");
    const { newObjectId } = await import("../../src/repositories/postgres/id.js");

    // A fake executor records calls so we can assert money "moves" exactly once.
    function fakeExecutor() {
      const calls: unknown[] = [];
      const execute = async (input: unknown) => {
        calls.push(input);
        return { newBalance: 100, transaction: { id: newObjectId() } };
      };
      return { execute, calls };
    }

    const baseHold = () => ({
      userId: newObjectId(),
      recipientEmail: "dan@example.com",
      amount: 450,
      currency: "ILS",
      reason: "rent",
      score: 0.8,
      level: "high" as const,
      reasons: ["new recipient", "high amount"]
    });

    try {
      await holds.setupHoldsTable();
      const db = getAiDb();
      await db.execute("TRUNCATE held_transfers");

      await t.test("confirm executes exactly once and is idempotent", async () => {
        const { id, token } = await holds.createHold(baseHold());
        const { execute, calls } = fakeExecutor();

        const first = await holds.confirmHold(id, token, { execute });
        assert.equal(first.status, "executed");
        assert.equal(calls.length, 1);

        const second = await holds.confirmHold(id, token, { execute });
        assert.equal(second.status, "already_confirmed");
        assert.equal(calls.length, 1, "must not execute twice");
      });

      await t.test("a wrong token is invalid and does not execute", async () => {
        const { id } = await holds.createHold(baseHold());
        const { execute, calls } = fakeExecutor();
        const r = await holds.confirmHold(id, "wrong-token", { execute });
        assert.equal(r.status, "invalid");
        assert.equal(calls.length, 0);
      });

      await t.test("a cancelled hold cannot be confirmed", async () => {
        const { id, token } = await holds.createHold(baseHold());
        assert.equal(await holds.cancelHold(id, token), true);
        const r = await holds.confirmHold(id, token, { execute: fakeExecutor().execute });
        assert.equal(r.status, "cancelled");
      });

      await t.test("an expired hold cannot be confirmed", async () => {
        const { id, token } = await holds.createHold(baseHold());
        await db.execute(`UPDATE held_transfers SET expires_at = now() - interval '1 hour' WHERE id = '${id}'`);
        const r = await holds.confirmHold(id, token, { execute: fakeExecutor().execute });
        assert.equal(r.status, "expired");
      });

      await t.test("listHeldTransfers returns newest-first and filters by status", async () => {
        await db.execute("TRUNCATE held_transfers");
        const a = baseHold();
        const b = baseHold();
        await holds.createHold(a);
        const second = await holds.createHold(b);
        await holds.cancelHold(second.id, second.token);

        const all = await holds.listHeldTransfers();
        assert.equal(all.length, 2);
        const pending = await holds.listHeldTransfers({ status: "pending" });
        assert.equal(pending.length, 1);
        const byUser = await holds.listHeldTransfers({ userId: a.userId });
        assert.equal(byUser.length, 1);
        assert.equal(byUser[0].userId, a.userId);
      });

      await t.test("getHold reflects status transitions", async () => {
        const { id, token } = await holds.createHold(baseHold());
        let view = await holds.getHold(id);
        assert.equal(view?.status, "pending");
        await holds.confirmHold(id, token, { execute: fakeExecutor().execute });
        view = await holds.getHold(id);
        assert.equal(view?.status, "confirmed");
      });
    } finally {
      await closeAiPool();
    }
  }
);
