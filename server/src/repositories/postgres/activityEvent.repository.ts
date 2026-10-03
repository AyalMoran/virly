// src/repositories/postgres/activityEvent.repository.ts
import { and, desc, eq, lt } from "drizzle-orm";
import { activityEvents } from "./schema.js";
import { asPgTx } from "./transaction.js";
import { newObjectId } from "./id.js";
import type {
  ActivityEventCreateInput,
  ActivityEventGeo,
  ActivityEventKind,
  ActivityEventRecord,
  ActivityEventRepository,
  TxContext
} from "../types.js";

type Row = typeof activityEvents.$inferSelect;

function toRecord(r: Row): ActivityEventRecord {
  return {
    id: r.id,
    userId: r.userId,
    kind: r.kind as ActivityEventKind,
    at: r.at,
    ip: r.ip ?? null,
    geo: (r.geo as ActivityEventGeo | null) ?? null,
    transactionId: r.transactionId ?? null,
    expiresAt: r.expiresAt,
    createdAt: r.createdAt,
    updatedAt: r.updatedAt
  };
}

export const postgresActivityEventRepository: ActivityEventRepository = {
  async create(input: ActivityEventCreateInput, tx?: TxContext): Promise<ActivityEventRecord> {
    const now = new Date();
    const [row] = await asPgTx(tx)
      .insert(activityEvents)
      .values({
        id: newObjectId(),
        userId: input.userId,
        kind: input.kind,
        at: input.at,
        ip: input.ip,
        geo: input.geo,
        transactionId: input.transactionId ?? null,
        expiresAt: input.expiresAt,
        createdAt: now,
        updatedAt: now
      })
      .returning();
    if (!row) throw new Error("activityEvents.create returned no row");
    return toRecord(row);
  },

  async listRecentByUser(
    userId: string,
    opts: { limit: number; before?: Date },
    tx?: TxContext
  ): Promise<ActivityEventRecord[]> {
    const where = opts.before
      ? and(eq(activityEvents.userId, userId), lt(activityEvents.at, opts.before))
      : eq(activityEvents.userId, userId);
    const rows = await asPgTx(tx)
      .select()
      .from(activityEvents)
      .where(where)
      .orderBy(desc(activityEvents.at), desc(activityEvents.id))
      .limit(opts.limit);
    return rows.map(toRecord);
  },

  async deleteExpired(now: Date, tx?: TxContext): Promise<number> {
    const rows = await asPgTx(tx)
      .delete(activityEvents)
      .where(lt(activityEvents.expiresAt, now))
      .returning({ id: activityEvents.id });
    return rows.length;
  }
};
