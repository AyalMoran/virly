// src/repositories/postgres/videoAuditLog.repository.ts

import { videoAuditLogs } from "./schema.js";
import { asPgTx } from "./transaction.js";
import { newObjectId } from "./id.js";
import type { VideoAuditLogRecord, VideoAuditLogRepository } from "../types.js";

type Row = typeof videoAuditLogs.$inferSelect;

function toRecord(r: Row): VideoAuditLogRecord {
  return {
    id: r.id,
    event: r.event,
    actorId: r.actorId,
    actorRole: r.actorRole as VideoAuditLogRecord["actorRole"],
    targetUserId: r.targetUserId,
    videoSessionId: r.videoSessionId,
    sessionType: r.sessionType as VideoAuditLogRecord["sessionType"],
    result: r.result as VideoAuditLogRecord["result"],
    ipAddress: r.ipAddress ?? null,
    userAgent: r.userAgent ?? null,
    details: r.details as Record<string, unknown>,
    createdAt: r.createdAt,
    updatedAt: r.updatedAt
  };
}

export const postgresVideoAuditLogRepository: VideoAuditLogRepository = {
  async create(input, tx) {
    const now = new Date();
    const [r] = await asPgTx(tx)
      .insert(videoAuditLogs)
      .values({
        id: newObjectId(),
        event: input.event,
        actorId: input.actorId,
        actorRole: input.actorRole,
        targetUserId: input.targetUserId,
        videoSessionId: input.videoSessionId,
        sessionType: input.sessionType,
        result: input.result,
        ipAddress: input.ipAddress ?? null,
        userAgent: input.userAgent ?? null,
        details: input.details ?? {},
        createdAt: now,
        updatedAt: now
      })
      .returning();
    if (!r) {
      throw new Error("create: insert returned no row.");
    }
    return toRecord(r);
  }
};
