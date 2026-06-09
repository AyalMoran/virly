import type { Types } from "mongoose";
import { VideoAuditLog, type VideoAuditEvent } from "../models/VideoAuditLog.js";
import type { VideoSessionType } from "../models/VideoSession.js";
import type { UserRole } from "../models/User.js";

export type WriteVideoAuditLogInput = {
  event: VideoAuditEvent;
  actorId: string | Types.ObjectId;
  actorRole: UserRole;
  targetUserId: string | Types.ObjectId;
  videoSessionId: string | Types.ObjectId;
  sessionType: VideoSessionType;
  result?: "success" | "failure";
  ipAddress?: string | null;
  userAgent?: string | null;
  details?: Record<string, unknown>;
};

export async function writeVideoAuditLog(input: WriteVideoAuditLogInput) {
  await VideoAuditLog.create({
    event: input.event,
    actorId: input.actorId,
    actorRole: input.actorRole,
    targetUserId: input.targetUserId,
    videoSessionId: input.videoSessionId,
    sessionType: input.sessionType,
    result: input.result ?? "success",
    ipAddress: input.ipAddress ?? null,
    userAgent: input.userAgent ?? null,
    details: input.details ?? {}
  });
}

