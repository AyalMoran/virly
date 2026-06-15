import { Router } from "express";
import { z } from "zod";
import { requireAuth } from "../middleware/auth.js";
import { requireAnyVideoAgentRole } from "../middleware/roles.js";
import {
  assignVideoSessionToAgent,
  createVideoSession,
  endVideoSession,
  getOwnVideoSession,
  issueVideoJoinConfig,
  listAgentVideoSessions,
  toVideoSessionDto,
  VideoSessionServiceError
} from "../services/videoSession.service.js";
import {
  videoSessionSourceValues,
  videoSessionStatusValues,
  videoSessionTypeValues
} from "../models/VideoSession.js";

const router = Router();
const adminRouter = Router();

const sessionIdSchema = z
  .string()
  .trim()
  .regex(/^[a-fA-F0-9]{24}$/, "Invalid video session id.");

const createVideoSessionSchema = z.object({
  type: z.enum(videoSessionTypeValues),
  topic: z.string().trim().max(200).optional(),
  userProblemSummary: z.string().trim().max(1000).optional(),
  source: z.enum(videoSessionSourceValues).default("dashboard"),
  locale: z.string().trim().max(50).optional()
});

const listQuerySchema = z.object({
  type: z.enum(videoSessionTypeValues).optional(),
  status: z.enum(videoSessionStatusValues).optional()
});

function getRequestMetadata(req: Parameters<Parameters<typeof router.get>[1]>[0]) {
  return {
    ipAddress: req.ip ?? null,
    userAgent: req.get("user-agent") ?? null,
    locale:
      typeof req.body?.locale === "string"
        ? req.body.locale
        : req.get("accept-language") ?? null
  };
}

function handleVideoError(error: unknown, next: (error: unknown) => void) {
  if (error instanceof VideoSessionServiceError) {
    return {
      status: error.status,
      body: {
        message: error.message,
        error: error.error
      }
    };
  }

  next(error);
  return null;
}

router.use(requireAuth);

router.post("/", async (req, res, next) => {
  try {
    if (!req.userId) {
      return res.status(401).json({ message: "Authentication required." });
    }

    const payload = createVideoSessionSchema.parse(req.body);
    const session = await createVideoSession({
      userId: req.userId,
      type: payload.type,
      topic: payload.topic,
      userProblemSummary: payload.userProblemSummary,
      source: payload.source,
      metadata: {
        ...getRequestMetadata(req),
        locale: payload.locale ?? req.get("accept-language") ?? null
      }
    });

    return res.status(201).json({ session: toVideoSessionDto(session) });
  } catch (error) {
    const handled = handleVideoError(error, next);
    if (handled) {
      return res.status(handled.status).json(handled.body);
    }
  }
});

router.get("/:id", async (req, res, next) => {
  try {
    if (!req.userId) {
      return res.status(401).json({ message: "Authentication required." });
    }

    const sessionId = sessionIdSchema.parse(req.params.id);
    const session = await getOwnVideoSession(req.userId, sessionId);
    return res.json({ session: toVideoSessionDto(session) });
  } catch (error) {
    const handled = handleVideoError(error, next);
    if (handled) {
      return res.status(handled.status).json(handled.body);
    }
  }
});

router.post("/:id/join-token", async (req, res, next) => {
  try {
    if (!req.userId) {
      return res.status(401).json({ message: "Authentication required." });
    }

    const sessionId = sessionIdSchema.parse(req.params.id);
    const result = await issueVideoJoinConfig({
      actorId: req.userId,
      sessionId,
      actorKind: "user",
      metadata: getRequestMetadata(req)
    });

    return res.json({
      session: toVideoSessionDto(result.session),
      jitsi: result.jitsi
    });
  } catch (error) {
    const handled = handleVideoError(error, next);
    if (handled) {
      return res.status(handled.status).json(handled.body);
    }
  }
});

router.post("/:id/end", async (req, res, next) => {
  try {
    if (!req.userId) {
      return res.status(401).json({ message: "Authentication required." });
    }

    const sessionId = sessionIdSchema.parse(req.params.id);
    const session = await endVideoSession({
      actorId: req.userId,
      sessionId,
      actorKind: "user",
      metadata: getRequestMetadata(req)
    });

    return res.json({ session: toVideoSessionDto(session) });
  } catch (error) {
    const handled = handleVideoError(error, next);
    if (handled) {
      return res.status(handled.status).json(handled.body);
    }
  }
});

adminRouter.use(requireAuth, requireAnyVideoAgentRole);

adminRouter.get("/", async (req, res, next) => {
  try {
    if (!req.userId) {
      return res.status(401).json({ message: "Authentication required." });
    }

    const query = listQuerySchema.parse(req.query);
    const sessions = await listAgentVideoSessions({
      actorId: req.userId,
      type: query.type,
      status: query.status
    });

    return res.json({ sessions });
  } catch (error) {
    const handled = handleVideoError(error, next);
    if (handled) {
      return res.status(handled.status).json(handled.body);
    }
  }
});

adminRouter.post("/:id/assign", async (req, res, next) => {
  try {
    if (!req.userId) {
      return res.status(401).json({ message: "Authentication required." });
    }

    const sessionId = sessionIdSchema.parse(req.params.id);
    const session = await assignVideoSessionToAgent({
      actorId: req.userId,
      sessionId,
      metadata: getRequestMetadata(req)
    });

    return res.json({ session: toVideoSessionDto(session) });
  } catch (error) {
    const handled = handleVideoError(error, next);
    if (handled) {
      return res.status(handled.status).json(handled.body);
    }
  }
});

adminRouter.post("/:id/join-token", async (req, res, next) => {
  try {
    if (!req.userId) {
      return res.status(401).json({ message: "Authentication required." });
    }

    const sessionId = sessionIdSchema.parse(req.params.id);
    const result = await issueVideoJoinConfig({
      actorId: req.userId,
      sessionId,
      actorKind: "agent",
      metadata: getRequestMetadata(req)
    });

    return res.json({
      session: toVideoSessionDto(result.session),
      jitsi: result.jitsi
    });
  } catch (error) {
    const handled = handleVideoError(error, next);
    if (handled) {
      return res.status(handled.status).json(handled.body);
    }
  }
});

adminRouter.post("/:id/end", async (req, res, next) => {
  try {
    if (!req.userId) {
      return res.status(401).json({ message: "Authentication required." });
    }

    const sessionId = sessionIdSchema.parse(req.params.id);
    const session = await endVideoSession({
      actorId: req.userId,
      sessionId,
      actorKind: "agent",
      metadata: getRequestMetadata(req)
    });

    return res.json({ session: toVideoSessionDto(session) });
  } catch (error) {
    const handled = handleVideoError(error, next);
    if (handled) {
      return res.status(handled.status).json(handled.body);
    }
  }
});

export { adminRouter as adminVideoSessionRoutes };
export default router;
