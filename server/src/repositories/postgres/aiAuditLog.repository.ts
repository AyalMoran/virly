// src/repositories/postgres/aiAuditLog.repository.ts

import { aiAuditLogs } from "./schema.js";
import { asPgTx } from "./transaction.js";
import { newObjectId } from "./id.js";
import type { AiAuditLogRecord, AiAuditLogRepository } from "../types.js";

type Row = typeof aiAuditLogs.$inferSelect;

function toRecord(r: Row): AiAuditLogRecord {
  return {
    id: r.id,
    userId: r.userId,
    conversationId: r.conversationId,
    requestId: r.requestId ?? null,
    assistantId: r.assistantId,
    intent: r.intent,
    toolsRequested: r.toolsRequested,
    toolsExecuted: r.toolsExecuted,
    refusalReason: r.refusalReason ?? null,
    diagnostics: r.diagnostics as unknown[],
    createdAt: r.createdAt,
    updatedAt: r.updatedAt
  };
}

export const postgresAiAuditLogRepository: AiAuditLogRepository = {
  async create(input, tx) {
    const now = new Date();
    const [r] = await asPgTx(tx)
      .insert(aiAuditLogs)
      .values({
        id: newObjectId(),
        userId: input.userId,
        conversationId: input.conversationId,
        requestId: input.requestId ?? null,
        assistantId: input.assistantId,
        intent: input.intent,
        toolsRequested: input.toolsRequested,
        toolsExecuted: input.toolsExecuted,
        refusalReason: input.refusalReason ?? null,
        diagnostics: input.diagnostics ?? [],
        createdAt: now,
        updatedAt: now
      })
      .returning();
    if (!r) {
      throw new Error("create: insert returned no row.");
    }
    return toRecord(r);
  }
};
