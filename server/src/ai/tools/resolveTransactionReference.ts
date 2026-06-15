import type {
  ConversationEntity,
  RuntimeToolResult,
  ToolContext
} from "../state.js";
import { createToolResult } from "../toolResults.js";
import {
  getExactAmountFromMessage,
  sortForTransactionMemory
} from "./transactionHelpers.js";

function getOrdinalFromMessage(context: ToolContext) {
  const fromSlot = context.requestSlots?.ordinalReference?.ordinal;
  if (fromSlot) {
    return fromSlot;
  }

  const normalized = context.message.toLowerCase();
  const ordinalMap: Array<[RegExp, number]> = [
    [/\b(first|1st)\b/, 1],
    [/\b(second|2nd)\b/, 2],
    [/\b(third|3rd)\b/, 3],
    [/\b(fourth|4th)\b/, 4],
    [/\b(fifth|5th)\b/, 5],
    [/(הראשון|ראשון|הראשונה|ראשונה)/, 1],
    [/(השני|שני|השנייה|שנייה)/, 2],
    [/(השלישי|שלישי|השלישית|שלישית)/, 3],
    [/(הרביעי|רביעי|הרביעית|רביעית)/, 4],
    [/(החמישי|חמישי|החמישית|חמישית)/, 5]
  ];

  return ordinalMap.find(([pattern]) => pattern.test(normalized))?.[1];
}

function getRecentTransactionEntities(context: ToolContext) {
  return (context.counterpartyMemory?.entities ?? [])
    .filter(
      (entity): entity is ConversationEntity & { transactionId: string } =>
        entity.type === "transaction" && Boolean(entity.transactionId)
    )
    .sort(sortForTransactionMemory);
}

function entityToCandidate(entity: ConversationEntity & { transactionId: string }) {
  return {
    transactionId: entity.transactionId,
    label: entity.displayName ?? `transaction ${entity.transactionId}`,
    amount: entity.amount ?? 0,
    currency: entity.currency ?? "ILS",
    direction:
      entity.aliases.find((alias) => alias.startsWith("received ")) !== undefined
        ? ("received" as const)
        : ("sent" as const),
    occurredAt: new Date(0).toISOString()
  };
}

function getClarificationCandidates(context: ToolContext) {
  if (context.clarification?.expectedReplyType !== "transaction") {
    return [];
  }

  return (context.clarification.options ?? []).map((option) => ({
    transactionId: option.id,
    label: option.label,
    amount: 0,
    currency: "ILS" as const,
    direction: "sent" as const,
    occurredAt: new Date(0).toISOString()
  }));
}

export async function resolveTransactionReference(
  context: ToolContext
): Promise<RuntimeToolResult> {
  const clarificationCandidates = getClarificationCandidates(context);
  const transactions = clarificationCandidates.length > 0
    ? clarificationCandidates
    : getRecentTransactionEntities(context).map(entityToCandidate);

  if (transactions.length === 0) {
    return createToolResult({
      toolName: "resolveTransactionReference",
      status: "empty",
      data: {
        kind: "transaction",
        status: "unresolved",
        candidates: []
      },
      summary: "I do not have a recent transaction list to resolve that reference from.",
      metadata: {
        recordCount: 0,
        transactionResolutionStatus: "unresolved"
      }
    });
  }

  const ordinal = getOrdinalFromMessage(context);
  if (ordinal) {
    const match = transactions[ordinal - 1];
    if (!match) {
      return createToolResult({
        toolName: "resolveTransactionReference",
        status: "empty",
        data: {
          kind: "transaction",
          status: "unresolved",
          candidates: transactions.slice(0, 5).map((candidate) => ({
            id: candidate.transactionId,
            label: candidate.label,
            value: candidate.transactionId
          }))
        },
        summary: `I could not find transaction number ${ordinal} in the latest transaction results.`,
        metadata: {
          recordCount: 0,
          transactionResolutionStatus: "unresolved"
        }
      });
    }

    return createToolResult({
      toolName: "resolveTransactionReference",
      status: "ok",
      data: {
        kind: "transaction",
        status: "resolved",
        transactionId: match.transactionId,
        candidates: [
          {
            id: match.transactionId,
            label: match.label,
            value: match.transactionId
          }
        ]
      },
      summary: `Resolved transaction reference to ${match.label}.`,
      metadata: {
        recordCount: 1,
        transactionId: match.transactionId,
        transactionResolutionStatus: "resolved",
        transactionCandidates: [match]
      }
    });
  }

  const exactAmount = getExactAmountFromMessage(context.message);
  if (exactAmount !== undefined) {
    const matches = transactions.filter(
      (transaction) => Math.abs((transaction.amount ?? 0) - exactAmount) < 0.01
    );

    if (matches.length === 1) {
      const candidate = matches[0];
      return createToolResult({
        toolName: "resolveTransactionReference",
        status: "ok",
        data: {
          kind: "transaction",
          status: "resolved",
          transactionId: candidate.transactionId,
          candidates: [
            {
              id: candidate.transactionId,
              label: candidate.label,
              value: candidate.transactionId
            }
          ]
        },
        summary: `Resolved transaction reference to ${candidate.label}.`,
        metadata: {
          recordCount: 1,
          transactionId: candidate.transactionId,
          transactionResolutionStatus: "resolved",
          transactionCandidates: [candidate]
        }
      });
    }

    if (matches.length > 1) {
      return createToolResult({
        toolName: "resolveTransactionReference",
        status: "ok",
        data: {
          kind: "transaction",
          status: "ambiguous",
          candidates: matches.slice(0, 5).map((candidate) => ({
            id: candidate.transactionId,
            label: candidate.label,
            value: candidate.transactionId
          }))
        },
        summary: "Multiple recent transactions matched that amount.",
        metadata: {
          recordCount: matches.length,
          transactionResolutionStatus: "ambiguous",
          transactionCandidates: matches.slice(0, 5)
        }
      });
    }
  }

  return createToolResult({
    toolName: "resolveTransactionReference",
    status: "empty",
    data: {
      kind: "transaction",
      status: "unresolved",
      candidates: transactions.slice(0, 5).map((candidate) => ({
        id: candidate.transactionId,
        label: candidate.label,
        value: candidate.transactionId
      }))
    },
    summary: "I could not tell which transaction you mean.",
    metadata: {
      recordCount: 0,
      transactionResolutionStatus: "unresolved"
    }
  });
}
