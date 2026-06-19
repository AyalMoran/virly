import { Router } from "express";
import { requireAuth } from "../middleware/auth.js";
import { PersonalDetails } from "../models/PersonalDetails.js";
import { Transaction } from "../models/Transaction.js";
import { accountService } from "../services/account.service.js";
import { getPaginationMeta, parsePagination } from "../utils/pagination.js";
import {
  resolveRelationshipStatus,
  roundMoney,
  toPublicUserProfileDto,
  toRelationshipTransactionDto,
  type UserRelationshipSummaryDto
} from "../utils/user-profile-dto.js";

const router = Router();

async function getViewedUserDisplayName(viewedUserId: unknown) {
  const details = await PersonalDetails.findOne({ userId: viewedUserId });

  if (!details || details.status !== "provided") {
    return null;
  }

  // Only names leave this function; date of birth and address stay private.
  return { firstName: details.firstName, lastName: details.lastName };
}

type RelationshipStats = {
  totalSent: number;
  totalReceived: number;
  transactionCount: number;
  lastTransactionAt: Date | null;
};

/**
 * Totals are computed exclusively from the viewer's own ledger entries whose
 * counterparty is the viewed user. Ledger entries only exist for completed
 * transfers, so totals are completed-only by construction.
 */
async function getRelationshipStats(
  viewerId: unknown,
  viewedEmail: string
): Promise<RelationshipStats> {
  const [stats] = await Transaction.aggregate<{
    totalSent: number;
    totalReceived: number;
    transactionCount: number;
    lastTransactionAt: Date | null;
  }>([
    { $match: { ownerId: viewerId, counterpartyEmail: viewedEmail } },
    {
      $group: {
        _id: null,
        totalSent: {
          $sum: { $cond: [{ $eq: ["$type", "debit"] }, "$amount", 0] }
        },
        totalReceived: {
          $sum: { $cond: [{ $eq: ["$type", "credit"] }, "$amount", 0] }
        },
        transactionCount: { $sum: 1 },
        lastTransactionAt: { $max: "$createdAt" }
      }
    }
  ]);

  return {
    totalSent: stats?.totalSent ?? 0,
    totalReceived: stats?.totalReceived ?? 0,
    transactionCount: stats?.transactionCount ?? 0,
    lastTransactionAt: stats?.lastTransactionAt ?? null
  };
}

router.get("/:userId/profile", requireAuth, async (req, res, next) => {
  try {
    const viewer = await accountService.findById(req.userId!);
    if (!viewer) {
      return res.status(401).json({ message: "Authentication required." });
    }

    const viewed = await accountService.findByIdOrEmail(String(req.params.userId ?? ""));
    if (!viewed) {
      return res.status(404).json({ message: "User not found." });
    }

    const isSelf = String(viewed._id) === String(viewer._id);
    const personalName = await getViewedUserDisplayName(viewed._id);
    const userDto = toPublicUserProfileDto(viewed, personalName);

    if (isSelf) {
      const relationship: UserRelationshipSummaryDto = {
        viewerUserId: String(viewer._id),
        viewedUserId: String(viewed._id),
        totalSentToUser: 0,
        totalReceivedFromUser: 0,
        netAmount: 0,
        transactionCount: 0,
        lastTransactionAt: null,
        isVerifiedRecipient: Boolean(viewed.isVerified),
        canTransferToUser: false,
        relationshipStatus: "self"
      };

      return res.json({ user: userDto, relationship, recentTransactions: [] });
    }

    const [stats, recentTransactions] = await Promise.all([
      getRelationshipStats(viewer._id, viewed.email),
      Transaction.find({ ownerId: viewer._id, counterpartyEmail: viewed.email })
        .sort({ createdAt: -1 })
        .limit(5)
    ]);

    const relationship: UserRelationshipSummaryDto = {
      viewerUserId: String(viewer._id),
      viewedUserId: String(viewed._id),
      totalSentToUser: roundMoney(stats.totalSent),
      totalReceivedFromUser: roundMoney(stats.totalReceived),
      netAmount: roundMoney(stats.totalSent - stats.totalReceived),
      transactionCount: stats.transactionCount,
      lastTransactionAt: stats.lastTransactionAt?.toISOString() ?? null,
      isVerifiedRecipient: Boolean(viewed.isVerified),
      canTransferToUser: true,
      relationshipStatus: resolveRelationshipStatus({
        isSelf: false,
        transactionCount: stats.transactionCount,
        isVerifiedRecipient: Boolean(viewed.isVerified)
      })
    };

    return res.json({
      user: userDto,
      relationship,
      recentTransactions: recentTransactions.map(toRelationshipTransactionDto)
    });
  } catch (error) {
    next(error);
  }
});

router.get("/:userId/transactions", requireAuth, async (req, res, next) => {
  try {
    const viewer = await accountService.findById(req.userId!);
    if (!viewer) {
      return res.status(401).json({ message: "Authentication required." });
    }

    const viewed = await accountService.findByIdOrEmail(String(req.params.userId ?? ""));
    if (!viewed) {
      return res.status(404).json({ message: "User not found." });
    }

    const { page, limit } = parsePagination(req.query);
    const skip = (page - 1) * limit;

    // Viewer's own ledger only; self-profile naturally yields an empty list.
    const filter = { ownerId: viewer._id, counterpartyEmail: viewed.email };
    const [transactions, total] = await Promise.all([
      Transaction.find(filter).sort({ createdAt: -1 }).skip(skip).limit(limit),
      Transaction.countDocuments(filter)
    ]);

    return res.json({
      transactions: transactions.map(toRelationshipTransactionDto),
      pagination: getPaginationMeta(page, limit, total)
    });
  } catch (error) {
    next(error);
  }
});

export default router;
