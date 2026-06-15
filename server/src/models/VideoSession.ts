import { Schema, model } from "mongoose";

export const videoSessionTypeValues = ["support", "sales"] as const;
export type VideoSessionType = (typeof videoSessionTypeValues)[number];

export const videoSessionStatusValues = [
  "requested",
  "waiting_for_agent",
  "active",
  "ended",
  "missed",
  "cancelled",
  "failed"
] as const;
export type VideoSessionStatus = (typeof videoSessionStatusValues)[number];

export const videoSessionProviderValues = [
  "jitsi-jaas",
  "jitsi-self-hosted",
  "jitsi-public-demo",
  "mock"
] as const;
export type VideoSessionProvider = (typeof videoSessionProviderValues)[number];

export const videoSessionSourceValues = [
  "dashboard",
  "ai_assistant",
  "transfer_flow",
  "account_page"
] as const;
export type VideoSessionSource = (typeof videoSessionSourceValues)[number];

const videoSessionSchema = new Schema(
  {
    userId: {
      type: Schema.Types.ObjectId,
      ref: "User",
      required: true,
      index: true
    },
    assignedAgentId: {
      type: Schema.Types.ObjectId,
      ref: "User",
      default: null,
      index: true
    },
    type: {
      type: String,
      enum: videoSessionTypeValues,
      required: true,
      index: true
    },
    status: {
      type: String,
      enum: videoSessionStatusValues,
      required: true,
      default: "waiting_for_agent",
      index: true
    },
    roomName: {
      type: String,
      required: true,
      unique: true,
      index: true
    },
    provider: {
      type: String,
      enum: videoSessionProviderValues,
      required: true
    },
    topic: {
      type: String,
      trim: true,
      maxlength: 200,
      default: null
    },
    userProblemSummary: {
      type: String,
      trim: true,
      maxlength: 1000,
      default: null
    },
    startedAt: {
      type: Date,
      default: null
    },
    endedAt: {
      type: Date,
      default: null
    },
    userJoinedAt: {
      type: Date,
      default: null
    },
    agentJoinedAt: {
      type: Date,
      default: null
    },
    metadata: {
      userAgent: {
        type: String,
        trim: true,
        maxlength: 500,
        default: null
      },
      locale: {
        type: String,
        trim: true,
        maxlength: 50,
        default: null
      },
      source: {
        type: String,
        enum: videoSessionSourceValues,
        default: "dashboard"
      }
    }
  },
  {
    timestamps: true
  }
);

export const VideoSession = model("VideoSession", videoSessionSchema);

