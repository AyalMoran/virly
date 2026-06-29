// Contract test for the pgvector fraud store + kNN scorer (RAG_PLAN.md M4).
//
// Self-skips unless an AI Postgres URL is set. Run with:
//   CONTRACT_VECTOR_URL=postgres://virly:virly@localhost:5433/virly npm run test:contract

import { FRAUD_FEATURE_DIM } from "../../src/fraud/types.js";

const url = process.env.CONTRACT_VECTOR_URL ?? process.env.VIRLY_AI_PG_URL;

/** A feature vector centered at `c` on every dimension. */
const vec = (c: number): number[] => new Array(FRAUD_FEATURE_DIM).fill(c);

(url ? describe : describe.skip)("[pgvector] fraud kNN store", () => {
  let repo: typeof import("../../src/fraud/repository.js");
  let scoreByKnn: typeof import("../../src/fraud/knn.js")["scoreByKnn"];
  let listFraudFlags: typeof import("../../src/fraud/service.js")["listFraudFlags"];
  let newObjectId: typeof import("../../src/repositories/postgres/id.js")["newObjectId"];
  let db: Awaited<ReturnType<typeof import("../../src/db/vector.js")["getAiDb"]>>;
  let closeAiPool: typeof import("../../src/db/vector.js")["closeAiPool"];
  let sql: typeof import("drizzle-orm")["sql"];

  beforeAll(async () => {
    process.env.VIRLY_AI_PG_URL = url;
    const vector = await import("../../src/db/vector.js");
    repo = await import("../../src/fraud/repository.js");
    const knn = await import("../../src/fraud/knn.js");
    const service = await import("../../src/fraud/service.js");
    const id = await import("../../src/repositories/postgres/id.js");
    const drizzle = await import("drizzle-orm");
    scoreByKnn = knn.scoreByKnn;
    listFraudFlags = service.listFraudFlags;
    newObjectId = id.newObjectId;
    db = vector.getAiDb();
    closeAiPool = vector.closeAiPool;
    sql = drizzle.sql;

    await repo.setupFraudSchema();
    await db.execute("TRUNCATE fraud_transactions");

    // Two separable clusters: legit near 0, fraud near +6.
    const records = [
      ...Array.from({ length: 20 }, () => ({ source: "t", features: vec(0), label: 0 as const })),
      ...Array.from({ length: 8 }, () => ({ source: "t", features: vec(6), label: 1 as const }))
    ];
    const inserted = await repo.insertMany(records);
    expect(inserted).toBe(28);

    const counts = await repo.countLabeled();
    expect(counts).toStrictEqual({ fraud: 8, legit: 20 });
  });

  afterAll(async () => {
    await closeAiPool();
  });

  it("a fraud-like vector scores high", async () => {
    const out = await scoreByKnn(vec(5.8), { k: 5, search: repo.knnSearch });
    expect(out.fraudProbability).toBeGreaterThanOrEqual(0.8);
    expect(out.nearestFraudDistance).not.toBeNull();
  });

  it("a legit-like vector scores low", async () => {
    const out = await scoreByKnn(vec(0.1), { k: 5, search: repo.knnSearch });
    expect(out.fraudProbability).toBeLessThanOrEqual(0.2);
  });

  it("knnSearch returns neighbors ordered by ascending distance", async () => {
    const neighbors = await repo.knnSearch(vec(0), 5);
    expect(neighbors.length).toBe(5);
    for (let i = 1; i < neighbors.length; i++) {
      expect(neighbors[i].distance >= neighbors[i - 1].distance).toBeTruthy();
    }
  });

  it("listFraudFlags reads flags newest-first and filters by level", async () => {
    await listFraudFlags(); // ensure table
    await db.execute("TRUNCATE ai_fraud_flags");
    const uid = newObjectId();
    for (const level of ["medium", "high"]) {
      await db.execute(sql`
        INSERT INTO ai_fraud_flags (id, user_id, transaction_id, recipient_email, amount, score, level, reasons, created_at)
        VALUES (${newObjectId()}, ${uid}, null, ${"dan@example.com"}, ${450}, ${0.8}, ${level}, ${"[]"}::jsonb, now())
      `);
    }
    expect((await listFraudFlags()).length).toBe(2);
    expect((await listFraudFlags({ level: "high" })).length).toBe(1);
    expect((await listFraudFlags({ userId: uid })).length).toBe(2);
  });
});
