// src/repositories/mongo/transaction.repository.ts
import { Types } from "mongoose";
import { Transaction } from "../../models/Transaction.js";
import type { TransactionRecord, TransactionRepository } from "../types.js";
import { asSession } from "./transaction.js";

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

  async sumSameDayDebits({ ownerId, dayStart, dayEnd }, tx) {
    const q = Transaction.find({
      ownerId,
      type: "debit",
      createdAt: { $gte: dayStart, $lt: dayEnd }
    }).select("amount");
    const s = asSession(tx);
    if (s) q.session(s);
    const docs = await q.lean<Array<{ amount: number }>>();
    return docs.reduce((total, d) => total + d.amount, 0);
  }
};
