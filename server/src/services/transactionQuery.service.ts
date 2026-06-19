import { Types } from "mongoose";
import { Transaction } from "../models/Transaction.js";

export type TransactionDocument = InstanceType<typeof Transaction>;

export const transactionQueryService = {
  /**
   * Paginated list of ledger entries owned by `ownerId`, optionally filtered
   * by a single counterparty email. The caller is responsible for parsing and
   * validating `page` and `limit` before calling this method.
   */
  async listForOwner(input: {
    ownerId: string;
    counterpartyEmail?: string;
    page: number;
    limit: number;
  }): Promise<{ transactions: TransactionDocument[]; total: number }> {
    const { ownerId, counterpartyEmail, page, limit } = input;
    const skip = (page - 1) * limit;

    const filter = {
      ownerId,
      ...(counterpartyEmail ? { counterpartyEmail } : {})
    };

    const [transactions, total] = await Promise.all([
      Transaction.find(filter).sort({ createdAt: -1 }).skip(skip).limit(limit),
      Transaction.countDocuments(filter)
    ]);

    return { transactions, total };
  },

  /**
   * Aggregated relationship statistics between `ownerId` and a counterparty.
   * Totals are drawn exclusively from the owner's ledger entries (completed
   * transfers only, by construction). The aggregation pipeline is preserved
   * verbatim from userProfile.routes.ts — do not alter its math.
   */
  async getRelationshipStats(input: {
    ownerId: string;
    counterpartyEmail: string;
  }): Promise<{
    totalSent: number;
    totalReceived: number;
    transactionCount: number;
    lastTransactionAt: Date | null;
  }> {
    const { ownerId, counterpartyEmail } = input;

    const [stats] = await Transaction.aggregate<{
      totalSent: number;
      totalReceived: number;
      transactionCount: number;
      lastTransactionAt: Date | null;
    }>([
      // Mongoose does NOT cast aggregation pipeline stages, so `ownerId` (an
      // ObjectId column) must be matched against an ObjectId, not the string
      // the public API accepts — otherwise $match silently matches nothing.
      { $match: { ownerId: new Types.ObjectId(ownerId), counterpartyEmail } },
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
  },

  /**
   * Most-recent transactions between `ownerId` and a counterparty, sorted
   * descending by creation time. No pagination — callers supply an explicit
   * `limit`.
   */
  async recentWithCounterparty(input: {
    ownerId: string;
    counterpartyEmail: string;
    limit: number;
  }): Promise<TransactionDocument[]> {
    const { ownerId, counterpartyEmail, limit } = input;

    return Transaction.find({ ownerId, counterpartyEmail })
      .sort({ createdAt: -1 })
      .limit(limit);
  }
};
