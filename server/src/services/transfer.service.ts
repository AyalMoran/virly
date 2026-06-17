import type { ClientSession } from "mongoose";
import mongoose from "mongoose";
import { config } from "../config.js";
import { Transaction } from "../models/Transaction.js";
import { User } from "../models/User.js";
import { AppError } from "../utils/app-error.js";
import { toTransactionDto } from "../utils/transaction-dto.js";

export type TransferFxMetadata = {
  enteredCurrency: "USD" | "EUR";
  enteredAmount: number;
  exchangeRateUsed: number;
  exchangeRateFetchedAt: Date;
};

export type ExecuteTransferInput = {
  senderId: string;
  recipientEmail: string;
  /** Always the authoritative ILS amount, regardless of the entered currency. */
  amount: number;
  reason?: string | null;
  fx?: TransferFxMetadata | null;
};

export type ExecuteTransferResult = {
  message: string;
  newBalance: number;
  transaction: ReturnType<typeof toTransactionDto>;
};

/**
 * Enforce the AI-assistant transfer guardrails (per-transfer + daily caps) at
 * the settlement trust boundary, inside the transfer transaction. These limits
 * previously lived only in the LLM tool layer (advisory) and the daily cap was
 * enforced on no write path at all; this makes them a server invariant for
 * AI-confirmed transfers regardless of how the confirmation card was produced.
 * Direct (UI) transfers are intentionally NOT capped here — these are the
 * `config.ai.*` assistant limits, not a general account limit.
 *
 * Note: the daily check reads same-day debits within the session. MongoDB's
 * snapshot isolation does not fully serialize two concurrent confirmations
 * (write-skew remains possible), but this closes the by-design bypass where the
 * daily cap was never checked at settlement.
 */
export async function assertAiTransferWithinLimits(
  input: { senderId: string; amount: number },
  session: ClientSession
): Promise<void> {
  const perTransferLimit = config.ai.perTransferLimit;
  if (input.amount > perTransferLimit) {
    throw new AppError(
      400,
      `That amount exceeds the per-transfer limit of ${perTransferLimit.toFixed(2)} ILS.`,
      { code: "EXCEEDS_PER_TRANSFER_LIMIT" }
    );
  }

  const now = new Date();
  const startOfDay = new Date(now.getFullYear(), now.getMonth(), now.getDate());
  const nextDay = new Date(now.getFullYear(), now.getMonth(), now.getDate() + 1);

  const debitsToday = await Transaction.find({
    ownerId: input.senderId,
    type: "debit",
    createdAt: { $gte: startOfDay, $lt: nextDay }
  })
    .select("amount")
    .session(session)
    .lean<Array<{ amount: number }>>();

  const usedToday = debitsToday.reduce((total, tx) => total + tx.amount, 0);
  const dailyLimit = config.ai.dailyTransferLimit;
  if (usedToday + input.amount > dailyLimit) {
    const remaining = Math.max(0, dailyLimit - usedToday);
    throw new AppError(
      400,
      `That amount exceeds your remaining daily limit of ${remaining.toFixed(2)} ILS.`,
      { code: "EXCEEDS_DAILY_LIMIT" }
    );
  }
}

export async function executeTransferWithSession(
  input: ExecuteTransferInput,
  session: ClientSession
): Promise<ExecuteTransferResult> {
  const sender = await User.findById(input.senderId).session(session);

  if (!sender) {
    throw new AppError(404, "Sender account not found.");
  }

  const normalizedRecipientEmail = input.recipientEmail.toLowerCase();
  if (sender.email === normalizedRecipientEmail) {
    throw new AppError(400, "You cannot transfer money to yourself.");
  }

  const recipient = await User.findOne({ email: normalizedRecipientEmail }).session(
    session
  );
  if (!recipient) {
    throw new AppError(404, "Recipient email does not exist.");
  }

  if (sender.balance < input.amount) {
    throw new AppError(400, "Insufficient balance.");
  }

  sender.balance = Number((sender.balance - input.amount).toFixed(2));
  recipient.balance = Number((recipient.balance + input.amount).toFixed(2));

  await sender.save({ session });
  await recipient.save({ session });

  const fxMetadata = input.fx
    ? {
        enteredCurrency: input.fx.enteredCurrency,
        enteredAmount: input.fx.enteredAmount,
        exchangeRateUsed: input.fx.exchangeRateUsed,
        exchangeRateFetchedAt: input.fx.exchangeRateFetchedAt
      }
    : {};

  const createdTransactions = await Transaction.create(
    [
      {
        ownerId: sender.id,
        counterpartyEmail: recipient.email,
        amount: input.amount,
        type: "debit",
        directionLabel: "Sent",
        reason: input.reason?.trim() || undefined,
        ...fxMetadata
      },
      {
        ownerId: recipient.id,
        counterpartyEmail: sender.email,
        amount: input.amount,
        type: "credit",
        directionLabel: "Received",
        reason: input.reason?.trim() || undefined,
        ...fxMetadata
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
