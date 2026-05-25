import { AiConversation } from "../models/AiConversation.js";
import {
  createEmptyCounterpartyMemory,
  normalizeCounterpartyMemory,
  trimConversationMessages
} from "../ai/counterpartyMemory.js";
import type {
  ChatMessage,
  ConversationSaveInput,
  ConversationStore
} from "../ai/state.js";

const CONVERSATION_TTL_MS = 30 * 24 * 60 * 60 * 1000;

function getExpiresAt() {
  return new Date(Date.now() + CONVERSATION_TTL_MS);
}

function normalizeMessages(messages: ChatMessage[]) {
  return trimConversationMessages(
    messages.map((message) => ({
      role: message.role,
      content: message.content,
      createdAt: message.createdAt ?? new Date()
    }))
  );
}

export const mongoConversationStore: ConversationStore = {
  async load(userId: string, conversationId: string) {
    const conversation = await AiConversation.findOne({
      userId,
      conversationId
    }).lean();

    if (!conversation) {
      return {
        messages: [],
        memory: createEmptyCounterpartyMemory()
      };
    }

    return {
      messages: normalizeMessages(conversation.messages),
      memory: normalizeCounterpartyMemory(
        conversation.memory as unknown as Partial<ReturnType<typeof normalizeCounterpartyMemory>>
      )
    };
  },

  async save(input: ConversationSaveInput) {
    await AiConversation.findOneAndUpdate(
      {
        userId: input.userId,
        conversationId: input.conversationId
      },
      {
        $set: {
          assistantId: input.assistantId,
          messages: normalizeMessages(input.messages),
          memory: normalizeCounterpartyMemory(input.memory),
          expiresAt: getExpiresAt()
        }
      },
      {
        upsert: true,
        new: true,
        setDefaultsOnInsert: true
      }
    );
  }
};
