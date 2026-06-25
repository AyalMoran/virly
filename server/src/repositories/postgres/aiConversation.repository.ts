// src/repositories/postgres/aiConversation.repository.ts

import { eq, and } from "drizzle-orm";
import { aiConversations } from "./schema.js";
import { asPgTx } from "./transaction.js";
import { newObjectId } from "./id.js";
import type {
  AiConversationRecord,
  AiConversationRepository,
  TxContext
} from "../types.js";

type Row = typeof aiConversations.$inferSelect;

function toRecord(r: Row): AiConversationRecord {
  return {
    id: r.id,
    userId: r.userId,
    conversationId: r.conversationId,
    assistantId: r.assistantId,
    messages: r.messages as unknown[],
    memory: r.memory as Record<string, unknown>,
    expiresAt: r.expiresAt,
    createdAt: r.createdAt,
    updatedAt: r.updatedAt
  };
}

export const postgresAiConversationRepository: AiConversationRepository = {
  async findByConversationId(
    userId: string,
    conversationId: string,
    tx?: TxContext
  ): Promise<AiConversationRecord | null> {
    const [r] = await asPgTx(tx)
      .select()
      .from(aiConversations)
      .where(
        and(
          eq(aiConversations.userId, userId),
          eq(aiConversations.conversationId, conversationId)
        )
      )
      .limit(1);
    return r ? toRecord(r) : null;
  },

  async upsert(
    record: Omit<AiConversationRecord, "id" | "createdAt" | "updatedAt">,
    tx?: TxContext
  ): Promise<AiConversationRecord> {
    const now = new Date();
    const [r] = await asPgTx(tx)
      .insert(aiConversations)
      .values({
        id: newObjectId(),
        userId: record.userId,
        conversationId: record.conversationId,
        assistantId: record.assistantId,
        messages: record.messages,
        memory: record.memory,
        expiresAt: record.expiresAt,
        createdAt: now,
        updatedAt: now
      })
      .onConflictDoUpdate({
        target: [aiConversations.userId, aiConversations.conversationId],
        set: {
          assistantId: record.assistantId,
          messages: record.messages,
          memory: record.memory,
          expiresAt: record.expiresAt,
          updatedAt: now
        }
      })
      .returning();
    if (!r) {
      throw new Error(
        `upsert: insert/update returned null for userId=${record.userId} conversationId=${record.conversationId}`
      );
    }
    return toRecord(r);
  }
};
