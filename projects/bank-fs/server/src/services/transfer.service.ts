import type { ClientSession } from "mongoose";
import mongoose from "mongoose";
import { Transaction } from "../models/Transaction.js";
import { User } from "../models/User.js";
import { toTransactionDto } from "../utils/transaction-dto.js";

export type ExecuteTransferInput = {
  senderId: string;
  recipientEmail: string;
  amount: number;
  reason?: string | null;
};

export type ExecuteTransferResult = {
  message: string;
  newBalance: number;
  transaction: ReturnType<typeof toTransactionDto>;
};

export async function executeTransferWithSession(
  input: ExecuteTransferInput,
  session: ClientSession
): Promise<ExecuteTransferResult> {
  const sender = await User.findById(input.senderId).session(session);

  if (!sender) {
    throw Object.assign(new Error("Sender account not found."), { status: 404 });
  }

  const normalizedRecipientEmail = input.recipientEmail.toLowerCase();
  if (sender.email === normalizedRecipientEmail) {
    throw Object.assign(new Error("You cannot transfer money to yourself."), {
      status: 400
    });
  }

  const recipient = await User.findOne({ email: normalizedRecipientEmail }).session(
    session
  );
  if (!recipient) {
    throw Object.assign(new Error("Recipient email does not exist."), {
      status: 404
    });
  }

  if (sender.balance < input.amount) {
    throw Object.assign(new Error("Insufficient balance."), { status: 400 });
  }

  sender.balance = Number((sender.balance - input.amount).toFixed(2));
  recipient.balance = Number((recipient.balance + input.amount).toFixed(2));

  await sender.save({ session });
  await recipient.save({ session });

  const createdTransactions = await Transaction.create(
    [
      {
        ownerId: sender.id,
        counterpartyEmail: recipient.email,
        amount: input.amount,
        type: "debit",
        directionLabel: "Sent",
        reason: input.reason?.trim() || undefined
      },
      {
        ownerId: recipient.id,
        counterpartyEmail: sender.email,
        amount: input.amount,
        type: "credit",
        directionLabel: "Received",
        reason: input.reason?.trim() || undefined
      }
    ],
    { session, ordered: true }
  );

  const senderTransaction = createdTransactions[0];
  if (!senderTransaction) {
    throw new Error("Transfer failed.");
  }

  return {
    message: "Transfer completed successfully.",
    newBalance: sender.balance,
    transaction: toTransactionDto(senderTransaction)
  };
}

export async function executeTransfer(
  input: ExecuteTransferInput
): Promise<ExecuteTransferResult> {
  const session = await mongoose.startSession();

  try {
    let result: ExecuteTransferResult | undefined;

    await session.withTransaction(async () => {
      result = await executeTransferWithSession(input, session);
    });

    if (!result) {
      throw new Error("Transfer failed.");
    }

    return result;
  } finally {
    await session.endSession();
  }
}
