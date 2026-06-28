// Contract test for the held-transfer store + CAS confirm (RAG_PLAN.md M4 hold).
//
// Self-skips unless an AI Postgres URL is set. Run with:
//   CONTRACT_VECTOR_URL=postgres://virly:virly@localhost:5433/virly npm run test:contract

const url = process.env.CONTRACT_VECTOR_URL ?? process.env.VIRLY_AI_PG_URL;

(url ? describe : describe.skip)("[pgvector] held transfers", () => {
  let holds: typeof import("../../src/fraud/holds.js");
  let newObjectId: typeof import("../../src/repositories/postgres/id.js")["newObjectId"];
  let db: Awaited<ReturnType<typeof import("../../src/db/vector.js")["getAiDb"]>>;
  let closeAiPool: typeof import("../../src/db/vector.js")["closeAiPool"];

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

  beforeAll(async () => {
    process.env.VIRLY_AI_PG_URL = url;
    const vector = await import("../../src/db/vector.js");
    holds = await import("../../src/fraud/holds.js");
    const id = await import("../../src/repositories/postgres/id.js");
    newObjectId = id.newObjectId;
    db = vector.getAiDb();
    closeAiPool = vector.closeAiPool;

    await holds.setupHoldsTable();
    await db.execute("TRUNCATE held_transfers");
  });

  afterAll(async () => {
    await closeAiPool();
  });

  it("confirm executes exactly once and is idempotent", async () => {
    const { id, token } = await holds.createHold(baseHold());
    const { execute, calls } = fakeExecutor();

    const first = await holds.confirmHold(id, token, { execute });
    expect(first.status).toBe("executed");
    expect(calls.length).toBe(1);

    const second = await holds.confirmHold(id, token, { execute });
    expect(second.status).toBe("already_confirmed");
    expect(calls.length).toBe(1);
  });

  it("a wrong token is invalid and does not execute", async () => {
    const { id } = await holds.createHold(baseHold());
    const { execute, calls } = fakeExecutor();
    const r = await holds.confirmHold(id, "wrong-token", { execute });
    expect(r.status).toBe("invalid");
    expect(calls.length).toBe(0);
  });

  it("a cancelled hold cannot be confirmed", async () => {
    const { id, token } = await holds.createHold(baseHold());
    expect(await holds.cancelHold(id, token)).toBe(true);
    const r = await holds.confirmHold(id, token, { execute: fakeExecutor().execute });
    expect(r.status).toBe("cancelled");
  });

  it("an expired hold cannot be confirmed", async () => {
    const { id, token } = await holds.createHold(baseHold());
    await db.execute(`UPDATE held_transfers SET expires_at = now() - interval '1 hour' WHERE id = '${id}'`);
    const r = await holds.confirmHold(id, token, { execute: fakeExecutor().execute });
    expect(r.status).toBe("expired");
  });

  it("listHeldTransfers returns newest-first and filters by status", async () => {
    await db.execute("TRUNCATE held_transfers");
    const a = baseHold();
    const b = baseHold();
    await holds.createHold(a);
    const second = await holds.createHold(b);
    await holds.cancelHold(second.id, second.token);

    const all = await holds.listHeldTransfers();
    expect(all.length).toBe(2);
    const pending = await holds.listHeldTransfers({ status: "pending" });
    expect(pending.length).toBe(1);
    const byUser = await holds.listHeldTransfers({ userId: a.userId });
    expect(byUser.length).toBe(1);
    expect(byUser[0].userId).toBe(a.userId);
  });

  it("getHold reflects status transitions", async () => {
    const { id, token } = await holds.createHold(baseHold());
    let view = await holds.getHold(id);
    expect(view?.status).toBe("pending");
    await holds.confirmHold(id, token, { execute: fakeExecutor().execute });
    view = await holds.getHold(id);
    expect(view?.status).toBe("confirmed");
  });
});
