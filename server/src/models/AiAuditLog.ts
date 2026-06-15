import { Schema, model } from "mongoose";

const aiAuditLogSchema = new Schema(
  {
    userId: {
      type: Schema.Types.ObjectId,
      ref: "User",
      required: true,
      index: true
    },
    conversationId: {
      type: String,
      required: true,
      index: true
    },
    requestId: {
      type: String,
      default: null,
      index: true
    },
    assistantId: {
      type: String,
      required: true,
      default: "oshri"
    },
    intent: {
      type: String,
      required: true
    },
    toolsRequested: {
      type: [String],
      default: []
    },
    toolsExecuted: {
      type: [String],
      default: []
    },
    refusalReason: {
      type: String,
      default: null
    },
    diagnostics: {
      type: [Schema.Types.Mixed],
      default: []
    }
  },
  {
    timestamps: true
  }
);

export const AiAuditLog = model("AiAuditLog", aiAuditLogSchema);
