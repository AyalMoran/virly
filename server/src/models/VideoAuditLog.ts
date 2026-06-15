import { Schema, model } from "mongoose";
import { videoSessionTypeValues } from "./VideoSession.js";
import { userRoleValues } from "./User.js";

export const videoAuditEventValues = [
  "video_session_created",
  "video_session_join_token_issued",
  "video_session_user_joined",
  "video_session_agent_joined",
  "video_session_assigned",
  "video_session_ended",
  "video_session_cancelled",
  "video_session_failed"
] as const;

export type VideoAuditEvent = (typeof videoAuditEventValues)[number];

const videoAuditLogSchema = new Schema(
  {
    event: {
      type: String,
      enum: videoAuditEventValues,
      required: true,
      index: true
    },
    actorId: {
      type: Schema.Types.ObjectId,
      ref: "User",
      required: true,
      index: true
    },
    actorRole: {
      type: String,
      enum: userRoleValues,
      required: true
    },
    targetUserId: {
      type: Schema.Types.ObjectId,
      ref: "User",
      required: true,
      index: true
    },
    videoSessionId: {
      type: Schema.Types.ObjectId,
      ref: "VideoSession",
      required: true,
      index: true
    },
    sessionType: {
      type: String,
      enum: videoSessionTypeValues,
      required: true
    },
    result: {
      type: String,
      enum: ["success", "failure"],
      required: true,
      default: "success"
    },
    ipAddress: {
      type: String,
      default: null
    },
    userAgent: {
      type: String,
      default: null
    },
    details: {
      type: Schema.Types.Mixed,
      default: {}
    }
  },
  {
    timestamps: true
  }
);

export const VideoAuditLog = model("VideoAuditLog", videoAuditLogSchema);
