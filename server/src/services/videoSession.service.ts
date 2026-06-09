import { randomBytes, randomUUID } from "crypto";
import type { Types } from "mongoose";
import { config } from "../config.js";
import {
  VideoSession,
  type VideoSessionSource,
  type VideoSessionStatus,
  type VideoSessionType
} from "../models/VideoSession.js";
import { User, type UserRole } from "../models/User.js";
import {
  createVideoJoinConfig,
  type VideoJoinConfig
} from "./jitsiProvider.service.js";
import { writeVideoAuditLog } from "./videoAuditLog.service.js";
import { getAllowedVideoSessionTypes } from "../middleware/roles.js";

export type VideoSessionDocument = InstanceType<typeof VideoSession>;
type UserDocument = InstanceType<typeof User>;

export class VideoSessionServiceError extends Error {
  readonly status: number;
  readonly error: string;

  constructor(status: number, message: string, error: string) {
    super(message);
    this.name = "VideoSessionServiceError";
    this.status = status;
    this.error = error;
  }
}

export type RequestMetadata = {
  ipAddress?: string | null;
  userAgent?: string | null;
  locale?: string | null;
};

export type CreateVideoSessionInput = {
  userId: string;
  type: VideoSessionType;
  topic?: string | null;
  userProblemSummary?: string | null;
  source?: VideoSessionSource;
  metadata?: RequestMetadata;
};

export type IssueJoinConfigInput = {
  actorId: string;
  sessionId: string;
  actorKind: "user" | "agent";
  metadata?: RequestMetadata;
};

export type EndVideoSessionInput = {
  actorId: string;
  sessionId: string;
  actorKind: "user" | "agent";
  metadata?: RequestMetadata;
};

export type ListAgentSessionsInput = {
  actorId: string;
  type?: VideoSessionType;
  status?: VideoSessionStatus;
};

export type AssignAgentSessionInput = {
  actorId: string;
  sessionId: string;
  metadata?: RequestMetadata;
};

function createOpaqueRoomName(type: VideoSessionType) {
  const uuidPart = randomUUID().replace(/-/g, "");
  const suffix = randomBytes(6).toString("base64url");
  return `virly-${type}-${uuidPart}-${suffix}`;
}

function normalizeNullableText(value?: string | null) {
  const text = value?.trim();
  return text ? text : null;
}

function sameId(a: unknown, b: unknown) {
  return String(a) === String(b);
}

function getRole(user: UserDocument | null | undefined): UserRole {
  return (user?.role ?? "user") as UserRole;
}

function isTerminalStatus(status: VideoSessionStatus) {
  return ["ended", "missed", "cancelled", "failed"].includes(status);
}

function isManagerRole(role: UserRole) {
  return role === "admin" || role === "support_manager";
}

function maskEmail(email: string) {
  const [name, domain] = email.split("@");
  if (!name || !domain) {
    return "unknown";
  }

  const visible = name.slice(0, Math.min(2, name.length));
  return `${visible}${"*".repeat(Math.max(2, name.length - visible.length))}@${domain}`;
}

async function getActor(actorId: string) {
  const user = await User.findById(actorId);
  if (!user) {
    throw new VideoSessionServiceError(404, "Actor not found.", "actor_not_found");
  }

  return user;
}

async function getSession(sessionId: string) {
  const session = await VideoSession.findById(sessionId);
  if (!session) {
    throw new VideoSessionServiceError(404, "Video session not found.", "session_not_found");
  }

  return session;
}

function ensureAgentCanHandle(role: UserRole, type: VideoSessionType) {
  const allowed = getAllowedVideoSessionTypes(role);
  if (!allowed[type]) {
    throw new VideoSessionServiceError(
      403,
      "You are not authorized to access this video session type.",
      "video_session_type_forbidden"
    );
  }
}

function ensureAgentCanJoinAssignedSession(
  actor: UserDocument,
  session: VideoSessionDocument
) {
  const role = getRole(actor);
  ensureAgentCanHandle(role, session.type as VideoSessionType);

  if (
    session.assignedAgentId &&
    !sameId(session.assignedAgentId, actor._id) &&
    !isManagerRole(role)
  ) {
    throw new VideoSessionServiceError(
      403,
      "This video session is assigned to another agent.",
      "video_session_assigned_to_another_agent"
    );
  }
}

export function toVideoSessionDto(session: VideoSessionDocument) {
  return {
    id: session.id,
    type: session.type as VideoSessionType,
    status: session.status as VideoSessionStatus,
    topic: session.topic ?? null,
    userProblemSummary: session.userProblemSummary ?? null,
    source: session.metadata?.source ?? "dashboard",
    assignedAgentId: session.assignedAgentId
      ? String(session.assignedAgentId)
      : null,
    createdAt: session.createdAt?.toISOString(),
    updatedAt: session.updatedAt?.toISOString(),
    startedAt: session.startedAt?.toISOString() ?? null,
    endedAt: session.endedAt?.toISOString() ?? null,
    userJoinedAt: session.userJoinedAt?.toISOString() ?? null,
    agentJoinedAt: session.agentJoinedAt?.toISOString() ?? null
  };
}

export async function createVideoSession(input: CreateVideoSessionInput) {
  const user = await getActor(input.userId);
  const session = await VideoSession.create({
    userId: user._id,
    type: input.type,
    status: "waiting_for_agent",
    roomName: createOpaqueRoomName(input.type),
    provider: config.video.provider,
    topic: normalizeNullableText(input.topic),
    userProblemSummary: normalizeNullableText(input.userProblemSummary),
    metadata: {
      userAgent: input.metadata?.userAgent ?? null,
      locale: input.metadata?.locale ?? null,
      source: input.source ?? "dashboard"
    }
  });

  await writeVideoAuditLog({
    event: "video_session_created",
    actorId: user._id as Types.ObjectId,
    actorRole: getRole(user),
    targetUserId: user._id as Types.ObjectId,
    videoSessionId: session._id as Types.ObjectId,
    sessionType: input.type,
    ipAddress: input.metadata?.ipAddress,
    userAgent: input.metadata?.userAgent,
    details: {
      source: input.source ?? "dashboard",
      provider: session.provider
    }
  });

  return session;
}

export async function getOwnVideoSession(userId: string, sessionId: string) {
  const session = await getSession(sessionId);
  if (!sameId(session.userId, userId)) {
    throw new VideoSessionServiceError(
      404,
      "Video session not found.",
      "session_not_found"
    );
  }

  return session;
}

export async function issueVideoJoinConfig(
  input: IssueJoinConfigInput
): Promise<{ session: VideoSessionDocument; jitsi: VideoJoinConfig }> {
  const actor = await getActor(input.actorId);
  const session = await getSession(input.sessionId);
  const actorRole = getRole(actor);

  if (isTerminalStatus(session.status as VideoSessionStatus)) {
    throw new VideoSessionServiceError(
      409,
      "This video session is no longer joinable.",
      "video_session_terminal"
    );
  }

  if (input.actorKind === "user") {
    if (!sameId(session.userId, actor._id)) {
      throw new VideoSessionServiceError(
        404,
        "Video session not found.",
        "session_not_found"
      );
    }

    if (!session.userJoinedAt) {
      session.userJoinedAt = new Date();
      await session.save();
      await writeVideoAuditLog({
        event: "video_session_user_joined",
        actorId: actor._id as Types.ObjectId,
        actorRole,
        targetUserId: session.userId as Types.ObjectId,
        videoSessionId: session._id as Types.ObjectId,
        sessionType: session.type as VideoSessionType,
        ipAddress: input.metadata?.ipAddress,
        userAgent: input.metadata?.userAgent
      });
    }
  } else {
    ensureAgentCanJoinAssignedSession(actor, session);
    if (!session.assignedAgentId) {
      session.assignedAgentId = actor._id;
    }

    const now = new Date();
    if (!session.agentJoinedAt) {
      session.agentJoinedAt = now;
    }
    if (!session.startedAt) {
      session.startedAt = now;
    }
    session.status = "active";
    await session.save();
    await writeVideoAuditLog({
      event: "video_session_agent_joined",
      actorId: actor._id as Types.ObjectId,
      actorRole,
      targetUserId: session.userId as Types.ObjectId,
      videoSessionId: session._id as Types.ObjectId,
      sessionType: session.type as VideoSessionType,
      ipAddress: input.metadata?.ipAddress,
      userAgent: input.metadata?.userAgent
    });
  }

  await writeVideoAuditLog({
    event: "video_session_join_token_issued",
    actorId: actor._id as Types.ObjectId,
    actorRole,
    targetUserId: session.userId as Types.ObjectId,
    videoSessionId: session._id as Types.ObjectId,
    sessionType: session.type as VideoSessionType,
    ipAddress: input.metadata?.ipAddress,
    userAgent: input.metadata?.userAgent,
    details: {
      actorKind: input.actorKind,
      provider: session.provider
    }
  });

  return {
    session,
    jitsi: createVideoJoinConfig({
      sessionId: session.id,
      sessionType: session.type as VideoSessionType,
      roomName: session.roomName,
      actorId: actor.id,
      actorRole,
      actorKind: input.actorKind,
      displayName: input.actorKind === "agent" ? "Virly agent" : "Virly customer"
    })
  };
}

export async function endVideoSession(input: EndVideoSessionInput) {
  const actor = await getActor(input.actorId);
  const session = await getSession(input.sessionId);
  const actorRole = getRole(actor);

  if (input.actorKind === "user") {
    if (!sameId(session.userId, actor._id)) {
      throw new VideoSessionServiceError(
        404,
        "Video session not found.",
        "session_not_found"
      );
    }
  } else {
    ensureAgentCanJoinAssignedSession(actor, session);
  }

  if (!isTerminalStatus(session.status as VideoSessionStatus)) {
    session.status =
      input.actorKind === "user" && session.status !== "active" ? "cancelled" : "ended";
    session.endedAt = new Date();
    await session.save();
    await writeVideoAuditLog({
      event: session.status === "cancelled"
        ? "video_session_cancelled"
        : "video_session_ended",
      actorId: actor._id as Types.ObjectId,
      actorRole,
      targetUserId: session.userId as Types.ObjectId,
      videoSessionId: session._id as Types.ObjectId,
      sessionType: session.type as VideoSessionType,
      ipAddress: input.metadata?.ipAddress,
      userAgent: input.metadata?.userAgent,
      details: {
        actorKind: input.actorKind
      }
    });
  }

  return session;
}

export async function listAgentVideoSessions(input: ListAgentSessionsInput) {
  const actor = await getActor(input.actorId);
  const actorRole = getRole(actor);
  const allowed = getAllowedVideoSessionTypes(actorRole);
  const allowedTypes = (["support", "sales"] as const).filter((type) => allowed[type]);

  if (allowedTypes.length === 0) {
    throw new VideoSessionServiceError(
      403,
      "Video agent access required.",
      "video_agent_required"
    );
  }

  if (input.type) {
    ensureAgentCanHandle(actorRole, input.type);
  }

  const sessions = await VideoSession.find({
    type: input.type ?? { $in: allowedTypes },
    ...(input.status ? { status: input.status } : {})
  })
    .sort({ createdAt: -1 })
    .limit(50);
  const users = await User.find({
    _id: { $in: sessions.map((session) => session.userId) }
  }).select("email");
  const userById = new Map(users.map((user) => [String(user._id), user]));

  return sessions.map((session) => {
    const user = userById.get(String(session.userId));
    return {
      ...toVideoSessionDto(session),
      user: {
        id: String(session.userId),
        emailMasked: user?.email ? maskEmail(user.email) : null
      }
    };
  });
}

export async function assignVideoSessionToAgent(input: AssignAgentSessionInput) {
  const actor = await getActor(input.actorId);
  const session = await getSession(input.sessionId);
  const actorRole = getRole(actor);

  ensureAgentCanHandle(actorRole, session.type as VideoSessionType);
  if (
    session.assignedAgentId &&
    !sameId(session.assignedAgentId, actor._id) &&
    !isManagerRole(actorRole)
  ) {
    throw new VideoSessionServiceError(
      403,
      "This video session is assigned to another agent.",
      "video_session_assigned_to_another_agent"
    );
  }

  session.assignedAgentId = actor._id;
  if (session.status === "requested") {
    session.status = "waiting_for_agent";
  }
  await session.save();
  await writeVideoAuditLog({
    event: "video_session_assigned",
    actorId: actor._id as Types.ObjectId,
    actorRole,
    targetUserId: session.userId as Types.ObjectId,
    videoSessionId: session._id as Types.ObjectId,
    sessionType: session.type as VideoSessionType,
    ipAddress: input.metadata?.ipAddress,
    userAgent: input.metadata?.userAgent
  });

  return session;
}
