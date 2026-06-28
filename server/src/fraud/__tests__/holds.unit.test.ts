import assert from "node:assert/strict";
import { describe, test } from "node:test";

import { shouldHold } from "../holds.js";

describe("shouldHold policy", () => {
  test("'off' never holds", () => {
    assert.equal(shouldHold("high", "off"), false);
    assert.equal(shouldHold("medium", "off"), false);
    assert.equal(shouldHold("low", "off"), false);
  });

  test("'high' holds only high-risk transfers", () => {
    assert.equal(shouldHold("high", "high"), true);
    assert.equal(shouldHold("medium", "high"), false);
    assert.equal(shouldHold("low", "high"), false);
  });

  test("'medium' holds medium and high", () => {
    assert.equal(shouldHold("high", "medium"), true);
    assert.equal(shouldHold("medium", "medium"), true);
    assert.equal(shouldHold("low", "medium"), false);
  });
});
