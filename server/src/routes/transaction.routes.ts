import mongoose from "mongoose";
import { Router } from "express";
import { z } from "zod";
import { requireAuth } from "../middleware/auth.js";
import { Transaction } from "../models/Transaction.js";
import { User } from "../models/User.js";
import { getPaginationMeta, parsePagination } from "../utils/pagination.js";
import { toTransactionDto } from "../utils/transaction-dto.js";

const router = Router();

//#region Schemas
const transferSchema = z.object({
  recipientEmail: z.string().email(),
  amount: z.number().positive("Amount must be greater than 0."),
  reason: z.string().max(200, "Reason must be at most 200 characters.").optional()
});
//#endregion

//#region Routes
router.get("/", requireAuth, async (req, res, next) => {
  try {
    const { page, limit } = parsePagination(req.query);
    const skip = (page - 1) * limit;
    const counterparty = z.string().email().optional().parse(req.query.counterparty);
    const filter = {
      ownerId: req.userId,
      ...(counterparty ? { counterpartyEmail: counterparty.toLowerCase() } : {})
    };

    const [transactions, total] = await Promise.all([
      Transaction.find(filter).sort({ createdAt: -1 }).skip(skip).limit(limit),
      Transaction.countDocuments(filter)
    ]);

    return res.json({
      transactions: transactions.map(toTransactionDto),
      pagination: getPaginationMeta(page, limit, total)
    });
  } catch (error) {
    next(error);
  }
});

router.post("/", requireAuth, async (req, res, next) => {
  const session = await mongoose.startSession();

  try {
    const { recipientEmail, amount, reason } = transferSchema.parse(req.body);
    let newBalance = 0;
    let senderTransaction;

    await session.withTransaction(async () => {
      const sender = await User.findById(req.userId).session(session);

      if (!sender) {
        throw Object.assign(new Error("Sender account not found."), { status: 404 });
      }

      const normalizedRecipientEmail = recipientEmail.toLowerCase();
      if (sender.email === normalizedRecipientEmail) {
        throw Object.assign(new Error("You cannot transfer money to yourself."), {
          status: 400
        });
      }

      const recipient = await User.findOne({ email: normalizedRecipientEmail }).session(session);
      if (!recipient) {
        throw Object.assign(new Error("Recipient email does not exist."), { status: 404 });
      }

      if (sender.balance < amount) {
        throw Object.assign(new Error("Insufficient balance."), { status: 400 });
      }

      sender.balance = Number((sender.balance - amount).toFixed(2));
      recipient.balance = Number((recipient.balance + amount).toFixed(2));
      newBalance = sender.balance;

      await sender.save({ session });
      await recipient.save({ session });

      const createdTransactions = await Transaction.create(
        [
          {
            ownerId: sender.id,
            counterpartyEmail: recipient.email,
            amount,
            type: "debit",
            reason
          },
          {
            ownerId: recipient.id,
            counterpartyEmail: sender.email,
            amount,
            type: "credit",
            reason
          }
        ],
        { session, ordered: true }
      );

      senderTransaction = createdTransactions[0];
    });

    if (!senderTransaction) {
      throw new Error("Transfer failed.");
    }

    return res.status(201).json({
      message: "Transfer completed successfully.",
      newBalance,
      transaction: toTransactionDto(senderTransaction)
    });
  } catch (error) {
    if (error instanceof Error && "status" in error) {
      return res.status(Number(error.status)).json({ message: error.message });
    }

    next(error);
  } finally {
    await session.endSession();
  }
});
//#endregion
export default router;
