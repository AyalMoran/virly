import { evaluateAmountExpr } from "../amountExpr.js";

test("multiplies a base amount and rounds to two decimals", () => {
  expect(
    evaluateAmountExpr(62.41, { base: "pending_amount", op: "mul", operand: 2 })
  ).toBe(124.82);
});

test("halves a base amount with round-half-up to two decimals", () => {
  // 62.41 / 2 = 31.205 -> 31.21
  expect(
    evaluateAmountExpr(62.41, { base: "pending_amount", op: "div", operand: 2 })
  ).toBe(31.21);
});

test("adds and subtracts operands", () => {
  expect(
    evaluateAmountExpr(100, { base: "literal", op: "add", operand: 25.5 })
  ).toBe(125.5);
  expect(
    evaluateAmountExpr(100, { base: "literal", op: "sub", operand: 0.49 })
  ).toBe(99.51);
});

test("an expression without an op returns the rounded base value", () => {
  expect(evaluateAmountExpr(62.41, { base: "discussed_amount" })).toBe(62.41);
});

test("rejects a non-positive base value", () => {
  expect(() =>
    evaluateAmountExpr(0, { base: "pending_amount", op: "mul", operand: 2 })
  ).toThrow();
  expect(() => evaluateAmountExpr(-5, { base: "literal" })).toThrow();
});

test("rejects division by zero", () => {
  expect(() =>
    evaluateAmountExpr(50, { base: "pending_amount", op: "div", operand: 0 })
  ).toThrow();
});

test("rejects a missing or non-finite operand when an op is present", () => {
  expect(() =>
    evaluateAmountExpr(50, { base: "pending_amount", op: "mul" })
  ).toThrow();
  expect(() =>
    evaluateAmountExpr(50, {
      base: "pending_amount",
      op: "mul",
      operand: Number.NaN
    })
  ).toThrow();
});

test("rejects an expression whose result is not positive", () => {
  expect(() =>
    evaluateAmountExpr(10, { base: "literal", op: "sub", operand: 10 })
  ).toThrow();
  expect(() =>
    evaluateAmountExpr(10, { base: "literal", op: "mul", operand: -1 })
  ).toThrow();
});
