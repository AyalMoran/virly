import assert from "node:assert/strict";
import { describe, test } from "node:test";

import { scoreByKnn } from "./knn.js";
import type { KnnNeighbor } from "./types.js";

const search = (neighbors: KnnNeighbor[]) => async (_f: number[], k: number) =>
  neighbors.slice(0, k);

describe("scoreByKnn", () => {
  test("fraud probability is the fraction of fraud among k neighbors", async () => {
    const out = await scoreByKnn([0], {
      k: 4,
      search: search([
        { label: 1, distance: 0.1 },
        { label: 1, distance: 0.2 },
        { label: 1, distance: 0.3 },
        { label: 0, distance: 0.4 }
      ])
    });
    assert.equal(out.fraudProbability, 0.75);
    assert.equal(out.nearestFraudDistance, 0.1);
  });

  test("all-legit neighbors -> probability 0 and null nearest-fraud distance", async () => {
    const out = await scoreByKnn([0], {
      k: 2,
      search: search([
        { label: 0, distance: 0.5 },
        { label: 0, distance: 0.6 }
      ])
    });
    assert.equal(out.fraudProbability, 0);
    assert.equal(out.nearestFraudDistance, null);
  });

  test("no neighbors (empty store) -> probability 0", async () => {
    const out = await scoreByKnn([0], { k: 5, search: search([]) });
    assert.equal(out.fraudProbability, 0);
    assert.deepEqual(out.neighbors, []);
  });

  test("applies the scaler to the query when provided", async () => {
    let received: number[] = [];
    await scoreByKnn([10, 10], {
      k: 1,
      scaler: { mean: [0, 0], std: [2, 5] },
      search: async (f) => {
        received = f;
        return [{ label: 1, distance: 0 }];
      }
    });
    assert.deepEqual(received, [5, 2]); // (10-0)/2, (10-0)/5
  });
});
