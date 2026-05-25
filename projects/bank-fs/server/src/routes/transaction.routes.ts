import { Router } from "express";
import { z } from "zod";
import { requireAuth } from "../middleware/auth.js";
import { Transaction } from "../models/Transaction.js";
import { executeTransfer } from "../services/transfer.service.js";
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
  try {
    if (!req.userId) {
      return res.status(401).json({ message: "Authentication required." });
    }

    const { recipientEmail, amount, reason } = transferSchema.parse(req.body);
    const result = await executeTransfer({
      senderId: req.userId,
      recipientEmail,
      amount,
      reason
    });

    return res.status(201).json(result);
  } catch (error) {
    if (error instanceof Error && "status" in error) {
      return res.status(Number(error.status)).json({ message: error.message });
    }

    next(error);
  }
});
//#endregion
export default router;
