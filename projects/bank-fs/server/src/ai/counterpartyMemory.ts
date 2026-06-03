import type {
  ChatMessage,
  ConversationAnswerFrame,
  ConversationEntity,
  CounterpartyMemory,
  CounterpartyRef,
  CounterpartyReferenceResolution,
  ToolResultMetadata
} from "./state.js";

export const MAX_CONVERSATION_MESSAGES = 20;
export const MAX_COUNTERPARTIES = 8;
const MAX_CONTEXT_ENTITIES = 20;
const MAX_ANSWER_FRAMES = 8;

export function maskEmail(email: string) {
  const [localPart, domain] = email.split("@");
  if (!localPart || !domain) {
    return "masked recipient";
  }

  return `${localPart.slice(0, 1)}***@${domain}`;
}

export function buildCounterpartyUserLabel(input: {
  email: string;
  displayName?: string | null;
  maskedLabel?: string | null;
}) {
  const email = input.email.trim().toLowerCase();
  const displayName = input.displayName?.trim();
  const maskedLabel = input.maskedLabel?.trim();

  if (!displayName || displayName === email || displayName === maskedLabel) {
    return email;
  }

  return `${displayName} (${email})`;
}

export function counterpartyAliases(input: {
  email: string;
  maskedLabel: string;
  displayName?: string | null;
  userLabel?: string | null;
}) {
  const email = input.email.trim().toLowerCase();
  const localPart = email.split("@")[0] ?? email;
  const displayName = input.displayName?.trim();
  const userLabel =
    input.userLabel?.trim() ??
    buildCounterpartyUserLabel({
      email,
      displayName,
      maskedLabel: input.maskedLabel
    });

  return [...new Set([
    email,
    localPart,
    input.maskedLabel.trim().toLowerCase(),
    userLabel.toLowerCase(),
    ...(displayName ? [displayName.toLowerCase()] : []),
    ...(displayName
      ? displayName
          .toLowerCase()
          .split(/\s+/)
          .filter(Boolean)
      : [])
  ])];
}

export function createEmptyCounterpartyMemory(): CounterpartyMemory {
  return {
    turn: 0,
    mentionedCounterparties: [],
    entities: [],
    answerFrames: [],
    mode: "idle",
    pendingConfirmation: null,
    clarification: null
  };
}

function normalizeEntities(entities?: ConversationEntity[]) {
  return (entities ?? [])
    .filter((entity) => entity.id && entity.type)
    .slice(-MAX_CONTEXT_ENTITIES);
}

function normalizeAnswerFrames(answerFrames?: ConversationAnswerFrame[]) {
  return (answerFrames ?? [])
    .filter((frame) => frame.id && frame.intent)
    .slice(-MAX_ANSWER_FRAMES);
}

export function normalizeCounterpartyMemory(
  memory?:
    | (Partial<CounterpartyMemory> & { lastCounterparty?: CounterpartyRef | null })
    | null
): CounterpartyMemory {
  return {
    turn: memory?.turn ?? 0,
    lastCounterparty: memory?.lastCounterparty ?? undefined,
    mentionedCounterparties: (memory?.mentionedCounterparties ?? []).slice(
      0,
      MAX_COUNTERPARTIES
    ),
    entities: normalizeEntities(memory?.entities),
    answerFrames: normalizeAnswerFrames(memory?.answerFrames),
    pendingConfirmation: memory?.pendingConfirmation ?? null,
    clarification: memory?.clarification ?? null,
    mode: memory?.mode ?? "idle"
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
    userLabel: buildCounterpartyUserLabel({
      email: metadata.counterpartyEmail,
      displayName: metadata.displayName,
      maskedLabel: metadata.maskedLabel
    }),
    displayName: metadata.displayName ?? undefined,
    aliases: counterpartyAliases({
      email: metadata.counterpartyEmail,
      maskedLabel: metadata.maskedLabel ?? maskEmail(metadata.counterpartyEmail),
      displayName: metadata.displayName
    }),
    firstMentionedAtTurn: turn,
    lastReferencedAtTurn: turn
  };
}

function counterpartyRefsFromMetadata(
  metadata: ToolResultMetadata,
  turn: number
): CounterpartyRef[] {
  const refs: CounterpartyRef[] = [];
  const direct = counterpartyRefFromMetadata(metadata, turn);
  if (direct) {
    refs.push(direct);
  }

  for (const counterparty of metadata.counterparties ?? []) {
    refs.push({
      email: counterparty.counterpartyEmail.toLowerCase(),
      maskedLabel: counterparty.maskedLabel,
      userLabel: buildCounterpartyUserLabel({
        email: counterparty.counterpartyEmail,
        displayName: counterparty.displayName,
        maskedLabel: counterparty.maskedLabel
      }),
      displayName: counterparty.displayName,
      aliases: counterpartyAliases({
        email: counterparty.counterpartyEmail,
        maskedLabel: counterparty.maskedLabel,
        displayName: counterparty.displayName
      }),
      firstMentionedAtTurn: turn,
      lastReferencedAtTurn: turn
    });
  }

  return refs;
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
    userLabel:
      counterparty.userLabel ??
      existing?.userLabel ??
      buildCounterpartyUserLabel({
        email,
        displayName: counterparty.displayName,
        maskedLabel: counterparty.maskedLabel
      }),
    displayName: counterparty.displayName ?? existing?.displayName,
    aliases: [...new Set([
      ...(existing?.aliases ?? []),
      ...counterpartyAliases({
        email,
        maskedLabel: counterparty.maskedLabel,
        displayName: counterparty.displayName ?? existing?.displayName,
        userLabel: counterparty.userLabel ?? existing?.userLabel
      }),
      ...(counterparty.aliases ?? [])
    ])],
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
    mentionedCounterparties: nextMentioned,
    entities: memory.entities ?? [],
    answerFrames: memory.answerFrames ?? [],
    pendingConfirmation: memory.pendingConfirmation ?? null,
    clarification: memory.clarification ?? null,
    mode: memory.mode ?? "idle"
  };
}

export function rememberCounterpartiesFromMetadata(
  memory: CounterpartyMemory,
  metadatas: ToolResultMetadata[],
  turn: number
) {
  return metadatas.reduce((nextMemory, metadata) => {
    return counterpartyRefsFromMetadata(metadata, turn).reduce(
      (updatedMemory, counterparty) =>
        rememberCounterparty(updatedMemory, counterparty, turn),
      nextMemory
    );
  }, memory);
}

export function transactionEntitiesFromMetadata(
  metadata: ToolResultMetadata,
  turn: number
): ConversationEntity[] {
  return (metadata.transactions ?? []).map((transaction, index) => ({
    id: `transaction:${transaction.transactionId}`,
    type: "transaction",
    turnIntroduced: turn,
    turnLastReferenced: turn,
    source: "tool_result",
    confidence: "high",
    displayName: transaction.label,
    transactionId: transaction.transactionId,
    amount: transaction.amount,
    currency: transaction.currency,
    aliases: [
      transaction.label,
      `${index + 1}`,
      `${transaction.direction} ${Math.abs(transaction.amount).toFixed(2)}`
    ]
  }));
}

function getOrdinalFromMessage(message: string) {
  const normalized = message.toLowerCase();
  const ordinalMap: Array<[RegExp, number]> = [
    [/\b(first|1st)\b/, 1],
    [/\b(second|2nd)\b/, 2],
    [/\b(third|3rd)\b/, 3],
    [/\b(fourth|4th)\b/, 4],
    [/\b(fifth|5th)\b/, 5],
    [/(הראשון|ראשון)/, 1],
    [/(השני|שני)/, 2],
    [/(השלישי|שלישי)/, 3],
    [/(הרביעי|רביעי)/, 4],
    [/(החמישי|חמישי)/, 5]
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
      entry.email.toLowerCase().startsWith(normalized) ||
      entry.userLabel?.toLowerCase() === normalized ||
      entry.displayName?.toLowerCase() === normalized ||
      entry.aliases?.includes(normalized)
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
    /\b(he|him|she|her|they|them)\b/.test(normalized) ||
    /\b(him|her|them)\s+again\b/.test(normalized) ||
    /\bsame\s+(person|recipient|counterparty)\b/.test(normalized) ||
    /\b(the guy|the person from before|the last one)\b/.test(normalized) ||
    /\b(this|that)\s+(person|recipient|counterparty)\b/.test(normalized) ||
    /\b(with|to)\s+(them|that person|this person)\b/.test(normalized) ||
    /(לו|לה|אליו|אליה|איתו|איתה|אותו|אותה|אותו אחד|אותה אחת|האדם הזה|הבן אדם הזה|הנמען הזה|הנמען הקודם|האדם הקודם|האחרון)/.test(message)
  ) {
    return memory.lastCounterparty;
  }

  const ordinal = getOrdinalFromMessage(normalized);
  if (
    ordinal &&
    ((/\b(person|recipient|counterparty)\b/.test(normalized) &&
      /\b(talked|discussed|mentioned|we've|weve)\b/.test(normalized)) ||
      /(אדם|בן אדם|נמען|דיברנו|הזכרנו)/.test(message))
  ) {
    return resolveByOrdinal(memory, ordinal);
  }

  return undefined;
}
