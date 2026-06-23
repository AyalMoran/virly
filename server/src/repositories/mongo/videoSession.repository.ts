// src/repositories/mongo/videoSession.repository.ts
import { Types } from "mongoose";
import { VideoSession } from "../../models/VideoSession.js";
import { asSession } from "./transaction.js";
import type {
  VideoSessionRecord,
  VideoSessionRepository
} from "../types.js";

type Lean = Record<string, unknown> & { _id: unknown };

function toRecord(d: Lean): VideoSessionRecord {
  const meta = (d.metadata as Record<string, unknown> | null | undefined) ?? {};
  return {
    id: String(d._id),
    userId: String(d.userId),
    assignedAgentId: d.assignedAgentId != null ? String(d.assignedAgentId) : null,
    type: d.type as VideoSessionRecord["type"],
    status: d.status as VideoSessionRecord["status"],
    roomName: d.roomName as string,
    provider: d.provider as string,
    topic: (d.topic as string | null | undefined) ?? null,
    userProblemSummary: (d.userProblemSummary as string | null | undefined) ?? null,
    startedAt: (d.startedAt as Date | null | undefined) ?? null,
    endedAt: (d.endedAt as Date | null | undefined) ?? null,
    userJoinedAt: (d.userJoinedAt as Date | null | undefined) ?? null,
    agentJoinedAt: (d.agentJoinedAt as Date | null | undefined) ?? null,
    metadata: {
      userAgent: (meta.userAgent as string | null | undefined) ?? null,
      locale: (meta.locale as string | null | undefined) ?? null,
      source: (meta.source as string) ?? "dashboard"
    },
    createdAt: d.createdAt as Date,
    updatedAt: d.updatedAt as Date
  };
}

export const mongoVideoSessionRepository: VideoSessionRepository = {
  async findById(id, tx) {
    if (!Types.ObjectId.isValid(id)) return null;
    const q = VideoSession.findOne({ _id: id });
    const s = asSession(tx);
    if (s) q.session(s);
    const d = await q.lean();
    return d ? toRecord(d as Lean) : null;
  },

  async findByRoomName(roomName, tx) {
    const q = VideoSession.findOne({ roomName });
    const s = asSession(tx);
    if (s) q.session(s);
    const d = await q.lean();
    return d ? toRecord(d as Lean) : null;
  },

  async create(input, tx) {
    const [doc] = await VideoSession.create(
      [
        {
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
          metadata: input.metadata
        }
      ],
      { ordered: true, ...(asSession(tx) ? { session: asSession(tx) } : {}) }
    );
    if (!doc) {
      throw new Error("create: VideoSession.create returned no document.");
    }
    return toRecord((doc as unknown as { toObject(): Lean }).toObject());
  },

  async update(id, patch, tx) {
    if (!Types.ObjectId.isValid(id)) return null;
    const doc = await VideoSession.findOneAndUpdate(
      { _id: id },
      { $set: patch },
      { new: true, session: asSession(tx) }
    );
    if (!doc) return null;
    return toRecord((doc as unknown as { toObject(): Lean }).toObject());
  },

  async listForUser(userId, tx) {
    const q = VideoSession.find({ userId }).sort({ createdAt: -1 });
    const s = asSession(tx);
    if (s) q.session(s);
    const docs = await q.lean();
    return (docs as Lean[]).map(toRecord);
  },

  async listForAgentQueue({ types, status, limit }, tx) {
    const filter: Record<string, unknown> = {
      type: types.length === 1 ? types[0] : { $in: types }
    };
    if (status) filter.status = status;
    const q = VideoSession.find(filter).sort({ createdAt: -1 }).limit(limit);
    const s = asSession(tx);
    if (s) q.session(s);
    const docs = await q.lean();
    return (docs as Lean[]).map(toRecord);
  }
};
