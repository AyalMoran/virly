// src/repositories/mongo/personalDetails.repository.ts
import { PersonalDetails } from "../../models/PersonalDetails.js";
import { asSession } from "./transaction.js";
import type {
  PersonalDetailsRecord,
  PersonalDetailsRepository
} from "../types.js";

type Lean = Record<string, unknown> & { _id: unknown };

function toRecord(d: Lean): PersonalDetailsRecord {
  return {
    id: String(d._id),
    userId: String(d.userId),
    status: d.status as PersonalDetailsRecord["status"],
    firstName: (d.firstName as string | null) ?? null,
    lastName: (d.lastName as string | null) ?? null,
    dateOfBirth: (d.dateOfBirth as Date | null) ?? null,
    address: (d.address as Record<string, string | null>) ?? {},
    lastSkippedAt: (d.lastSkippedAt as Date | null) ?? null,
    createdAt: d.createdAt as Date,
    updatedAt: d.updatedAt as Date
  };
}

export const mongoPersonalDetailsRepository: PersonalDetailsRepository = {
  async findByUserId(userId, tx) {
    const q = PersonalDetails.findOne({ userId });
    const s = asSession(tx);
    if (s) q.session(s);
    const d = await q.lean();
    return d ? toRecord(d as Lean) : null;
  },

  async ensureForUser(userId, tx) {
    const doc = await PersonalDetails.findOneAndUpdate(
      { userId },
      { $setOnInsert: { userId, status: "not_provided" } },
      { upsert: true, new: true, setDefaultsOnInsert: true, session: asSession(tx) }
    );
    // findOneAndUpdate with upsert+new should always return a document; guard
    // the non-null contract so an unexpected null fails loudly, not silently.
    if (!doc) {
      throw new Error(`ensureForUser: upsert returned null for userId ${userId}`);
    }
    return toRecord((doc as unknown as { toObject(): Lean }).toObject());
  },

  async update(userId, patch, tx) {
    const doc = await PersonalDetails.findOneAndUpdate(
      { userId },
      { $set: { ...patch } },
      { new: true, session: asSession(tx) }
    );
    // Returns null when no doc exists for the user; the caller decides how to
    // signal that (the service maps it to AppError(404)).
    return doc ? toRecord((doc as unknown as { toObject(): Lean }).toObject()) : null;
  }
};
