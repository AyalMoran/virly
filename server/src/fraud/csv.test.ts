import assert from "node:assert/strict";
import { describe, test } from "node:test";

import { parseCreditCardCsv } from "./csv.js";
import { FRAUD_FEATURE_DIM } from "./types.js";

function makeCsv(rows: string[]): string {
  const vs = Array.from({ length: 28 }, (_, i) => `V${i + 1}`).join(",");
  return [`Time,${vs},Amount,Class`, ...rows].join("\n");
}

/** A row string: time, 28 v-values (all = v), amount, class. */
function rowStr(v: number, amount: number, cls: number): string {
  return [0, ...Array(28).fill(v), amount, cls].join(",");
}

describe("parseCreditCardCsv", () => {
  test("parses V1..V28 + Amount as features (29) and Class as label, dropping Time", () => {
    const csv = makeCsv([rowStr(1, 50, 0), rowStr(2, 99, 1)]);
    const rows = parseCreditCardCsv(csv);
    assert.equal(rows.length, 2);
    assert.equal(rows[0].features.length, FRAUD_FEATURE_DIM);
    // 28 v's of 1 then amount 50
    assert.equal(rows[0].features[0], 1);
    assert.equal(rows[0].features[28], 50);
    assert.equal(rows[0].label, 0);
    assert.equal(rows[1].label, 1);
  });

  test("treats a missing Class column as unlabeled (scoring input)", () => {
    const vs = Array.from({ length: 28 }, (_, i) => `V${i + 1}`).join(",");
    const csv = [`Time,${vs},Amount`, [0, ...Array(28).fill(1), 50].join(",")].join("\n");
    const rows = parseCreditCardCsv(csv);
    assert.equal(rows[0].label, null);
  });

  test("strips quotes and ignores blank lines", () => {
    const csv = makeCsv([rowStr(1, 50, 0), "", rowStr(2, 60, 0)]);
    assert.equal(parseCreditCardCsv(csv).length, 2);
  });

  test("throws on a malformed row and on a missing required column", () => {
    assert.throws(() => parseCreditCardCsv(makeCsv(["1,2,3"])));
    assert.throws(() => parseCreditCardCsv("Time,Amount,Class\n0,50,0"));
  });
});
