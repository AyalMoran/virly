import { randomUUID } from "crypto";
import { Router } from "express";
import { z } from "zod";
import { runAssistantGraph } from "../ai/graph.js";
import { requireAuth } from "../middleware/auth.js";
import { writeAiAuditLog } from "../services/aiAuditLog.service.js";

const router = Router();

const chatSchema = z.object({
  message: z.string().trim().min(1).max(2000),
  conversationId: z.string().trim().min(1).max(120).optional()
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
        message: payload.message
      },
      {
        auditLogger: writeAiAuditLog
      }
    );

    return res.json({
      message: result.message,
      conversationId: result.conversationId,
      intent: result.intent,
      toolCalls: result.toolCalls
    });
  } catch (error) {
    next(error);
  }
});

export default router;
