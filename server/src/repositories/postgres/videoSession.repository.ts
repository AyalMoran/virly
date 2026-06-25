// src/repositories/postgres/videoSession.repository.ts

import { eq, and, inArray, desc } from "drizzle-orm";
import { videoSessions } from "./schema.js";
import { asPgTx } from "./transaction.js";
import { newObjectId, isObjectIdHex } from "./id.js";
import type {
  VideoSessionRecord,
  VideoSessionRepository,
  TxContext
} from "../types.js";

type Row = typeof videoSessions.$inferSelect;

function toRecord(r: Row): VideoSessionRecord {
  // `metadata` is projected to a fixed shape (with defaults) on both drivers, so
  // the jsonb column and the Mongo sub-document surface identically.
  const meta = (r.metadata as Record<string, unknown> | null | undefined) ?? {};
  return {
    id: r.id,
    userId: r.userId,
    assignedAgentId: r.assignedAgentId ?? null,
    type: r.type as VideoSessionRecord["type"],
    status: r.status as VideoSessionRecord["status"],
    roomName: r.roomName,
    provider: r.provider,
    topic: r.topic ?? null,
    userProblemSummary: r.userProblemSummary ?? null,
    startedAt: r.startedAt ?? null,
    endedAt: r.endedAt ?? null,
    userJoinedAt: r.userJoinedAt ?? null,
    agentJoinedAt: r.agentJoinedAt ?? null,
    metadata: {
      userAgent: (meta.userAgent as string | null | undefined) ?? null,
      locale: (meta.locale as string | null | undefined) ?? null,
      source: (meta.source as string) ?? "dashboard"
    },
    createdAt: r.createdAt,
    updatedAt: r.updatedAt
  };
}

export const postgresVideoSessionRepository: VideoSessionRepository = {
  async findById(id: string, tx?: TxContext): Promise<VideoSessionRecord | null> {
    if (!isObjectIdHex(id)) return null;
    const [r] = await asPgTx(tx).select().from(videoSessions).where(eq(videoSessions.id, id)).limit(1);
    return r ? toRecord(r) : null;
  },

  async findByRoomName(roomName, tx) {
    const [r] = await asPgTx(tx)
      .select()
      .from(videoSessions)
      .where(eq(videoSessions.roomName, roomName))
      .limit(1);
    return r ? toRecord(r) : null;
  },

  async create(input, tx) {
    const now = new Date();
    const [r] = await asPgTx(tx)
      .insert(videoSessions)
      .values({
        id: newObjectId(),
        userId: input.userId,
        assignedAgentId: input.assignedAgentId ?? null,
        type: input.type,
        status: input.status,
        roomName: input.roomName,
        provider: input.provider,
        topic: input.topic ?? null,
        userProblemSummary: input.userProblemSummary ?? null,
        startedAt: input.startedAt ?? null,
        endedAt: input.endedAt ?? null,
        userJoinedAt: input.userJoinedAt ?? null,
        agentJoinedAt: input.agentJoinedAt ?? null,
        metadata: input.metadata,
        createdAt: now,
        updatedAt: now
      })
      .returning();
    if (!r) {
      throw new Error("create: insert returned no row.");
    }
    return toRecord(r);
  },

  async update(id, patch, tx) {
    if (!isObjectIdHex(id)) return null;
    const [r] = await asPgTx(tx)
      .update(videoSessions)
      .set({ ...patch, updatedAt: new Date() })
      .where(eq(videoSessions.id, id))
      .returning();
    return r ? toRecord(r) : null;
  },

  async listForUser(userId, tx) {
    const rows = await asPgTx(tx)
      .select()
      .from(videoSessions)
      .where(eq(videoSessions.userId, userId))
      .orderBy(desc(videoSessions.createdAt));
    return rows.map(toRecord);
  },

  async listForAgentQueue({ types, status, limit }, tx) {
    const conditions = [inArray(videoSessions.type, types)];
    if (status) conditions.push(eq(videoSessions.status, status));
    const rows = await asPgTx(tx)
      .select()
      .from(videoSessions)
      .where(and(...conditions))
      .orderBy(desc(videoSessions.createdAt))
      .limit(limit);
    return rows.map(toRecord);
  }
};
