import { Router } from "express";
import { requireAuth } from "../middleware/auth.js";
import { Transaction } from "../models/Transaction.js";
import { User } from "../models/User.js";
import { getPaginationMeta, parsePagination } from "../utils/pagination.js";
import { toTransactionDto } from "../utils/transaction-dto.js";

const router = Router();

//#region Schemas
//#endregion

//#region Routes
router.get("/me", requireAuth, async (req, res, next) => {
  try {
    const { page, limit } = parsePagination(req.query);
    const skip = (page - 1) * limit;

    const user = await User.findById(req.userId).select(
      "-passwordHash -verificationTokenHash"
    );

    if (!user) {
      return res.status(404).json({ message: "User not found." });
    }

    const filter = { ownerId: user.id };
    const [transactions, total] = await Promise.all([
      Transaction.find(filter).sort({ createdAt: -1 }).skip(skip).limit(limit),
      Transaction.countDocuments(filter)
    ]);

    return res.json({
      balance: user.balance,
      transactions: transactions.map(toTransactionDto),
      pagination: getPaginationMeta(page, limit, total)
    });
  } catch (error) {
    next(error);
  }
});
//#endregion

export default router;
