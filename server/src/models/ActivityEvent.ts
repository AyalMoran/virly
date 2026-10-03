// src/models/ActivityEvent.ts
import { Schema, model } from "mongoose";

// Account activity audit trail (logins, transfers) with best-effort geo
// enrichment. geo is Mixed so the Mongo driver stores exactly the object the
// service resolved (or null), byte-compatible with the Postgres jsonb column.
const activityEventSchema = new Schema(
  {
    userId: { type: Schema.Types.ObjectId, ref: "User", required: true },
    kind: { type: String, enum: ["login", "transfer"], required: true },
    at: { type: Date, required: true },
    ip: { type: String, default: null },
    geo: { type: Schema.Types.Mixed, default: null },
    transactionId: { type: Schema.Types.ObjectId, ref: "Transaction", default: null },
    expiresAt: { type: Date, required: true }
  },
  { timestamps: true }
);

// The one query shape: a user's recent events, newest first.
activityEventSchema.index({ userId: 1, at: -1 });
// TTL: Mongo drops the doc at expiresAt (retention for free).
activityEventSchema.index({ expiresAt: 1 }, { expireAfterSeconds: 0 });

export const ActivityEvent = model("ActivityEvent", activityEventSchema);
