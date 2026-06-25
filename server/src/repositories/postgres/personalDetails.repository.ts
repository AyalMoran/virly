// src/repositories/postgres/personalDetails.repository.ts

import { and, eq, inArray, sql } from "drizzle-orm";
import { personalDetails } from "./schema.js";
import { asPgTx } from "./transaction.js";
import { newObjectId } from "./id.js";
import type {
  PersonalDetailsRecord,
  PersonalDetailsRepository,
  TxContext
} from "../types.js";

type Row = typeof personalDetails.$inferSelect;

function toRecord(r: Row): PersonalDetailsRecord {
  return {
    id: r.id,
    userId: r.userId,
    status: r.status as PersonalDetailsRecord["status"],
    firstName: r.firstName ?? null,
    lastName: r.lastName ?? null,
    dateOfBirth: r.dateOfBirth ?? null,
    address: (r.address as Record<string, string | null>) ?? {},
    lastSkippedAt: r.lastSkippedAt ?? null,
    createdAt: r.createdAt,
    updatedAt: r.updatedAt
  };
}

export const postgresPersonalDetailsRepository: PersonalDetailsRepository = {
  async findByUserId(userId: string, tx?: TxContext): Promise<PersonalDetailsRecord | null> {
    const [r] = await asPgTx(tx)
      .select()
      .from(personalDetails)
      .where(eq(personalDetails.userId, userId))
      .limit(1);
    return r ? toRecord(r) : null;
  },

  async ensureForUser(userId: string, tx?: TxContext): Promise<PersonalDetailsRecord> {
    const now = new Date();
    // ON CONFLICT DO UPDATE SET user_id=EXCLUDED.user_id is a no-op that
    // still triggers RETURNING *, giving us a row on both insert AND conflict —
    // matching Mongo's findOneAndUpdate { upsert:true, new:true } behaviour.
    const [r] = await asPgTx(tx)
      .insert(personalDetails)
      .values({
        id: newObjectId(),
        userId,
        status: "not_provided",
        address: sql`'{}'::jsonb`,
        createdAt: now,
        updatedAt: now
      })
      .onConflictDoUpdate({
        target: personalDetails.userId,
        set: { userId: sql`EXCLUDED.user_id` }
      })
      .returning();
    if (!r) {
      throw new Error(`ensureForUser: upsert returned null for userId ${userId}`);
    }
    return toRecord(r);
  },

  async update(
    userId: string,
    patch: Partial<Omit<PersonalDetailsRecord, "id" | "userId" | "createdAt" | "updatedAt">>,
    tx?: TxContext
  ): Promise<PersonalDetailsRecord | null> {
    // Only set fields explicitly present in patch; always advance updatedAt.
    const set: Record<string, unknown> = { updatedAt: new Date() };
    if ("status" in patch) set["status"] = patch.status;
    if ("firstName" in patch) set["firstName"] = patch.firstName ?? null;
    if ("lastName" in patch) set["lastName"] = patch.lastName ?? null;
    if ("dateOfBirth" in patch) set["dateOfBirth"] = patch.dateOfBirth ?? null;
    if ("address" in patch) set["address"] = patch.address ?? {};
    if ("lastSkippedAt" in patch) set["lastSkippedAt"] = patch.lastSkippedAt ?? null;

    const [r] = await asPgTx(tx)
      .update(personalDetails)
      .set(set)
      .where(eq(personalDetails.userId, userId))
      .returning();
    // Returns null when no row matched; caller maps to 404 — mirrors Mongo.
    return r ? toRecord(r) : null;
  },

  async findProvidedByUserIds(
    userIds: string[],
    tx?: TxContext
  ): Promise<PersonalDetailsRecord[]> {
    if (userIds.length === 0) return [];
    const rows = await asPgTx(tx)
      .select()
      .from(personalDetails)
      .where(
        and(
          inArray(personalDetails.userId, userIds),
          eq(personalDetails.status, "provided")
        )
      );
    return rows.map(toRecord);
  },

  async findProvidedByName(
    { firstName, lastName, limit }: { firstName: string; lastName?: string; limit: number },
    tx?: TxContext
  ): Promise<PersonalDetailsRecord[]> {
    // Case-insensitive exact match: lower(col) = lower($param) — mirrors Mongo's /^value$/i regex.
    const nameCondition =
      lastName && lastName.length > 0
        ? and(
            sql`lower(${personalDetails.firstName}) = lower(${firstName})`,
            sql`lower(${personalDetails.lastName}) = lower(${lastName})`
          )
        : sql`lower(${personalDetails.firstName}) = lower(${firstName})`;

    const rows = await asPgTx(tx)
      .select()
      .from(personalDetails)
      .where(and(eq(personalDetails.status, "provided"), nameCondition))
      .limit(limit);
    return rows.map(toRecord);
  }
};
