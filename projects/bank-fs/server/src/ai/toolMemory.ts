import type {
  AiToolMemoryUpdate,
  ConversationEntity,
  CounterpartyMemory
} from "./state.js";
import {
  buildCounterpartyUserLabel,
  counterpartyAliases,
  rememberCounterparty
} from "./counterpartyMemory.js";

const MAX_CONTEXT_ENTITIES = 20;

function pushEntity(
  entities: ConversationEntity[],
  entity: ConversationEntity
): ConversationEntity[] {
  const next = [...entities.filter((existing) => existing.id !== entity.id), entity];
  return next.slice(-MAX_CONTEXT_ENTITIES);
}

export function applyToolMemoryUpdates(
  memory: CounterpartyMemory,
  updates: AiToolMemoryUpdate | undefined,
  turn: number
): CounterpartyMemory {
  if (!updates) {
    return memory;
  }

  let nextMemory: CounterpartyMemory = {
    ...memory,
    entities: [...(memory.entities ?? [])]
  };

  for (const counterparty of updates.counterparties ?? []) {
    nextMemory = rememberCounterparty(
      nextMemory,
      {
        email: counterparty.emailFullForBackendOnly,
        maskedLabel: counterparty.emailMasked,
        userLabel: buildCounterpartyUserLabel({
          email: counterparty.emailFullForBackendOnly,
          displayName: counterparty.displayName,
          maskedLabel: counterparty.emailMasked
        }),
        displayName: counterparty.displayName,
        aliases: counterpartyAliases({
          email: counterparty.emailFullForBackendOnly,
          maskedLabel: counterparty.emailMasked,
          displayName: counterparty.displayName
        }),
        firstMentionedAtTurn: turn,
        lastReferencedAtTurn: turn
      },
      turn
    );
    nextMemory.entities = pushEntity(nextMemory.entities ?? [], {
      id: `counterparty:${counterparty.counterpartyId}`,
      type: "counterparty",
      turnIntroduced: turn,
      turnLastReferenced: turn,
      source: "tool_result",
      confidence: "high",
      displayName: buildCounterpartyUserLabel({
        email: counterparty.emailFullForBackendOnly,
        displayName: counterparty.displayName,
        maskedLabel: counterparty.emailMasked
      }),
      email: counterparty.emailFullForBackendOnly,
      aliases: counterpartyAliases({
        email: counterparty.emailFullForBackendOnly,
        maskedLabel: counterparty.emailMasked,
        displayName: counterparty.displayName
      })
    });
  }

  for (const transaction of updates.transactions ?? []) {
    nextMemory.entities = pushEntity(nextMemory.entities ?? [], {
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
      aliases: [transaction.label]
    });
  }

  for (const pendingTransfer of updates.pendingTransfers ?? []) {
    nextMemory.entities = pushEntity(nextMemory.entities ?? [], {
      id: `pending_transfer:${pendingTransfer.pendingTransferId}`,
      type: "pending_transfer",
      turnIntroduced: turn,
      turnLastReferenced: turn,
      source: "tool_result",
      confidence: "high",
      displayName: pendingTransfer.label,
      pendingTransferId: pendingTransfer.pendingTransferId,
      amount: pendingTransfer.amount,
      currency: pendingTransfer.currency,
      expiresAt: pendingTransfer.expiresAt,
      aliases: [pendingTransfer.label, pendingTransfer.recipientLabel]
    });
  }

  for (const dateRange of updates.dateRanges ?? []) {
    nextMemory.entities = pushEntity(nextMemory.entities ?? [], {
      id: `date_range:${dateRange.from}:${dateRange.to}`,
      type: "date_range",
      turnIntroduced: turn,
      turnLastReferenced: turn,
      source: "tool_result",
      confidence: "high",
      displayName: dateRange.label,
      dateRange: {
        from: dateRange.from,
        to: dateRange.to,
        label: dateRange.label
      },
      aliases: [dateRange.label]
    });
  }

  return nextMemory;
}
