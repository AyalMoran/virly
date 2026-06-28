// src/repositories/mongo/verificationToken.repository.ts
import { VerificationToken } from "../../models/VerificationToken.js";
import type {
  TxContext,
  VerificationTokenRecord,
  VerificationTokenRepository
} from "../types.js";
import { asSession } from "./transaction.js";

export function toVerificationTokenRecord(d: Record<string, unknown>): VerificationTokenRecord {
  return {
    id: String(d._id),
    userId: String(d.userId),
    tokenHash: d.tokenHash as string,
    expiresAt: d.expiresAt as Date,
    createdAt: d.createdAt as Date,
    updatedAt: d.updatedAt as Date
  };
}

export const mongoVerificationTokenRepository: VerificationTokenRepository = {
    async upsertForUser(userId, tokenHash, expiresAt, tx?: TxContext) {
      const doc = await VerificationToken.findOneAndUpdate(
        { userId },
        { $set: { tokenHash, expiresAt } },
        { upsert: true, new: true, session: asSession(tx) }
      ).lean();
      if (!doc) throw new Error("upsertForUser: findOneAndUpdate returned null unexpectedly");
      return toVerificationTokenRecord(doc as Record<string, unknown>);
    },

    async findByUserId(userId, tx?: TxContext) {
      const doc = await VerificationToken.findOne({ userId }, null, {
        session: asSession(tx)
      }).lean();
      return doc ? toVerificationTokenRecord(doc as Record<string, unknown>) : null;
    },

    async deleteForUser(userId, tx?: TxContext) {
      await VerificationToken.deleteOne({ userId }, { session: asSession(tx) });
    },

    async deleteExpired(now, tx?: TxContext) {
      const res = await VerificationToken.deleteMany(
        { expiresAt: { $lt: now } },
        { session: asSession(tx) }
      );
      return res.deletedCount ?? 0;
    }
};
