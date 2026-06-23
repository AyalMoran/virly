// src/repositories/mongo/aiAuditLog.repository.ts
import { AiAuditLog } from "../../models/AiAuditLog.js";
import { asSession } from "./transaction.js";
import type {
  AiAuditLogRecord,
  AiAuditLogRepository
} from "../types.js";

type Lean = Record<string, unknown> & { _id: unknown };

function toRecord(d: Lean): AiAuditLogRecord {
  return {
    id: String(d._id),
    userId: String(d.userId),
    conversationId: String(d.conversationId),
    requestId: (d.requestId as string | null | undefined) ?? null,
    assistantId: String(d.assistantId),
    intent: String(d.intent),
    toolsRequested: d.toolsRequested as string[],
    toolsExecuted: d.toolsExecuted as string[],
    refusalReason: (d.refusalReason as string | null | undefined) ?? null,
    diagnostics: d.diagnostics as unknown[],
    createdAt: d.createdAt as Date,
    updatedAt: d.updatedAt as Date
  };
}

export const mongoAiAuditLogRepository: AiAuditLogRepository = {
  async create(input, tx) {
    const [doc] = await AiAuditLog.create(
      [
        {
          userId: input.userId,
          conversationId: input.conversationId,
          requestId: input.requestId ?? null,
          assistantId: input.assistantId,
          intent: input.intent,
          toolsRequested: input.toolsRequested,
          toolsExecuted: input.toolsExecuted,
          refusalReason: input.refusalReason ?? null,
          diagnostics: input.diagnostics ?? []
        }
      ],
      { session: asSession(tx) }
    );
    return toRecord((doc as unknown as { toObject(): Lean }).toObject());
  }
};
