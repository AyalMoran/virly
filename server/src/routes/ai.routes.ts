import { randomUUID } from "crypto";
import { Router, type Response } from "express";
import { z } from "zod";
import { assistantIds, DEFAULT_ASSISTANT_ID } from "../ai/assistants.js";
import { runAssistantGraph } from "../ai/graph.js";
import { runAssistant } from "../ai/runAssistant.js";
import { createConfiguredAssistantLlmProvider } from "../ai/llm.js";
import {
  buildVideoSessionCtaBlock,
  detectVideoSessionRequest
} from "../ai/videoSessionCta.js";
import { requireAuth } from "../middleware/auth.js";
import { writeAiAuditLog } from "../services/aiAuditLog.service.js";
import { mongoConversationStore } from "../services/aiConversation.service.js";
import { respondToAiPendingTransfer } from "../services/aiPendingTransfer.service.js";
import { createVideoSession } from "../services/videoSession.service.js";

const router = Router();
const assistantLlmProvider = createConfiguredAssistantLlmProvider();

const chatSchema = z.object({
  message: z.string().trim().min(1).max(2000),
  conversationId: z.string().trim().min(1).max(120).optional(),
  assistantId: z.enum(assistantIds).default(DEFAULT_ASSISTANT_ID)
});

const confirmationSchema = z.object({
  action: z.enum(["confirm", "deny"]),
  version: z.number().int().positive(),
  idempotencyKey: z.string().trim().min(8).max(120).optional()
});
const confirmationIdSchema = z
  .string()
  .trim()
  .regex(/^[a-fA-F0-9]{24}$/, "Invalid confirmation id.");

function toChatResponse(result: Awaited<ReturnType<typeof runAssistantGraph>>) {
  return {
    message: result.message,
    responseMessage: result.responseMessage,
    responseFormatVersion: result.responseFormatVersion,
    ...(result.responseBlocks ? { responseBlocks: result.responseBlocks } : {}),
    conversationId: result.conversationId,
    assistantId: result.assistantId,
    intent: result.intent,
    toolCalls: result.toolCalls,
    ...(result.toolResults ? { toolResults: result.toolResults } : {}),
    ...(result.clarification ? { clarification: result.clarification } : {}),
    ...(result.confirmation ? { confirmation: result.confirmation } : {}),
    ...(result.supersededConfirmationId
      ? { supersededConfirmationId: result.supersededConfirmationId }
      : {})
  };
}

function containsHebrew(text: string) {
  return /[\u0590-\u05ff]/.test(text);
}

async function withVideoSessionCta(
  req: Parameters<Parameters<typeof router.post>[1]>[0],
  result: Awaited<ReturnType<typeof runAssistantGraph>>,
  message: string
) {
  if (!req.userId) {
    return result;
  }

  const request = detectVideoSessionRequest(message);
  if (!request) {
    return result;
  }

  const session = await createVideoSession({
    userId: req.userId,
    type: request.type,
    topic: request.topic,
    source: "ai_assistant",
    metadata: {
      ipAddress: req.ip ?? null,
      userAgent: req.get("user-agent") ?? null,
      locale: req.get("accept-language") ?? null
    }
  });
  const block = buildVideoSessionCtaBlock(session, containsHebrew(message));
  const responseMessage = containsHebrew(message)
    ? "יצרתי סשן וידאו מאובטח. השתמש בכפתור באפליקציה כדי להצטרף."
    : "I created a secure video session. Use the in-app button to join.";

  return {
    ...result,
    message: responseMessage,
    responseMessage,
    responseBlocks: [...(result.responseBlocks ?? []), block]
  };
}

function writeSseEvent(res: Response, event: string, data: unknown) {
  res.write(`event: ${event}\n`);
  res.write(`data: ${JSON.stringify(data)}\n\n`);
}

router.post("/chat", requireAuth, async (req, res, next) => {
  try {
    const payload = chatSchema.parse(req.body);
    const conversationId = payload.conversationId ?? randomUUID();
    const requestIdHeader = req.header("x-request-id");
    const requestId = requestIdHeader?.trim() || randomUUID();

    const result = await runAssistant(
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
    const responseResult = await withVideoSessionCta(req, result, payload.message);

    return res.json(toChatResponse(responseResult));
  } catch (error) {
    next(error);
  }
});

router.post("/chat/stream", requireAuth, async (req, res, next) => {
  try {
    const payload = chatSchema.parse(req.body);
    const conversationId = payload.conversationId ?? randomUUID();
    const requestIdHeader = req.header("x-request-id");
    const requestId = requestIdHeader?.trim() || randomUUID();

    res.setHeader("Content-Type", "text/event-stream; charset=utf-8");
    res.setHeader("Cache-Control", "no-cache, no-transform");
    res.setHeader("Connection", "keep-alive");
    res.flushHeaders();

    const streamedPhases = new Set<string>();
    const sendStatusPhase = (phase: string) => {
      if (streamedPhases.has(phase)) {
        return;
      }

      streamedPhases.add(phase);
      writeSseEvent(res, "status", {
        type: "status",
        phase,
        conversationId,
        assistantId: payload.assistantId
      });
    };

    sendStatusPhase("accepted");

    const result = await runAssistant(
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
        conversationStore: mongoConversationStore,
        onProgress: async ({ phase }) => {
          sendStatusPhase(phase);
        }
      }
    );
    const responseResult = await withVideoSessionCta(req, result, payload.message);

    writeSseEvent(res, "result", {
      type: "result",
      conversationId,
      assistantId: responseResult.assistantId,
      result: toChatResponse(responseResult)
    });
    sendStatusPhase("completed");
    res.end();
  } catch (error) {
    if (!res.headersSent) {
      next(error);
      return;
    }

    writeSseEvent(res, "error", {
      type: "error",
      message: error instanceof Error ? error.message : "Streaming request failed."
    });
    res.end();
  }
});

router.post("/confirmations/:id", requireAuth, async (req, res, next) => {
  try {
    if (!req.userId) {
      return res.status(401).json({ message: "Authentication required." });
    }

    const payload = confirmationSchema.parse(req.body);
    const idempotencyHeader = req.header("idempotency-key")?.trim();
    const pendingTransferId = confirmationIdSchema.parse(req.params.id);
    const result = await respondToAiPendingTransfer({
      userId: req.userId,
      pendingTransferId,
      action: payload.action,
      version: payload.version,
      idempotencyKey: payload.idempotencyKey ?? idempotencyHeader
    });

    return res.json(result);
  } catch (error) {
    if (error instanceof Error && "status" in error) {
      return res.status(Number(error.status)).json({
        message: error.message,
        ...("error" in error ? { error: error.error } : {}),
        ...("supersededById" in error
          ? { supersededById: error.supersededById }
          : {})
      });
    }

    next(error);
  }
});

export default router;
