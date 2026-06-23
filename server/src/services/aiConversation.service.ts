import type { BaseMessage } from "@langchain/core/messages";
import { getRepositories } from "../repositories/index.js";
import {
  createEmptyCounterpartyMemory,
  normalizeCounterpartyMemory,
  trimConversationMessages
} from "../ai/counterpartyMemory.js";
import { fromStored, toStored } from "../ai/messageMapping.js";
import type {
  ConversationSaveInput,
  ConversationStore,
  StoredChatMessage
} from "../ai/state.js";

const CONVERSATION_TTL_MS = 30 * 24 * 60 * 60 * 1000;

function getExpiresAt() {
  return new Date(Date.now() + CONVERSATION_TTL_MS);
}

/**
 * Deserialize persisted `{ role, content, createdAt }` documents into the
 * in-graph `BaseMessage[]` history, trimmed to the retained window. Legacy
 * documents already match this shape, so no migration/backfill is required.
 */
function loadStoredMessages(messages: StoredChatMessage[]): BaseMessage[] {
  return trimConversationMessages(fromStored(messages));
}

/**
 * Serialize the in-graph `BaseMessage[]` history back to the persisted
 * shape, trimming first and stamping `createdAt`. Only human/assistant
 * turns are persisted; the on-disk shape (`{ role, content, createdAt }`)
 * is unchanged.
 */
function toPersistedMessages(messages: BaseMessage[]): StoredChatMessage[] {
  return toStored(trimConversationMessages(messages)).map((message) => ({
    role: message.role,
    content: message.content,
    createdAt: new Date()
  }));
}

export const mongoConversationStore: ConversationStore = {
  async load(userId: string, conversationId: string) {
    const conversation = await getRepositories().aiConversations.findByConversationId(
      userId,
      conversationId
    );

    if (!conversation) {
      return {
        messages: [],
        memory: createEmptyCounterpartyMemory()
      };
    }

    return {
      messages: loadStoredMessages(conversation.messages as StoredChatMessage[]),
      memory: normalizeCounterpartyMemory(
        conversation.memory as unknown as Partial<ReturnType<typeof normalizeCounterpartyMemory>>
      )
    };
  },

  async save(input: ConversationSaveInput) {
    await getRepositories().aiConversations.upsert({
      userId: input.userId,
      conversationId: input.conversationId,
      assistantId: input.assistantId,
      messages: toPersistedMessages(input.messages),
      memory: normalizeCounterpartyMemory(input.memory),
      expiresAt: getExpiresAt()
    });
  }
};
