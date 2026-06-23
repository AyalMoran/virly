import type { Types } from "mongoose";
import type { VideoSessionType } from "../repositories/types.js";
import type { UserRole } from "../models/User.js";
import { getRepositories } from "../repositories/index.js";

export type WriteVideoAuditLogInput = {
  event: string;
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
  await getRepositories().videoAuditLogs.create({
    event: input.event,
    actorId: String(input.actorId),
    actorRole: input.actorRole,
    targetUserId: String(input.targetUserId),
    videoSessionId: String(input.videoSessionId),
    sessionType: input.sessionType,
    result: input.result ?? "success",
    ipAddress: input.ipAddress ?? null,
    userAgent: input.userAgent ?? null,
    details: input.details ?? {}
  });
}
