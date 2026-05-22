import { Schema, model } from "mongoose";

const chatMessageSchema = new Schema(
  {
    role: {
      type: String,
      enum: ["user", "assistant"],
      required: true
    },
    content: {
      type: String,
      required: true
    },
    createdAt: {
      type: Date,
      required: true,
      default: Date.now
    }
  },
  { _id: false }
);

const counterpartyRefSchema = new Schema(
  {
    email: {
      type: String,
      required: true,
      lowercase: true,
      trim: true
    },
    maskedLabel: {
      type: String,
      required: true
    },
    firstMentionedAtTurn: {
      type: Number,
      required: true
    },
    lastReferencedAtTurn: {
      type: Number,
      required: true
    }
  },
  { _id: false }
);

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
      type: [chatMessageSchema],
      default: []
    },
    memory: {
      turn: {
        type: Number,
        default: 0
      },
      lastCounterparty: {
        type: counterpartyRefSchema,
        default: null
      },
      mentionedCounterparties: {
        type: [counterpartyRefSchema],
        default: []
      }
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
    timestamps: true
  }
);

aiConversationSchema.index({ userId: 1, conversationId: 1 }, { unique: true });

export const AiConversation = model("AiConversation", aiConversationSchema);
