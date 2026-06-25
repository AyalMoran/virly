// src/repositories/postgres/exchangeRate.repository.ts

import { eq, and, desc } from "drizzle-orm";
import { exchangeRates } from "./schema.js";
import { asPgTx } from "./transaction.js";
import { newObjectId } from "./id.js";
import type {
  ExchangeRateRecord,
  ExchangeRateRepository,
  TxContext
} from "../types.js";

type Row = typeof exchangeRates.$inferSelect;

function toRecord(r: Row): ExchangeRateRecord {
  return {
    id: r.id,
    baseCurrency: r.baseCurrency,
    rates: r.rates as Record<string, number>,
    provider: r.provider,
    fetchedAt: r.fetchedAt,
    validForDate: r.validForDate,
    expiresAt: r.expiresAt,
    sourceResponseHash: r.sourceResponseHash ?? null,
    createdAt: r.createdAt,
    updatedAt: r.updatedAt
  };
}

export const postgresExchangeRateRepository: ExchangeRateRepository = {
  async latestForBase(baseCurrency: string, tx?: TxContext): Promise<ExchangeRateRecord | null> {
    const [r] = await asPgTx(tx)
      .select()
      .from(exchangeRates)
      .where(eq(exchangeRates.baseCurrency, baseCurrency))
      .orderBy(desc(exchangeRates.fetchedAt))
      .limit(1);
    return r ? toRecord(r) : null;
  },

  async findForDate(baseCurrency: string, validForDate: string, tx?: TxContext): Promise<ExchangeRateRecord | null> {
    const [r] = await asPgTx(tx)
      .select()
      .from(exchangeRates)
      .where(
        and(
          eq(exchangeRates.baseCurrency, baseCurrency),
          eq(exchangeRates.validForDate, validForDate)
        )
      )
      .orderBy(desc(exchangeRates.fetchedAt))
      .limit(1);
    return r ? toRecord(r) : null;
  },

  async upsertForDate(
    record: Omit<ExchangeRateRecord, "id" | "createdAt" | "updatedAt">,
    tx?: TxContext
  ): Promise<ExchangeRateRecord> {
    const now = new Date();
    const [r] = await asPgTx(tx)
      .insert(exchangeRates)
      .values({
        id: newObjectId(),
        baseCurrency: record.baseCurrency,
        rates: record.rates,
        provider: record.provider,
        fetchedAt: record.fetchedAt,
        validForDate: record.validForDate,
        expiresAt: record.expiresAt,
        sourceResponseHash: record.sourceResponseHash ?? null,
        createdAt: now,
        updatedAt: now
      })
      .onConflictDoUpdate({
        target: [exchangeRates.baseCurrency, exchangeRates.validForDate],
        set: {
          rates: record.rates,
          provider: record.provider,
          fetchedAt: record.fetchedAt,
          expiresAt: record.expiresAt,
          sourceResponseHash: record.sourceResponseHash ?? null,
          updatedAt: now
        }
      })
      .returning();
    if (!r) {
      throw new Error(
        `upsertForDate: insert/update returned null for baseCurrency=${record.baseCurrency} validForDate=${record.validForDate}`
      );
    }
    return toRecord(r);
  }
};
