import { randomUUID } from "crypto";
import { Router } from "express";
import { z } from "zod";
import { assistantIds, DEFAULT_ASSISTANT_ID } from "../ai/assistants.js";
import { runAssistantGraph } from "../ai/graph.js";
import { createConfiguredAssistantLlmProvider } from "../ai/llm.js";
import { requireAuth } from "../middleware/auth.js";
import { writeAiAuditLog } from "../services/aiAuditLog.service.js";

const router = Router();
const assistantLlmProvider = createConfiguredAssistantLlmProvider();

const chatSchema = z.object({
  message: z.string().trim().min(1).max(2000),
  conversationId: z.string().trim().min(1).max(120).optional(),
  assistantId: z.enum(assistantIds).default(DEFAULT_ASSISTANT_ID)
});

router.post("/chat", requireAuth, async (req, res, next) => {
  try {
    const payload = chatSchema.parse(req.body);
    const conversationId = payload.conversationId ?? randomUUID();
    const requestIdHeader = req.header("x-request-id");
    const requestId = requestIdHeader?.trim() || randomUUID();

    const result = await runAssistantGraph(
      {
        userId: req.userId,
        conversationId,
        requestId,
        assistantId: payload.assistantId,
        message: payload.message
      },
      {
        auditLogger: writeAiAuditLog,
        llmProvider: assistantLlmProvider
      }
    );

    return res.json({
      message: result.message,
      conversationId: result.conversationId,
      assistantId: result.assistantId,
      intent: result.intent,
      toolCalls: result.toolCalls
    });
  } catch (error) {
    next(error);
  }
});

export default router;
