// src/repositories/mongo/videoAuditLog.repository.ts
import { VideoAuditLog } from "../../models/VideoAuditLog.js";
import { asSession } from "./transaction.js";
import type {
  VideoAuditLogRecord,
  VideoAuditLogRepository
} from "../types.js";

type Lean = Record<string, unknown> & { _id: unknown };

function toRecord(d: Lean): VideoAuditLogRecord {
  return {
    id: String(d._id),
    event: String(d.event),
    actorId: String(d.actorId),
    actorRole: d.actorRole as VideoAuditLogRecord["actorRole"],
    targetUserId: String(d.targetUserId),
    videoSessionId: String(d.videoSessionId),
    sessionType: d.sessionType as VideoAuditLogRecord["sessionType"],
    result: d.result as VideoAuditLogRecord["result"],
    ipAddress: (d.ipAddress as string | null | undefined) ?? null,
    userAgent: (d.userAgent as string | null | undefined) ?? null,
    details: d.details as Record<string, unknown>,
    createdAt: d.createdAt as Date,
    updatedAt: d.updatedAt as Date
  };
}

export const mongoVideoAuditLogRepository: VideoAuditLogRepository = {
  async create(input, tx) {
    const [doc] = await VideoAuditLog.create(
      [
        {
          event: input.event,
          actorId: input.actorId,
          actorRole: input.actorRole,
          targetUserId: input.targetUserId,
          videoSessionId: input.videoSessionId,
          sessionType: input.sessionType,
          result: input.result,
          ipAddress: input.ipAddress ?? null,
          userAgent: input.userAgent ?? null,
          details: input.details ?? {}
        }
      ],
      { session: asSession(tx) }
    );
    return toRecord((doc as unknown as { toObject(): Lean }).toObject());
  }
};
