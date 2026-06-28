// src/repositories/postgres/verificationToken.repository.ts

import { eq, lt } from "drizzle-orm";
import { verificationTokens } from "./schema.js";
import { asPgTx } from "./transaction.js";
import { newObjectId } from "./id.js";
import type {
  TxContext,
  VerificationTokenRecord,
  VerificationTokenRepository
} from "../types.js";

type Row = typeof verificationTokens.$inferSelect;

function toRecord(r: Row): VerificationTokenRecord {
  return {
    id: r.id,
    userId: r.userId,
    tokenHash: r.tokenHash,
    expiresAt: r.expiresAt,
    createdAt: r.createdAt,
    updatedAt: r.updatedAt
  };
}

export const postgresVerificationTokenRepository: VerificationTokenRepository = {
  async upsertForUser(userId: string, tokenHash: string, expiresAt: Date, tx?: TxContext): Promise<VerificationTokenRecord> {
    const now = new Date();
    const [row] = await asPgTx(tx)
      .insert(verificationTokens)
      .values({ id: newObjectId(), userId, tokenHash, expiresAt, createdAt: now, updatedAt: now })
      .onConflictDoUpdate({
        target: verificationTokens.userId,
        set: { tokenHash, expiresAt, updatedAt: now }
      })
      .returning();
    if (!row) {
      throw new Error("upsertForUser: insert/update returned no row.");
    }
    return toRecord(row);
  },

  async findByUserId(userId: string, tx?: TxContext): Promise<VerificationTokenRecord | null> {
    const [row] = await asPgTx(tx)
      .select()
      .from(verificationTokens)
      .where(eq(verificationTokens.userId, userId))
      .limit(1);
    return row ? toRecord(row) : null;
  },

  async deleteForUser(userId: string, tx?: TxContext): Promise<void> {
    await asPgTx(tx).delete(verificationTokens).where(eq(verificationTokens.userId, userId));
  },

  async deleteExpired(now: Date, tx?: TxContext): Promise<number> {
    const rows = await asPgTx(tx)
      .delete(verificationTokens)
      .where(lt(verificationTokens.expiresAt, now))
      .returning({ id: verificationTokens.id });
    return rows.length;
  }
};
