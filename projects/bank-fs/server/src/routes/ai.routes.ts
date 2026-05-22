import { randomUUID } from "crypto";
import { Router } from "express";
import { z } from "zod";
import { assistantIds, DEFAULT_ASSISTANT_ID } from "../ai/assistants.js";
import { runAssistantGraph } from "../ai/graph.js";
import { createConfiguredAssistantLlmProvider } from "../ai/llm.js";
import { requireAuth } from "../middleware/auth.js";
import { writeAiAuditLog } from "../services/aiAuditLog.service.js";
import { mongoConversationStore } from "../services/aiConversation.service.js";
import { respondToAiPendingTransfer } from "../services/aiPendingTransfer.service.js";

const router = Router();
const assistantLlmProvider = createConfiguredAssistantLlmProvider();

const chatSchema = z.object({
  message: z.string().trim().min(1).max(2000),
  conversationId: z.string().trim().min(1).max(120).optional(),
  assistantId: z.enum(assistantIds).default(DEFAULT_ASSISTANT_ID)
});

const confirmationSchema = z.object({
  action: z.enum(["confirm", "deny"])
});
const confirmationIdSchema = z
  .string()
  .trim()
  .regex(/^[a-fA-F0-9]{24}$/, "Invalid confirmation id.");

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
        llmProvider: assistantLlmProvider,
        conversationStore: mongoConversationStore
      }
    );

    return res.json({
      message: result.message,
      conversationId: result.conversationId,
      assistantId: result.assistantId,
      intent: result.intent,
      toolCalls: result.toolCalls,
      ...(result.confirmation ? { confirmation: result.confirmation } : {})
    });
  } catch (error) {
    next(error);
  }
});

router.post("/confirmations/:id", requireAuth, async (req, res, next) => {
  try {
    if (!req.userId) {
      return res.status(401).json({ message: "Authentication required." });
    }

    const payload = confirmationSchema.parse(req.body);
    const pendingTransferId = confirmationIdSchema.parse(req.params.id);
    const result = await respondToAiPendingTransfer({
      userId: req.userId,
      pendingTransferId,
      action: payload.action
    });

    return res.json(result);
  } catch (error) {
    if (error instanceof Error && "status" in error) {
      return res.status(Number(error.status)).json({ message: error.message });
    }

    next(error);
  }
});

export default router;
