import { Schema, model } from "mongoose";

const aiPendingTransferSchema = new Schema(
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
    assistantId: {
      type: String,
      required: true,
      default: "oshri"
    },
    recipientEmail: {
      type: String,
      required: true,
      lowercase: true,
      trim: true
    },
    version: {
      type: Number,
      required: true,
      default: 1
    },
    currency: {
      type: String,
      enum: ["ILS"],
      required: true,
      default: "ILS"
    },
    recipientFirstName: {
      type: String,
      default: null
    },
    recipientLastName: {
      type: String,
      default: null
    },
    amount: {
      type: Number,
      required: true
    },
    reason: {
      type: String,
      default: null,
      trim: true,
      maxlength: 200
    },
    status: {
      type: String,
      enum: ["pending", "confirmed", "denied", "expired"],
      required: true,
      default: "pending",
      index: true
    },
    idempotencyResults: {
      type: Map,
      of: Schema.Types.Mixed,
      default: {}
    },
    expiresAt: {
      type: Date,
      required: true
    }
  },
  {
    timestamps: true
  }
);

aiPendingTransferSchema.index({ expiresAt: 1 }, { expireAfterSeconds: 0 });

export const AiPendingTransfer = model(
  "AiPendingTransfer",
  aiPendingTransferSchema
);
