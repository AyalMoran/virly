

import assert from "node:assert/strict";
import test from "node:test";
import { evaluateAmountExpr } from "../amountExpr.js";

test("multiplies a base amount and rounds to two decimals", () => {
  assert.equal(
    evaluateAmountExpr(62.41, { base: "pending_amount", op: "mul", operand: 2 }),
    124.82
  );
});

test("halves a base amount with round-half-up to two decimals", () => {
  // 62.41 / 2 = 31.205 -> 31.21
  assert.equal(
    evaluateAmountExpr(62.41, { base: "pending_amount", op: "div", operand: 2 }),
    31.21
  );
});

test("adds and subtracts operands", () => {
  assert.equal(
    evaluateAmountExpr(100, { base: "literal", op: "add", operand: 25.5 }),
    125.5
  );
  assert.equal(
    evaluateAmountExpr(100, { base: "literal", op: "sub", operand: 0.49 }),
    99.51
  );
});

test("an expression without an op returns the rounded base value", () => {
  assert.equal(
    evaluateAmountExpr(62.41, { base: "discussed_amount" }),
    62.41
  );
});

test("rejects a non-positive base value", () => {
  assert.throws(() =>
    evaluateAmountExpr(0, { base: "pending_amount", op: "mul", operand: 2 })
  );
  assert.throws(() =>
    evaluateAmountExpr(-5, { base: "literal" })
  );
});

test("rejects division by zero", () => {
  assert.throws(() =>
    evaluateAmountExpr(50, { base: "pending_amount", op: "div", operand: 0 })
  );
});

test("rejects a missing or non-finite operand when an op is present", () => {
  assert.throws(() =>
    evaluateAmountExpr(50, { base: "pending_amount", op: "mul" })
  );
  assert.throws(() =>
    evaluateAmountExpr(50, {
      base: "pending_amount",
      op: "mul",
      operand: Number.NaN
    })
  );
});

test("rejects an expression whose result is not positive", () => {
  assert.throws(() =>
    evaluateAmountExpr(10, { base: "literal", op: "sub", operand: 10 })
  );
  assert.throws(() =>
    evaluateAmountExpr(10, { base: "literal", op: "mul", operand: -1 })
  );
});
