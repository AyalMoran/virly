

// src/repositories/postgres/transaction.repository.ts
import { eq, and, gte, lt, lte, sql, desc, asc } from "drizzle-orm";
import { transactions } from "./schema.js";
import { asPgTx } from "./transaction.js";
import { newObjectId, isObjectIdHex } from "./id.js";
import type {
  TransactionFilterCriteria,
  TransactionListSort,
  TransactionRecentCriteria,
  TransactionRecord,
  TransactionRepository,
  TxContext
} from "../types.js";

type Row = typeof transactions.$inferSelect;

function toRecord(r: Row): TransactionRecord {
  return {
    id: r.id,
    ownerId: r.ownerId,
    counterpartyEmail: r.counterpartyEmail,
    amount: r.amount,
    type: r.type as "credit" | "debit",
    directionLabel: r.directionLabel,
    reason: r.reason ?? null,
    enteredCurrency: (r.enteredCurrency as TransactionRecord["enteredCurrency"]) ?? undefined,
    enteredAmount: r.enteredAmount ?? undefined,
    exchangeRateUsed: r.exchangeRateUsed ?? undefined,
    exchangeRateFetchedAt: r.exchangeRateFetchedAt ?? undefined,
    createdAt: r.createdAt,
    updatedAt: r.updatedAt
  };
}

/** Escape special ILIKE pattern characters: \, %, _ */
function escapeIlike(s: string): string {
  return s.replace(/\\/g, "\\\\").replace(/%/g, "\\%").replace(/_/g, "\\_");
}

const SORT_ORDER: Record<TransactionListSort, ReturnType<typeof desc | typeof asc>> = {
  newest: desc(transactions.createdAt),
  oldest: asc(transactions.createdAt),
  amount_desc: desc(transactions.amount),
  amount_asc: asc(transactions.amount)
};

export const postgresTransactionRepository: TransactionRepository = {
  async createMany(entries, tx) {
    if (entries.length === 0) return [];
    const now = new Date();
    const values = entries.map((e) => ({
      id: newObjectId(),
      ownerId: e.ownerId,
      counterpartyEmail: e.counterpartyEmail,
      amount: e.amount,
      type: e.type,
      directionLabel: e.directionLabel,
      reason: e.reason ?? null,
      enteredCurrency: e.enteredCurrency ?? null,
      enteredAmount: e.enteredAmount ?? null,
      exchangeRateUsed: e.exchangeRateUsed ?? null,
      exchangeRateFetchedAt: e.exchangeRateFetchedAt ?? null,
      createdAt: now,
      updatedAt: now
    }));
    const rows = await asPgTx(tx).insert(transactions).values(values).returning();
    // Preserve insertion order: sort by createdAt then id (stable)
    rows.sort((a, b) => a.createdAt.getTime() - b.createdAt.getTime() || a.id.localeCompare(b.id));
    return rows.map(toRecord);
  },

  async listForOwner({ ownerId, counterpartyEmail, page, limit }, tx) {
    const db = asPgTx(tx);
    const skip = (page - 1) * limit;

    // Build where clauses separately (not shared, to avoid any potential SQL object mutation issues)
    const rowsWhere = counterpartyEmail
      ? and(eq(transactions.ownerId, ownerId), eq(transactions.counterpartyEmail, counterpartyEmail))
      : eq(transactions.ownerId, ownerId);
    const countWhere = counterpartyEmail
      ? and(eq(transactions.ownerId, ownerId), eq(transactions.counterpartyEmail, counterpartyEmail))
      : eq(transactions.ownerId, ownerId);

    // Sequential queries (rows page + DB-side COUNT(*), like Mongo's countDocuments).
    const rows = await db.select().from(transactions).where(rowsWhere).orderBy(desc(transactions.createdAt)).offset(skip).limit(limit);
    const [counted] = await db.select({ total: sql<number>`count(*)::int` }).from(transactions).where(countWhere);
    const total = Number(counted?.total ?? 0);

    return { transactions: rows.map(toRecord), total };
  },

  async recentWithCounterparty({ ownerId, counterpartyEmail, limit }, tx) {
    const rows = await asPgTx(tx)
      .select()
      .from(transactions)
      .where(and(eq(transactions.ownerId, ownerId), eq(transactions.counterpartyEmail, counterpartyEmail)))
      .orderBy(desc(transactions.createdAt))
      .limit(limit);
    return rows.map(toRecord);
  },

  async getRelationshipStats({ ownerId, counterpartyEmail }, tx) {
    const result = await asPgTx(tx).execute(
      sql`SELECT
        COALESCE(SUM(CASE WHEN type='debit' THEN amount ELSE 0 END),0)::float8 AS "totalSent",
        COALESCE(SUM(CASE WHEN type='credit' THEN amount ELSE 0 END),0)::float8 AS "totalReceived",
        COUNT(*)::int AS "transactionCount",
        MAX(created_at) AS "lastTransactionAt"
      FROM transactions
      WHERE owner_id=${ownerId} AND counterparty_email=${counterpartyEmail}`
    );
    const stats = (result as { rows: Record<string, unknown>[] }).rows[0];
    const rawLast = stats["lastTransactionAt"];
    const lastTransactionAt = rawLast == null ? null
      : rawLast instanceof Date ? rawLast
      : new Date(rawLast as string);
    return {
      totalSent: stats["totalSent"] as number,
      totalReceived: stats["totalReceived"] as number,
      transactionCount: stats["transactionCount"] as number,
      lastTransactionAt
    };
  },

  async getDirectionalTotals({ ownerId, counterpartyEmail }, tx) {
    const result = await asPgTx(tx).execute(
      sql`SELECT type, COALESCE(SUM(amount),0)::float8 AS total, COUNT(*)::int AS count
          FROM transactions WHERE owner_id=${ownerId} AND counterparty_email=${counterpartyEmail} GROUP BY type`
    );
    const rows = (result as { rows: Array<Record<string, unknown>> }).rows;
    let creditTotal = 0, creditCount = 0, debitTotal = 0, debitCount = 0;
    for (const row of rows) {
      if (row["type"] === "credit") { creditTotal = row["total"] as number; creditCount = row["count"] as number; }
      if (row["type"] === "debit") { debitTotal = row["total"] as number; debitCount = row["count"] as number; }
    }
    return { creditTotal, creditCount, debitTotal, debitCount };
  },

  async getDailyDebitUsage({ ownerId, dayStart, dayEnd }, tx) {
    const result = await asPgTx(tx).execute(
      sql`SELECT COALESCE(SUM(amount),0)::float8 AS total, COUNT(*)::int AS count
          FROM transactions
          WHERE owner_id=${ownerId} AND type='debit' AND created_at >= ${dayStart} AND created_at < ${dayEnd}`
    );
    const row = (result as { rows: Record<string, unknown>[] }).rows[0];
    return {
      total: row["total"] as number,
      count: row["count"] as number
    };
  },

  async findByIdForOwner(id, ownerId, tx) {
    if (!isObjectIdHex(id)) return null;
    const [row] = await asPgTx(tx)
      .select()
      .from(transactions)
      .where(and(eq(transactions.id, id), eq(transactions.ownerId, ownerId)))
      .limit(1);
    return row ? toRecord(row) : null;
  },

  async listForOwnerFiltered(criteria, tx) {
    const conditions = [eq(transactions.ownerId, criteria.ownerId)];
    if (criteria.type) conditions.push(eq(transactions.type, criteria.type));
    if (criteria.counterpartyEmail) conditions.push(eq(transactions.counterpartyEmail, criteria.counterpartyEmail));
    if (criteria.dateFrom) conditions.push(gte(transactions.createdAt, criteria.dateFrom));
    if (criteria.dateTo) conditions.push(lt(transactions.createdAt, criteria.dateTo));
    if (criteria.minAmount !== undefined) conditions.push(gte(transactions.amount, criteria.minAmount));
    if (criteria.maxAmount !== undefined) conditions.push(lte(transactions.amount, criteria.maxAmount));

    const db = asPgTx(tx);
    const sortOrder = SORT_ORDER[criteria.sort ?? "newest"];

    if (criteria.reasonContains) {
      const escaped = escapeIlike(criteria.reasonContains);
      const pattern = `%${escaped}%`;
      const whereClause = and(...conditions);
      const rows = await db
        .select()
        .from(transactions)
        .where(
          and(
            whereClause,
            sql`${transactions.reason} ILIKE ${pattern} ESCAPE '\\'`
          )
        )
        .orderBy(sortOrder)
        .limit(criteria.limit);
      return rows.map(toRecord);
    }

    const rows = await db
      .select()
      .from(transactions)
      .where(and(...conditions))
      .orderBy(sortOrder)
      .limit(criteria.limit);
    return rows.map(toRecord);
  },

  async recentForOwner(criteria, tx) {
    const conditions = [eq(transactions.ownerId, criteria.ownerId)];
    if (criteria.type) conditions.push(eq(transactions.type, criteria.type));
    if (criteria.counterpartyEmail) conditions.push(eq(transactions.counterpartyEmail, criteria.counterpartyEmail));
    if (criteria.dateFrom) conditions.push(gte(transactions.createdAt, criteria.dateFrom));
    if (criteria.dateTo) conditions.push(lt(transactions.createdAt, criteria.dateTo));

    const rows = await asPgTx(tx)
      .select()
      .from(transactions)
      .where(and(...conditions))
      .orderBy(desc(transactions.createdAt))
      .limit(criteria.limit);
    return rows.map(toRecord);
  },

  async lastForOwner(criteria, tx) {
    const [record] = await this.recentForOwner({ ...criteria, limit: 1 }, tx);
    return record ?? null;
  },

  async hasDebitToCounterparty({ ownerId, counterpartyEmail }, tx) {
    const result = await asPgTx(tx).execute(
      sql`SELECT EXISTS(
        SELECT 1 FROM transactions
        WHERE owner_id=${ownerId} AND counterparty_email=${counterpartyEmail} AND type='debit'
      ) AS exists`
    );
    const row = (result as { rows: Record<string, unknown>[] }).rows[0];
    return Boolean(row["exists"]);
  }
};
