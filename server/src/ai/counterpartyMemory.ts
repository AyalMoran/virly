import type {
  ChatMessage,
  CounterpartyMemory,
  CounterpartyRef,
  CounterpartyReferenceResolution,
  ToolResultMetadata
} from "./state.js";

export const MAX_CONVERSATION_MESSAGES = 20;
export const MAX_COUNTERPARTIES = 5;

export function maskEmail(email: string) {
  const [localPart, domain] = email.split("@");
  if (!localPart || !domain) {
    return "masked recipient";
  }

  return `${localPart.slice(0, 1)}***@${domain}`;
}

export function createEmptyCounterpartyMemory(): CounterpartyMemory {
  return {
    turn: 0,
    mentionedCounterparties: []
  };
}

export function normalizeCounterpartyMemory(
  memory?:
    | (Partial<CounterpartyMemory> & { lastCounterparty?: CounterpartyRef | null })
    | null
): CounterpartyMemory {
  return {
    turn: memory?.turn ?? 0,
    lastCounterparty: memory?.lastCounterparty ?? undefined,
    mentionedCounterparties: memory?.mentionedCounterparties ?? []
  };
}

export function trimConversationMessages(messages: ChatMessage[]) {
  return messages.slice(-MAX_CONVERSATION_MESSAGES);
}

export function counterpartyRefFromMetadata(
  metadata: ToolResultMetadata,
  turn: number
): CounterpartyRef | undefined {
  if (!metadata.counterpartyEmail) {
    return undefined;
  }

  return {
    email: metadata.counterpartyEmail.toLowerCase(),
    maskedLabel: metadata.maskedLabel ?? maskEmail(metadata.counterpartyEmail),
    firstMentionedAtTurn: turn,
    lastReferencedAtTurn: turn
  };
}

export function rememberCounterparty(
  memory: CounterpartyMemory,
  counterparty: CounterpartyRef,
  turn: number
): CounterpartyMemory {
  const email = counterparty.email.toLowerCase();
  const existing = memory.mentionedCounterparties.find(
    (entry) => entry.email === email
  );
  const updatedCounterparty: CounterpartyRef = {
    email,
    maskedLabel: counterparty.maskedLabel,
    firstMentionedAtTurn: existing?.firstMentionedAtTurn ?? turn,
    lastReferencedAtTurn: turn
  };
  const withoutCurrent = memory.mentionedCounterparties.filter(
    (entry) => entry.email !== email
  );
  const nextMentioned = [...withoutCurrent, updatedCounterparty]
    .sort((left, right) => {
      if (left.lastReferencedAtTurn !== right.lastReferencedAtTurn) {
        return right.lastReferencedAtTurn - left.lastReferencedAtTurn;
      }

      return left.firstMentionedAtTurn - right.firstMentionedAtTurn;
    })
    .slice(0, MAX_COUNTERPARTIES)
    .sort((left, right) => left.firstMentionedAtTurn - right.firstMentionedAtTurn);

  return {
    turn,
    lastCounterparty: updatedCounterparty,
    mentionedCounterparties: nextMentioned
  };
}

export function rememberCounterpartiesFromMetadata(
  memory: CounterpartyMemory,
  metadatas: ToolResultMetadata[],
  turn: number
) {
  return metadatas.reduce((nextMemory, metadata) => {
    const counterparty = counterpartyRefFromMetadata(metadata, turn);
    return counterparty
      ? rememberCounterparty(nextMemory, counterparty, turn)
      : nextMemory;
  }, memory);
}

function getOrdinalFromMessage(message: string) {
  const normalized = message.toLowerCase();
  const ordinalMap: Array<[RegExp, number]> = [
    [/\b(first|1st)\b/, 1],
    [/\b(second|2nd)\b/, 2],
    [/\b(third|3rd)\b/, 3],
    [/\b(fourth|4th)\b/, 4],
    [/\b(fifth|5th)\b/, 5]
  ];

  return ordinalMap.find(([pattern]) => pattern.test(normalized))?.[1];
}

function resolveByOrdinal(memory: CounterpartyMemory, ordinal: number) {
  const byFirstMention = [...memory.mentionedCounterparties].sort(
    (left, right) => left.firstMentionedAtTurn - right.firstMentionedAtTurn
  );
  return byFirstMention[ordinal - 1];
}

function resolveByName(memory: CounterpartyMemory, query: string) {
  const normalized = query.trim().toLowerCase();
  if (!normalized) {
    return undefined;
  }

  return memory.mentionedCounterparties.find(
    (entry) =>
      entry.email.toLowerCase() === normalized ||
      entry.maskedLabel.toLowerCase() === normalized ||
      entry.email.toLowerCase().startsWith(normalized)
  );
}

export function resolveReferenceAgainstMemory(
  memory: CounterpartyMemory,
  resolution: CounterpartyReferenceResolution
) {
  if (resolution.confidence !== "high") {
    return undefined;
  }

  if (resolution.kind === "last_counterparty") {
    return memory.lastCounterparty;
  }

  if (resolution.kind === "ordinal_counterparty") {
    return resolveByOrdinal(memory, resolution.ordinal);
  }

  if (resolution.kind === "named_counterparty") {
    return resolveByName(memory, resolution.query);
  }

  return undefined;
}

export function resolveCounterpartyReferenceDeterministic(
  message: string,
  memory: CounterpartyMemory
) {
  const normalized = message.toLowerCase();

  if (
    /\b(this|that)\s+(person|recipient|counterparty)\b/.test(normalized) ||
    /\b(with|to)\s+(them|that person|this person)\b/.test(normalized)
  ) {
    return memory.lastCounterparty;
  }

  const ordinal = getOrdinalFromMessage(normalized);
  if (
    ordinal &&
    /\b(person|recipient|counterparty)\b/.test(normalized) &&
    /\b(talked|discussed|mentioned|we've|weve)\b/.test(normalized)
  ) {
    return resolveByOrdinal(memory, ordinal);
  }

  return undefined;
}
