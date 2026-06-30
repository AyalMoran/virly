import { config } from "../config.js";
import { getRepositories } from "../repositories/index.js";
import { getRealtime } from "../realtime/registry.js";
import type { TransactionRecord, TxContext } from "../repositories/types.js";
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
 * Note: the daily check reads same-day debits within the transaction. MongoDB's
 * snapshot isolation does not fully serialize two concurrent confirmations
 * (write-skew remains possible), but this closes the by-design bypass where the
 * daily cap was never checked at settlement.
 */
export async function assertAiTransferWithinLimits(
  input: { senderId: string; amount: number },
  tx: TxContext
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

  const { total: usedToday } = await getRepositories().transactions.getDailyDebitUsage(
    { ownerId: input.senderId, dayStart: startOfDay, dayEnd: nextDay },
    tx
  );

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
  tx: TxContext
): Promise<ExecuteTransferResult> {
  const repos = getRepositories();

  const sender = await repos.users.findById(input.senderId, tx);

  if (!sender) {
    throw new AppError(404, "Sender account not found.");
  }

  const normalizedRecipientEmail = input.recipientEmail.toLowerCase();
  if (sender.email === normalizedRecipientEmail) {
    throw new AppError(400, "You cannot transfer money to yourself.");
  }

  const recipient = await repos.users.findByEmail(normalizedRecipientEmail, tx);
  if (!recipient) {
    throw new AppError(404, "Recipient email does not exist.");
  }

  if (sender.balance < input.amount) {
    throw new AppError(400, "Insufficient balance.");
  }

  const newSenderBalance = Number((sender.balance - input.amount).toFixed(2));
  const newRecipientBalance = Number((recipient.balance + input.amount).toFixed(2));

  await repos.users.setBalance(sender.id, newSenderBalance, tx);
  await repos.users.setBalance(recipient.id, newRecipientBalance, tx);

  const fxMetadata = input.fx
    ? {
        enteredCurrency: input.fx.enteredCurrency,
        enteredAmount: input.fx.enteredAmount,
        exchangeRateUsed: input.fx.exchangeRateUsed,
        exchangeRateFetchedAt: input.fx.exchangeRateFetchedAt
      }
    : {};

  const reason = input.reason?.trim() || null;

  const createdTransactions = await repos.transactions.createMany(
    [
      {
        ownerId: sender.id,
        counterpartyEmail: recipient.email,
        amount: input.amount,
        type: "debit",
        directionLabel: "Sent",
        reason,
        ...fxMetadata
      },
      {
        ownerId: recipient.id,
        counterpartyEmail: sender.email,
        amount: input.amount,
        type: "credit",
        directionLabel: "Received",
        reason,
        ...fxMetadata
      }
    ],
    tx
  );

  const senderTransaction: TransactionRecord | undefined = createdTransactions[0];
  if (!senderTransaction) {
    throw new Error("Transfer failed.");
  }

  return {
    message: "Transfer completed successfully.",
    newBalance: newSenderBalance,
    transaction: toTransactionDto(senderTransaction)
  };
}

/**
 * Best-effort, post-commit realtime notify of the recipient. Shared by every
 * money-moving path (UI route, fraud-hold release, AI-confirmed) so notification
 * coverage is centralized. A realtime failure must never affect the transfer.
 */
export async function notifyTransferReceived(input: {
  recipientEmail: string;
  amount: number;
  reason?: string | null;
}): Promise<void> {
  try {
    const recipient = await getRepositories().users.findByEmail(
      input.recipientEmail.toLowerCase()
    );
    if (recipient) {
      getRealtime().emitToUser(recipient.id, "transfer:received", {
        amount: input.amount,
        reason: input.reason?.trim() || null
      });
    }
  } catch {
    /* best-effort: a realtime failure must never affect the transfer */
  }
}

export async function executeTransfer(
  input: ExecuteTransferInput
): Promise<ExecuteTransferResult> {
  const result = await getRepositories().runInTransaction(async (tx) =>
    executeTransferWithSession(input, tx)
  );
  await notifyTransferReceived(input);
  return result;
}
