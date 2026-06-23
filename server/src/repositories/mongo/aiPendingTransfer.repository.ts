// src/repositories/mongo/aiPendingTransfer.repository.ts
import { Types } from "mongoose";
import { AiPendingTransfer } from "../../models/AiPendingTransfer.js";
import { asSession } from "./transaction.js";
import type {
  AiPendingTransferRecord,
  AiPendingTransferRepository
} from "../types.js";

type Lean = Record<string, unknown> & { _id: unknown };

/** Mongoose stores `idempotencyResults` as a Map; lean docs may surface it as a
 * Map or a plain object. Normalise to a plain object so records never leak a Map. */
function toPlainObject(value: unknown): Record<string, unknown> {
  if (value instanceof Map) {
    return Object.fromEntries(value);
  }
  return (value as Record<string, unknown> | null | undefined) ?? {};
}

function toRecord(d: Lean): AiPendingTransferRecord {
  return {
    id: String(d._id),
    userId: String(d.userId),
    conversationId: String(d.conversationId),
    assistantId: String(d.assistantId),
    recipientEmail: d.recipientEmail as string,
    version: (d.version as number) ?? 1,
    currency: "ILS",
    recipientFirstName: (d.recipientFirstName as string | null) ?? null,
    recipientLastName: (d.recipientLastName as string | null) ?? null,
    amount: d.amount as number,
    reason: (d.reason as string | null) ?? null,
    status: d.status as AiPendingTransferRecord["status"],
    supersededById: d.supersededById != null ? String(d.supersededById) : null,
    supersedesId: d.supersedesId != null ? String(d.supersedesId) : null,
    idempotencyResults: toPlainObject(d.idempotencyResults),
    expiresAt: d.expiresAt as Date,
    createdAt: d.createdAt as Date,
    updatedAt: d.updatedAt as Date
  };
}

export const mongoAiPendingTransferRepository: AiPendingTransferRepository = {
  async findById(id, tx) {
    if (!Types.ObjectId.isValid(id)) return null;
    const q = AiPendingTransfer.findOne({ _id: id });
    const s = asSession(tx);
    if (s) q.session(s);
    const d = await q.lean();
    return d ? toRecord(d as Lean) : null;
  },

  async findActiveForConversation(userId, conversationId, tx) {
    const q = AiPendingTransfer.findOne({
      userId,
      conversationId,
      status: "pending",
      expiresAt: { $gt: new Date() }
    });
    const s = asSession(tx);
    if (s) q.session(s);
    const d = await q.lean();
    return d ? toRecord(d as Lean) : null;
  },

  async findActivePendingForUser(id, userId, conversationId, tx) {
    if (!Types.ObjectId.isValid(id)) return null;
    const q = AiPendingTransfer.findOne({
      _id: id,
      userId,
      conversationId,
      status: "pending",
      expiresAt: { $gt: new Date() }
    });
    const s = asSession(tx);
    if (s) q.session(s);
    const d = await q.lean();
    return d ? toRecord(d as Lean) : null;
  },

  async listActivePendingForUser({ userId, conversationId, limit }, tx) {
    const q = AiPendingTransfer.find({
      userId,
      status: "pending",
      expiresAt: { $gt: new Date() },
      ...(conversationId ? { conversationId } : {})
    })
      .sort({ createdAt: -1 })
      .limit(limit);
    const s = asSession(tx);
    if (s) q.session(s);
    const docs = await q.lean();
    return (docs as Lean[]).map(toRecord);
  },

  async create(input, tx) {
    const [doc] = await AiPendingTransfer.create(
      [
        {
          userId: input.userId,
          conversationId: input.conversationId,
          assistantId: input.assistantId,
          recipientEmail: input.recipientEmail,
          version: input.version,
          currency: input.currency,
          recipientFirstName: input.recipientFirstName,
          recipientLastName: input.recipientLastName,
          amount: input.amount,
          reason: input.reason,
          status: input.status,
          supersededById: input.supersededById,
          supersedesId: input.supersedesId,
          idempotencyResults: input.idempotencyResults,
          expiresAt: input.expiresAt
        }
      ],
      { ordered: true, ...(asSession(tx) ? { session: asSession(tx) } : {}) }
    );
    if (!doc) {
      throw new Error("create: AiPendingTransfer.create returned no document.");
    }
    return toRecord((doc as unknown as { toObject(): Lean }).toObject());
  },

  async updateStatus(id, status, update, tx) {
    if (!Types.ObjectId.isValid(id)) return null;

    const filter: Record<string, unknown> = { _id: id };
    if (update?.userId !== undefined) filter.userId = update.userId;
    if (update?.version !== undefined) filter.version = update.version;
    if (update?.expectedStatus !== undefined) filter.status = update.expectedStatus;
    if (update?.notExpired) filter.expiresAt = { $gt: new Date() };

    const set: Record<string, unknown> = { status };
    if (update?.idempotencyKey !== undefined) {
      set[`idempotencyResults.${update.idempotencyKey}`] = update.idempotencyResult;
    }

    const doc = await AiPendingTransfer.findOneAndUpdate(
      filter,
      { $set: set },
      { new: true, session: asSession(tx) }
    );
    return doc
      ? toRecord((doc as unknown as { toObject(): Lean }).toObject())
      : null;
  },

  async setIdempotencyResult(id, key, value, tx) {
    if (!Types.ObjectId.isValid(id)) return;
    await AiPendingTransfer.updateOne(
      { _id: id },
      { $set: { [`idempotencyResults.${key}`]: value } },
      { session: asSession(tx) }
    );
  }
};
