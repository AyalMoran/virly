import { Transaction } from "../../models/Transaction.js";
import { createToolResult } from "../toolResults.js";
import type { RuntimeToolResult, ToolContext } from "../state.js";
import {
  getCounterpartyDisplays,
  getDisplayOrFallback,
  getLimitFromMessage,
  normalizeCounterpartyEmail
} from "./counterpartyHelpers.js";

export async function getRecentReceivedCounterparties(
  context: ToolContext
): Promise<RuntimeToolResult> {
  const limit = getLimitFromMessage(context.message, 1, 10);
  const transactions = await Transaction.find({
    ownerId: context.userId,
    type: "credit"
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
      toolName: "getRecentReceivedCounterparties",
      status: "empty",
      data: [],
      summary: "No recent received counterparties were found for your account.",
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
      lastAmount: transaction.amount
    };
  });

  return createToolResult({
    toolName: "getRecentReceivedCounterparties",
    status: "ok",
    data: counterparties.map(({ display, lastAmount }) => ({
      counterpartyId: display.counterpartyId,
      emailFull: display.emailFull,
      emailMasked: display.emailMasked,
      llmLabel: display.llmLabel,
      userLabel: display.userLabel,
      displayName: display.displayName,
      amount: lastAmount
    })),
    summary: `Recent people who sent you money: ${counterparties
      .map(
        ({ display, lastAmount }) =>
          `${display.llmLabel} (${lastAmount.toFixed(2)} ILS last received)`
      )
      .join("; ")}.`,
    userSummary: `Recent people who sent you money: ${counterparties
      .map(
        ({ display, lastAmount }) =>
          `${display.userLabel} (${lastAmount.toFixed(2)} ILS last received)`
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
      counterparties: counterparties.map(({ display }) => ({
        counterpartyId: display.counterpartyId,
        emailFullForBackendOnly: display.email,
        emailMasked: display.emailMasked,
        displayName: display.displayName,
        firstName: display.firstName,
        lastName: display.lastName,
        relation: "received_from" as const,
        source: "transaction" as const
      }))
    }
  });
}
