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
    } finally {
      await closeAiPool();
    }
  }
);
