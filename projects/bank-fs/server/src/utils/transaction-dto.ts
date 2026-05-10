import { InferSchemaType } from "mongoose";
import { Transaction } from "../models/Transaction.js";

type TransactionDocument = InferSchemaType<typeof Transaction.schema> & {
  _id: unknown;
  createdAt?: Date;
};

export function toTransactionDto(transaction: TransactionDocument) {
  const signedAmount =
    transaction.type === "debit" ? -transaction.amount : transaction.amount;

  return {
    id: String(transaction._id),
    counterpartyEmail: transaction.counterpartyEmail,
    amount: signedAmount,
    reason: transaction.reason ?? undefined,
    date: transaction.createdAt?.toISOString()
  };
}
