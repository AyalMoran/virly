/**
 * Transaction + account-summary fixtures. Every item sets `reason` so the
 * `formatRelativeDate(Date.now())` branch (non-deterministic) is never hit.
 */
import type {
  AccountSummary,
  Pagination,
  Transaction,
  TransactionsResponse,
} from "@/lib/types";

export const transactionsFixture: Transaction[] = [
  {
    id: "txn_0001",
    amount: -250.0,
    counterpartyEmail: "maya.cohen@virly.test",
    reason: "Dinner split",
    date: "2026-06-20T18:30:00.000Z",
  },
  {
    id: "txn_0002",
    amount: 1200.0,
    counterpartyEmail: "payroll@acme.test",
    reason: "June salary",
    date: "2026-06-19T08:00:00.000Z",
  },
  {
    id: "txn_0003",
    amount: -75.5,
    counterpartyEmail: "noa.levi@virly.test",
    reason: "Concert tickets",
    date: "2026-06-18T20:15:00.000Z",
  },
  {
    id: "txn_0004",
    amount: 300.0,
    counterpartyEmail: "maya.cohen@virly.test",
    reason: "Shared rent refund",
    date: "2026-06-16T11:00:00.000Z",
  },
];

/** A single foreign-currency transaction, exercising the FX metadata branch. */
export const fxTransactionFixture: Transaction = {
  id: "txn_fx_0001",
  amount: -370.37,
  counterpartyEmail: "studio@berlin.test",
  reason: "Design retainer",
  date: "2026-06-15T09:30:00.000Z",
  fx: {
    enteredCurrency: "USD",
    enteredAmount: 100,
    exchangeRateUsed: 0.27,
    exchangeRateFetchedAt: "2026-06-15T08:00:00.000Z",
  },
};

export const emptyTransactionsFixture: Transaction[] = [];

export const paginationFixture: Pagination = {
  page: 1,
  limit: 10,
  total: 4,
  totalPages: 1,
};

/** Many pages so the windowed pagination strip + jump input renders. */
export const manyPagesPaginationFixture: Pagination = {
  page: 3,
  limit: 10,
  total: 142,
  totalPages: 15,
};

export const transactionsResponseFixture: TransactionsResponse = {
  transactions: transactionsFixture,
  pagination: paginationFixture,
};

export const emptyTransactionsResponseFixture: TransactionsResponse = {
  transactions: emptyTransactionsFixture,
  pagination: { page: 1, limit: 10, total: 0, totalPages: 0 },
};

export const accountSummaryFixture: AccountSummary = {
  balance: 1250.0,
  personalDetails: {
    id: "pd_test_0001",
    status: "provided",
    firstName: "Test",
    needsPersonalDetails: false,
  },
  transactions: transactionsFixture,
  pagination: paginationFixture,
};
