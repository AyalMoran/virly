import { Schema, model } from "mongoose";

// `messages` and `memory` are persisted as opaque blobs so the Mongo driver
// round-trips them byte-for-byte, exactly like the Postgres `jsonb` columns.
// The AI layer (src/ai/v2/turn.ts, src/ai/state.ts) owns their shape — it
// supplies each message's `createdAt` and builds the full `memory` object — so
// the previous structured sub-schemas (message timestamping, memory enum/ref
// coercion, unknown-key stripping) were redundant and made the two drivers
// non-interchangeable. See the repository seam (Postgres migration, Plan 2).
const aiConversationSchema = new Schema(
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
    messages: {
      type: [Schema.Types.Mixed],
      default: []
    },
    memory: {
      type: Schema.Types.Mixed,
      default: {}
    },
    expiresAt: {
      type: Date,
      required: true,
      index: {
        expires: 0
      }
    }
  },
  {
    timestamps: true,
    // Keep empty objects (e.g. `memory: {}`) instead of stripping them, so the
    // opaque blobs round-trip identically to the Postgres `jsonb` columns.
    minimize: false
  }
);

aiConversationSchema.index({ userId: 1, conversationId: 1 }, { unique: true });

export const AiConversation = model("AiConversation", aiConversationSchema);
