// Contract test for the pgvector fraud store + kNN scorer (RAG_PLAN.md M4).
//
// Self-skips unless an AI Postgres URL is set. Run with:
//   CONTRACT_VECTOR_URL=postgres://virly:virly@localhost:5433/virly npm run test:contract
import assert from "node:assert/strict";
import test from "node:test";

import { FRAUD_FEATURE_DIM } from "../../src/fraud/types.js";

const url = process.env.CONTRACT_VECTOR_URL ?? process.env.VIRLY_AI_PG_URL;

/** A feature vector centered at `c` on every dimension. */
const vec = (c: number): number[] => new Array(FRAUD_FEATURE_DIM).fill(c);

test(
  "[pgvector] fraud kNN store",
  { skip: url ? false : "set CONTRACT_VECTOR_URL (or VIRLY_AI_PG_URL) to run" },
  async (t) => {
    process.env.VIRLY_AI_PG_URL = url;
    const { getAiDb, closeAiPool } = await import("../../src/db/vector.js");
    const repo = await import("../../src/fraud/repository.js");
    const { scoreByKnn } = await import("../../src/fraud/knn.js");
    const { listFraudFlags } = await import("../../src/fraud/service.js");
    const { newObjectId } = await import("../../src/repositories/postgres/id.js");
    const { sql } = await import("drizzle-orm");

    try {
      await repo.setupFraudSchema();
      const db = getAiDb();
      await db.execute("TRUNCATE fraud_transactions");

      // Two separable clusters: legit near 0, fraud near +6.
      const records = [
        ...Array.from({ length: 20 }, () => ({ source: "t", features: vec(0), label: 0 as const })),
        ...Array.from({ length: 8 }, () => ({ source: "t", features: vec(6), label: 1 as const }))
      ];
      const inserted = await repo.insertMany(records);
      assert.equal(inserted, 28);

      const counts = await repo.countLabeled();
      assert.deepEqual(counts, { fraud: 8, legit: 20 });

      await t.test("a fraud-like vector scores high", async () => {
        const out = await scoreByKnn(vec(5.8), { k: 5, search: repo.knnSearch });
        assert.ok(out.fraudProbability >= 0.8, `expected >=0.8, got ${out.fraudProbability}`);
        assert.ok(out.nearestFraudDistance !== null);
      });

      await t.test("a legit-like vector scores low", async () => {
        const out = await scoreByKnn(vec(0.1), { k: 5, search: repo.knnSearch });
        assert.ok(out.fraudProbability <= 0.2, `expected <=0.2, got ${out.fraudProbability}`);
      });

      await t.test("knnSearch returns neighbors ordered by ascending distance", async () => {
        const neighbors = await repo.knnSearch(vec(0), 5);
        assert.equal(neighbors.length, 5);
        for (let i = 1; i < neighbors.length; i++) {
          assert.ok(neighbors[i].distance >= neighbors[i - 1].distance);
        }
      });

      await t.test("listFraudFlags reads flags newest-first and filters by level", async () => {
        await listFraudFlags(); // ensure table
        await db.execute("TRUNCATE ai_fraud_flags");
        const uid = newObjectId();
        for (const level of ["medium", "high"]) {
          await db.execute(sql`
            INSERT INTO ai_fraud_flags (id, user_id, transaction_id, recipient_email, amount, score, level, reasons, created_at)
            VALUES (${newObjectId()}, ${uid}, null, ${"dan@example.com"}, ${450}, ${0.8}, ${level}, ${"[]"}::jsonb, now())
          `);
        }
        assert.equal((await listFraudFlags()).length, 2);
        assert.equal((await listFraudFlags({ level: "high" })).length, 1);
        assert.equal((await listFraudFlags({ userId: uid })).length, 2);
      });
    } finally {
      await closeAiPool();
    }
  }
);
