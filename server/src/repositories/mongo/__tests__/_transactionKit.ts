
// Shared helpers for transaction.repository test suite split.
import { Transaction } from "../../../models/Transaction.js";

export const cleanups: Array<() => void | Promise<void>> = [];

export function patch<T extends object, K extends keyof T>(o: T, k: K, v: T[K]) {
  const orig = o[k]; o[k] = v; cleanups.push(() => { o[k] = orig; });
}

export const OWNER_OID = "507f1f77bcf86cd799439011";

export const leanTx = {
  _id: "60d5ec49f1b2c8a1f8e4e1b1",
  ownerId: OWNER_OID,
  counterpartyEmail: "bob@example.com",
  amount: 100,
  type: "debit",
  directionLabel: "Sent",
  reason: "lunch",
  enteredCurrency: undefined,
  enteredAmount: undefined,
  exchangeRateUsed: undefined,
  exchangeRateFetchedAt: undefined,
  createdAt: new Date("2026-06-01T12:00:00.000Z"),
  updatedAt: new Date("2026-06-01T12:00:00.000Z")
};

export function patchFind(chain: object) {
  patch(Transaction, "find", ((_f: unknown) => chain) as unknown as typeof Transaction.find);
}
