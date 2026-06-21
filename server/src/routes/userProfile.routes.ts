import { Router } from "express";
import { requireAuth } from "../middleware/auth.js";
import { accountService } from "../services/account.service.js";
import { personalDetailsService } from "../services/personalDetails.service.js";
import { transactionQueryService } from "../services/transactionQuery.service.js";
import { getPaginationMeta, parsePagination } from "../utils/pagination.js";
import {
  resolveRelationshipStatus,
  roundMoney,
  toPublicUserProfileDto,
  toRelationshipTransactionDto,
  type UserRelationshipSummaryDto
} from "../utils/user-profile-dto.js";

const router = Router();

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
    const personalName = await personalDetailsService.getDisplayName(String(viewed._id));
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
      transactionQueryService.getRelationshipStats({
        ownerId: String(viewer._id),
        counterpartyEmail: viewed.email
      }),
      transactionQueryService.recentWithCounterparty({
        ownerId: String(viewer._id),
        counterpartyEmail: viewed.email,
        limit: 5
      })
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

    // Viewer's own ledger only; self-profile naturally yields an empty list.
    const { transactions, total } = await transactionQueryService.listForOwner({
      ownerId: String(viewer._id),
      counterpartyEmail: viewed.email,
      page,
      limit
    });

    return res.json({
      transactions: transactions.map(toRelationshipTransactionDto),
      pagination: getPaginationMeta(page, limit, total)
    });
  } catch (error) {
    next(error);
  }
});

export default router;
