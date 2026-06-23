// src/repositories/mongo/exchangeRate.repository.ts
import { ExchangeRate } from "../../models/ExchangeRate.js";
import { asSession } from "./transaction.js";
import type {
  ExchangeRateRecord,
  ExchangeRateRepository
} from "../types.js";

type Lean = Record<string, unknown> & { _id: unknown };

function toRecord(d: Lean): ExchangeRateRecord {
  return {
    id: String(d._id),
    baseCurrency: String(d.baseCurrency),
    rates: d.rates as Record<string, number>,
    provider: String(d.provider),
    fetchedAt: d.fetchedAt as Date,
    validForDate: String(d.validForDate),
    expiresAt: d.expiresAt as Date,
    sourceResponseHash: (d.sourceResponseHash as string | null) ?? null,
    createdAt: d.createdAt as Date,
    updatedAt: d.updatedAt as Date
  };
}

export const mongoExchangeRateRepository: ExchangeRateRepository = {
  async latestForBase(baseCurrency, tx) {
    const q = ExchangeRate.findOne({ baseCurrency }).sort({ fetchedAt: -1 });
    const s = asSession(tx);
    if (s) q.session(s);
    const d = await q.lean();
    return d ? toRecord(d as Lean) : null;
  },

  async findForDate(baseCurrency, validForDate, tx) {
    const q = ExchangeRate.findOne({ baseCurrency, validForDate }).sort({ fetchedAt: -1 });
    const s = asSession(tx);
    if (s) q.session(s);
    const d = await q.lean();
    return d ? toRecord(d as Lean) : null;
  },

  async upsertForDate(record, tx) {
    const { baseCurrency, validForDate, ...rest } = record;
    const doc = await ExchangeRate.findOneAndUpdate(
      { baseCurrency, validForDate },
      { $set: { baseCurrency, validForDate, ...rest } },
      { upsert: true, new: true, session: asSession(tx) }
    );
    if (!doc) {
      throw new Error(`upsertForDate: findOneAndUpdate returned null for baseCurrency=${baseCurrency} validForDate=${validForDate}`);
    }
    return toRecord((doc as unknown as { toObject(): Lean }).toObject());
  }
};
