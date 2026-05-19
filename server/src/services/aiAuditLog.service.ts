import { AiAuditLog } from "../models/AiAuditLog.js";
import { AuditLogInput } from "../ai/state.js";

export async function writeAiAuditLog(input: AuditLogInput) {
  await AiAuditLog.create({
    userId: input.userId,
    conversationId: input.conversationId,
    requestId: input.requestId ?? null,
    intent: input.intent,
    toolsRequested: input.toolsRequested,
    toolsExecuted: input.toolsExecuted,
    refusalReason: input.refusalReason ?? null
  });
}
