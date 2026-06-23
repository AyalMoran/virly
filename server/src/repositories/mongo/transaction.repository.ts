// src/repositories/mongo/transaction.repository.ts
import { Types } from "mongoose";
import type { FilterQuery } from "mongoose";
import { Transaction } from "../../models/Transaction.js";
import type {
  TransactionFilterCriteria,
  TransactionListSort,
  TransactionRecentCriteria,
  TransactionRecord,
  TransactionRepository
} from "../types.js";
import { asSession } from "./transaction.js";

type TransactionFilter = FilterQuery<Record<string, unknown>>;

const SORT_SPECS: Record<TransactionListSort, Record<string, 1 | -1>> = {
  newest: { createdAt: -1 },
  oldest: { createdAt: 1 },
  amount_desc: { amount: -1 },
  amount_asc: { amount: 1 }
};

/** Builds the Mongoose filter from plain criteria. Owns all driver-specific query shape. */
function buildRecentFilter(criteria: TransactionRecentCriteria): TransactionFilter {
  const filter: TransactionFilter = { ownerId: criteria.ownerId };
  if (criteria.type) filter.type = criteria.type;
  if (criteria.counterpartyEmail) filter.counterpartyEmail = criteria.counterpartyEmail;
  if (criteria.dateFrom || criteria.dateTo) {
    filter.createdAt = {
      ...(criteria.dateFrom ? { $gte: criteria.dateFrom } : {}),
      ...(criteria.dateTo ? { $lt: criteria.dateTo } : {})
    };
  }
  return filter;
}

function buildFilteredFilter(criteria: TransactionFilterCriteria): TransactionFilter {
  const filter = buildRecentFilter(criteria);
  if (criteria.minAmount !== undefined || criteria.maxAmount !== undefined) {
    filter.amount = {
      ...(criteria.minAmount !== undefined ? { $gte: criteria.minAmount } : {}),
      ...(criteria.maxAmount !== undefined ? { $lte: criteria.maxAmount } : {})
    };
  }
  if (criteria.reasonContains) {
    filter.reason = new RegExp(criteria.reasonContains.replace(/[.*+?^${}()|[\]\\]/g, "\\$&"), "i");
  }
  return filter;
}

type Lean = Record<string, unknown> & { _id: unknown };

function toRecord(d: Lean): TransactionRecord {
  return {
    id: String(d._id),
    ownerId: String(d.ownerId),
    counterpartyEmail: d.counterpartyEmail as string,
    amount: d.amount as number,
    type: d.type as "credit" | "debit",
    directionLabel: d.directionLabel as string,
    reason: (d.reason as string | null | undefined) ?? null,
    enteredCurrency: d.enteredCurrency as TransactionRecord["enteredCurrency"],
    enteredAmount: d.enteredAmount as number | undefined,
    exchangeRateUsed: d.exchangeRateUsed as number | undefined,
    exchangeRateFetchedAt: d.exchangeRateFetchedAt as Date | undefined,
    createdAt: d.createdAt as Date,
    updatedAt: d.updatedAt as Date
  };
}

export const mongoTransactionRepository: TransactionRepository = {
  async createMany(entries, tx) {
    const docs = await Transaction.create([...entries], { session: asSession(tx), ordered: true });
    return docs.map((doc) => toRecord(doc.toObject() as Lean));
  },

  async listForOwner({ ownerId, counterpartyEmail, page, limit }, tx) {
    const skip = (page - 1) * limit;
    const filter = {
      ownerId,
      ...(counterpartyEmail ? { counterpartyEmail } : {})
    };

    const q = Transaction.find(filter).sort({ createdAt: -1 }).skip(skip).limit(limit);
    const s = asSession(tx);
    if (s) q.session(s);
    const [docs, total] = await Promise.all([
      q.lean(),
      Transaction.countDocuments(filter)
    ]);

    return { transactions: (docs as Lean[]).map(toRecord), total };
  },

  async recentWithCounterparty({ ownerId, counterpartyEmail, limit }, tx) {
    const q = Transaction.find({ ownerId, counterpartyEmail }).sort({ createdAt: -1 }).limit(limit);
    const s = asSession(tx);
    if (s) q.session(s);
    const docs = await q.lean();
    return (docs as Lean[]).map(toRecord);
  },

  async getRelationshipStats({ ownerId, counterpartyEmail }, tx) {
    const pipeline = [
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
    ];

    const agg = Transaction.aggregate<{
      totalSent: number;
      totalReceived: number;
      transactionCount: number;
      lastTransactionAt: Date | null;
    }>(pipeline);
    const s = asSession(tx);
    if (s) agg.session(s);
    const [stats] = await agg;

    return {
      totalSent: stats?.totalSent ?? 0,
      totalReceived: stats?.totalReceived ?? 0,
      transactionCount: stats?.transactionCount ?? 0,
      lastTransactionAt: stats?.lastTransactionAt ?? null
    };
  },

  async getDirectionalTotals({ ownerId, counterpartyEmail }, tx) {
    const pipeline = [
      { $match: { ownerId: new Types.ObjectId(ownerId), counterpartyEmail } },
      {
        $group: {
          _id: "$type",
          total: { $sum: "$amount" },
          count: { $sum: 1 }
        }
      }
    ];

    const agg = Transaction.aggregate<{ _id: string; total: number; count: number }>(pipeline);
    const s = asSession(tx);
    if (s) agg.session(s);
    const rows = await agg;

    let creditTotal = 0, creditCount = 0, debitTotal = 0, debitCount = 0;
    for (const row of rows) {
      if (row._id === "credit") { creditTotal = row.total; creditCount = row.count; }
      if (row._id === "debit") { debitTotal = row.total; debitCount = row.count; }
    }

    return { creditTotal, creditCount, debitTotal, debitCount };
  },

  async getDailyDebitUsage({ ownerId, dayStart, dayEnd }, tx) {
    const q = Transaction.find({
      ownerId,
      type: "debit",
      createdAt: { $gte: dayStart, $lt: dayEnd }
    }).select("amount");
    const s = asSession(tx);
    if (s) q.session(s);
    const docs = await q.lean<Array<{ amount: number }>>();
    return {
      total: docs.reduce((total, d) => total + d.amount, 0),
      count: docs.length
    };
  },

  async findByIdForOwner(id, ownerId, tx) {
    if (!Types.ObjectId.isValid(id)) return null;
    const q = Transaction.findOne({ _id: id, ownerId });
    const s = asSession(tx);
    if (s) q.session(s);
    const d = await q.lean();
    return d ? toRecord(d as Lean) : null;
  },

  async listForOwnerFiltered(criteria, tx) {
    const filter = buildFilteredFilter(criteria);
    const sort = SORT_SPECS[criteria.sort ?? "newest"];
    const q = Transaction.find(filter).sort(sort).limit(criteria.limit);
    const s = asSession(tx);
    if (s) q.session(s);
    const docs = await q.lean();
    return (docs as Lean[]).map(toRecord);
  },

  async recentForOwner(criteria, tx) {
    const filter = buildRecentFilter(criteria);
    const q = Transaction.find(filter).sort({ createdAt: -1 }).limit(criteria.limit);
    const s = asSession(tx);
    if (s) q.session(s);
    const docs = await q.lean();
    return (docs as Lean[]).map(toRecord);
  },

  async lastForOwner(criteria, tx) {
    const [record] = await this.recentForOwner({ ...criteria, limit: 1 }, tx);
    return record ?? null;
  },

  async hasDebitToCounterparty({ ownerId, counterpartyEmail }, tx) {
    const q = Transaction.exists({ ownerId, counterpartyEmail, type: "debit" });
    const s = asSession(tx);
    if (s) q.session(s);
    const existing = await q;
    return Boolean(existing);
  }
};
