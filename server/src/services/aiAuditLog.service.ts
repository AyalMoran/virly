import { getRepositories } from "../repositories/index.js";
import { AuditLogInput } from "../ai/state.js";

export async function writeAiAuditLog(input: AuditLogInput) {
  await getRepositories().aiAuditLogs.create({
    userId: input.userId,
    conversationId: input.conversationId,
    requestId: input.requestId ?? null,
    assistantId: input.assistantId,
    intent: input.intent,
    toolsRequested: input.toolsRequested,
    toolsExecuted: input.toolsExecuted,
    refusalReason: input.refusalReason ?? null,
    diagnostics: input.diagnostics ?? []
  });
}
