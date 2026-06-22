import type { TransactionRecord } from "../repositories/types.js";

// A minimal shape that covers both a TransactionRecord (with `id`) and a
// Mongoose Document (with `_id`) so that transfer.service and ai/tools callers
// that haven't migrated yet continue to type-check. The `enteredCurrency` field
// is widened to include null because Mongoose documents can return null there.
type TransactionInput = {
  id?: string;
  _id?: unknown;
  counterpartyEmail: string;
  amount: number;
  type: string;
  reason?: string | null;
  enteredCurrency?: string | null;
  enteredAmount?: number | null;
  exchangeRateUsed?: number | null;
  exchangeRateFetchedAt?: Date | null;
  createdAt?: Date;
};

function resolveId(transaction: TransactionInput): string {
  if (transaction.id !== undefined) {
    return String(transaction.id);
  }
  return String(transaction._id);
}

export function toTransactionDto(transaction: TransactionInput) {
  const signedAmount =
    transaction.type === "debit" ? -transaction.amount : transaction.amount;

  return {
    id: resolveId(transaction),
    counterpartyEmail: transaction.counterpartyEmail,
    amount: signedAmount,
    reason: transaction.reason ?? undefined,
    date: transaction.createdAt?.toISOString(),
    fx:
      transaction.enteredCurrency && transaction.enteredCurrency !== "ILS"
        ? {
            enteredCurrency: transaction.enteredCurrency,
            enteredAmount: transaction.enteredAmount ?? undefined,
            exchangeRateUsed: transaction.exchangeRateUsed ?? undefined,
            exchangeRateFetchedAt: transaction.exchangeRateFetchedAt?.toISOString()
          }
        : undefined
  };
}
