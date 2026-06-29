import { toTransactionDto } from "../transaction-dto.js";

const baseTx = {
  counterpartyEmail: "bob@example.com",
  amount: 100,
  type: "credit",
  createdAt: new Date("2026-06-01T09:00:00.000Z")
};

describe("toTransactionDto", () => {
  test("keeps credit amounts positive", () => {
    expect(toTransactionDto({ ...baseTx, id: "t1" }).amount).toBe(100);
  });

  test("signs debit amounts negative", () => {
    expect(
      toTransactionDto({ ...baseTx, id: "t1", type: "debit" }).amount
    ).toBe(-100);
  });

  test("resolves id from `id` when present", () => {
    expect(toTransactionDto({ ...baseTx, id: "t1" }).id).toBe("t1");
  });

  test("falls back to `_id` when `id` is absent", () => {
    expect(toTransactionDto({ ...baseTx, _id: 42 }).id).toBe("42");
  });

  test("serialises the date and maps an empty reason to undefined", () => {
    const dto = toTransactionDto({ ...baseTx, id: "t1", reason: null });
    expect(dto.date).toBe("2026-06-01T09:00:00.000Z");
    expect(dto.reason).toBeUndefined();
  });

  test("omits fx for ILS or missing entered currency", () => {
    expect(toTransactionDto({ ...baseTx, id: "t1" }).fx).toBeUndefined();
    expect(
      toTransactionDto({ ...baseTx, id: "t1", enteredCurrency: "ILS" }).fx
    ).toBeUndefined();
  });

  test("includes fx details for a non-ILS entered currency", () => {
    const dto = toTransactionDto({
      ...baseTx,
      id: "t1",
      enteredCurrency: "USD",
      enteredAmount: 27,
      exchangeRateUsed: 3.7,
      exchangeRateFetchedAt: new Date("2026-06-01T08:00:00.000Z")
    });
    expect(dto.fx).toStrictEqual({
      enteredCurrency: "USD",
      enteredAmount: 27,
      exchangeRateUsed: 3.7,
      exchangeRateFetchedAt: "2026-06-01T08:00:00.000Z"
    });
  });
});
