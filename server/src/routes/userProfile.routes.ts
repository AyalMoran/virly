import { Router } from "express";
import { z } from "zod";
import { requireAuth } from "../middleware/auth.js";
import { accountService } from "../services/account.service.js";
import { listActivityForUser } from "../services/activityEvent.service.js";
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

//#region Schemas
const activityQuerySchema = z.object({
  limit: z.coerce.number().int().min(1).max(50).default(20),
  before: z.coerce.date().optional()
});
//#endregion

// NOTE: registered ABOVE the `/:userId/*` routes below so `me` is matched
// literally here and never swallowed by the `:userId` param routes.
router.get("/me/activity", requireAuth, async (req, res, next) => {
  try {
    const { limit, before } = activityQuerySchema.parse(req.query);
    const events = await listActivityForUser(req.userId!, { limit, before });
    return res.json({
      events: events.map((e) => ({
        id: e.id,
        kind: e.kind,
        at: e.at.toISOString(),
        city: e.geo?.city ?? null,
        country: e.geo?.country ?? null,
        lat: e.geo?.lat ?? null,
        lng: e.geo?.lng ?? null,
        transactionId: e.transactionId
      })),
      nextBefore: events.length === limit ? events[events.length - 1]!.at.toISOString() : null
    });
  } catch (error) {
    next(error);
  }
});

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

    const isSelf = viewed.id === viewer.id;
    const personalName = await personalDetailsService.getDisplayName(viewed.id);
    const userDto = toPublicUserProfileDto(viewed, personalName);

    if (isSelf) {
      const relationship: UserRelationshipSummaryDto = {
        viewerUserId: viewer.id,
        viewedUserId: viewed.id,
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
        ownerId: viewer.id,
        counterpartyEmail: viewed.email
      }),
      transactionQueryService.recentWithCounterparty({
        ownerId: viewer.id,
        counterpartyEmail: viewed.email,
        limit: 5
      })
    ]);

    const relationship: UserRelationshipSummaryDto = {
      viewerUserId: viewer.id,
      viewedUserId: viewed.id,
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
      ownerId: viewer.id,
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
