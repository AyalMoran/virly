// src/repositories/mongo/activityEvent.repository.ts
import { ActivityEvent } from "../../models/ActivityEvent.js";
import type {
  ActivityEventCreateInput,
  ActivityEventGeo,
  ActivityEventKind,
  ActivityEventRecord,
  ActivityEventRepository,
  TxContext
} from "../types.js";
import { asSession } from "./transaction.js";

function toActivityEventRecord(d: Record<string, unknown>): ActivityEventRecord {
  return {
    id: String(d._id),
    userId: String(d.userId),
    kind: d.kind as ActivityEventKind,
    at: d.at as Date,
    ip: (d.ip as string | null) ?? null,
    geo: (d.geo as ActivityEventGeo | null) ?? null,
    transactionId: d.transactionId ? String(d.transactionId) : null,
    expiresAt: d.expiresAt as Date,
    createdAt: d.createdAt as Date,
    updatedAt: d.updatedAt as Date
  };
}

export const mongoActivityEventRepository: ActivityEventRepository = {
  async create(input: ActivityEventCreateInput, tx?: TxContext) {
    const [doc] = await ActivityEvent.create(
      [
        {
          userId: input.userId,
          kind: input.kind,
          at: input.at,
          ip: input.ip,
          geo: input.geo,
          transactionId: input.transactionId ?? null,
          expiresAt: input.expiresAt
        }
      ],
      { session: asSession(tx) }
    );
    if (!doc) throw new Error("activityEvents.create returned no document");
    return toActivityEventRecord(doc.toObject() as Record<string, unknown>);
  },

  async listRecentByUser(userId, opts, tx?: TxContext) {
    const filter: Record<string, unknown> = { userId };
    if (opts.before) filter.at = { $lt: opts.before };
    const docs = await ActivityEvent.find(filter, null, { session: asSession(tx) })
      .sort({ at: -1, _id: -1 })
      .limit(opts.limit)
      .lean();
    return docs.map((d) => toActivityEventRecord(d as Record<string, unknown>));
  },

  async deleteExpired(now, tx?: TxContext) {
    const res = await ActivityEvent.deleteMany(
      { expiresAt: { $lt: now } },
      { session: asSession(tx) }
    );
    return res.deletedCount ?? 0;
  }
};
