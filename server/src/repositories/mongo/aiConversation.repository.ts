// src/repositories/mongo/aiConversation.repository.ts
import { AiConversation } from "../../models/AiConversation.js";
import { asSession } from "./transaction.js";
import type {
  AiConversationRecord,
  AiConversationRepository
} from "../types.js";

type Lean = Record<string, unknown> & { _id: unknown };

function toRecord(d: Lean): AiConversationRecord {
  return {
    id: String(d._id),
    userId: String(d.userId),
    conversationId: String(d.conversationId),
    assistantId: String(d.assistantId),
    messages: d.messages as unknown[],
    memory: d.memory as Record<string, unknown>,
    expiresAt: d.expiresAt as Date,
    createdAt: d.createdAt as Date,
    updatedAt: d.updatedAt as Date
  };
}

export const mongoAiConversationRepository: AiConversationRepository = {
  async findByConversationId(userId, conversationId, tx) {
    const q = AiConversation.findOne({ userId, conversationId });
    const s = asSession(tx);
    if (s) q.session(s);
    const d = await q.lean();
    return d ? toRecord(d as Lean) : null;
  },

  async upsert(record, tx) {
    const { userId, conversationId, assistantId, messages, memory, expiresAt } = record;
    const doc = await AiConversation.findOneAndUpdate(
      { userId, conversationId },
      {
        $set: {
          assistantId,
          messages,
          memory,
          expiresAt
        }
      },
      {
        upsert: true,
        new: true,
        setDefaultsOnInsert: true,
        session: asSession(tx)
      }
    );
    if (!doc) {
      throw new Error(
        `upsert: findOneAndUpdate returned null for userId=${userId} conversationId=${conversationId}`
      );
    }
    return toRecord((doc as unknown as { toObject(): Lean }).toObject());
  }
};
