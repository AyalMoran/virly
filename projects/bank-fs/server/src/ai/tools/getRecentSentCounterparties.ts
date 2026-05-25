import { Transaction } from "../../models/Transaction.js";
import { createToolResult } from "../toolResults.js";
import type { RuntimeToolResult, ToolContext } from "../state.js";
import {
  getCounterpartyDisplays,
  getDisplayOrFallback,
  getLimitFromMessage,
  normalizeCounterpartyEmail
} from "./counterpartyHelpers.js";

export async function getRecentSentCounterparties(
  context: ToolContext
): Promise<RuntimeToolResult> {
  const limit = getLimitFromMessage(context.message, 3, 10);
  const transactions = await Transaction.find({
    ownerId: context.userId,
    type: "debit"
  })
    .sort({ createdAt: -1 })
    .limit(100)
    .select("counterpartyEmail amount createdAt");

  const selected = [];
  const seen = new Set<string>();
  for (const transaction of transactions) {
    const email = normalizeCounterpartyEmail(transaction.counterpartyEmail);
    if (seen.has(email)) {
      continue;
    }

    seen.add(email);
    selected.push(transaction);
    if (selected.length >= limit) {
      break;
    }
  }

  if (selected.length === 0) {
    return createToolResult({
      toolName: "getRecentSentCounterparties",
      status: "empty",
      data: [],
      summary: "No recent sent counterparties were found for your account.",
      metadata: { recordCount: 0 }
    });
  }

  const displays = await getCounterpartyDisplays(
    selected.map((transaction) => transaction.counterpartyEmail)
  );
  const counterparties = selected.map((transaction) => {
    const display = getDisplayOrFallback(displays, transaction.counterpartyEmail);
    return {
      display,
      lastAmount: transaction.amount,
      lastSentAt: transaction.createdAt?.toISOString() ?? null
    };
  });

  return createToolResult({
    toolName: "getRecentSentCounterparties",
    status: "ok",
    data: counterparties.map(({ display, lastAmount, lastSentAt }) => ({
      counterpartyId: display.counterpartyId,
      emailFull: display.emailFull,
      emailMasked: display.emailMasked,
      llmLabel: display.llmLabel,
      userLabel: display.userLabel,
      displayName: display.displayName,
      amount: lastAmount,
      lastInteractionAt: lastSentAt
    })),
    summary: `Recent people you sent money to: ${counterparties
      .map(
        ({ display, lastAmount }) =>
          `${display.llmLabel} (${lastAmount.toFixed(2)} ILS last sent)`
      )
      .join("; ")}.`,
    userSummary: `Recent people you sent money to: ${counterparties
      .map(
        ({ display, lastAmount }) =>
          `${display.userLabel} (${lastAmount.toFixed(2)} ILS last sent)`
      )
      .join("; ")}.`,
    metadata: {
      recordCount: counterparties.length,
      counterparties: counterparties.map(({ display }) => ({
        counterpartyEmail: display.email,
        maskedLabel: display.emailMasked,
        displayName: display.displayName
      }))
    },
    memoryUpdates: {
      counterparties: counterparties.map(({ display, lastSentAt }) => ({
        counterpartyId: display.counterpartyId,
        emailFullForBackendOnly: display.email,
        emailMasked: display.emailMasked,
        displayName: display.displayName,
        firstName: display.firstName,
        lastName: display.lastName,
        relation: "sent_to" as const,
        source: "transaction" as const,
        lastInteractionAt: lastSentAt
      }))
    }
  });
}
