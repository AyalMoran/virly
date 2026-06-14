import { Transaction } from "../../models/Transaction.js";
import { createToolResult } from "../toolResults.js";
import type { RuntimeToolResult, ToolContext } from "../state.js";
import {
  getCounterpartyDisplays,
  getDisplayOrFallback,
  normalizeCounterpartyEmail
} from "./counterpartyHelpers.js";

export async function getCounterpartySummary(
  context: ToolContext
): Promise<RuntimeToolResult> {
  const counterparty = context.resolvedCounterparty;
  if (!counterparty) {
    return createToolResult({
      toolName: "getCounterpartySummary",
      status: "empty",
      data: null,
      summary: "I need a specific counterparty before I can summarize history.",
      metadata: { recordCount: 0 }
    });
  }

  const email = normalizeCounterpartyEmail(counterparty.email);
  const transactions = await Transaction.find({
    ownerId: context.userId,
    counterpartyEmail: email
  })
    .sort({ createdAt: -1 })
    .select("amount type createdAt");
  const displays = await getCounterpartyDisplays([email]);
  const display = getDisplayOrFallback(displays, email);

  if (transactions.length === 0) {
    return createToolResult({
      toolName: "getCounterpartySummary",
      status: "empty",
      data: null,
      summary: `No transactions were found with ${display.llmLabel}.`,
      userSummary: `No transactions were found with ${display.userLabel}.`,
      metadata: {
        recordCount: 0,
        counterpartyEmail: email,
        maskedLabel: display.emailMasked,
        displayName: display.displayName
      }
      ,
      memoryUpdates: {
        counterparties: [
          {
            counterpartyId: display.counterpartyId,
            emailFullForBackendOnly: display.email,
            emailMasked: display.emailMasked,
            displayName: display.displayName,
            firstName: display.firstName,
            lastName: display.lastName,
            relation: "both",
            source: "transaction"
          }
        ]
      }
    });
  }

  const totals = transactions.reduce(
    (summary, transaction) => {
      if (transaction.type === "debit") {
        summary.totalSent += transaction.amount;
        summary.sentCount += 1;
      } else {
        summary.totalReceived += transaction.amount;
        summary.receivedCount += 1;
      }

      return summary;
    },
    {
      totalSent: 0,
      totalReceived: 0,
      sentCount: 0,
      receivedCount: 0
    }
  );
  const lastTransaction = transactions[0];
  const lastDirection = lastTransaction?.type === "debit" ? "sent" : "received";
  const lastDirectionHe = lastTransaction?.type === "debit" ? "שלחת" : "קיבלת";
  const net = totals.totalReceived - totals.totalSent;

  return createToolResult({
    toolName: "getCounterpartySummary",
    status: "ok",
    data: {
      totalSent: totals.totalSent,
      totalReceived: totals.totalReceived,
      net
    },
    summary:
      `History with ${display.llmLabel}: sent ${totals.totalSent.toFixed(2)} ILS ` +
      `across ${totals.sentCount} transfer${totals.sentCount === 1 ? "" : "s"}, ` +
      `received ${totals.totalReceived.toFixed(2)} ILS across ` +
      `${totals.receivedCount} transfer${totals.receivedCount === 1 ? "" : "s"}, ` +
      `net ${net.toFixed(2)} ILS. Last interaction: ${lastDirection} ` +
      `${(lastTransaction?.amount ?? 0).toFixed(2)} ILS.`,
    userSummary:
      `History with ${display.userLabel}: sent ${totals.totalSent.toFixed(2)} ILS ` +
      `across ${totals.sentCount} transfer${totals.sentCount === 1 ? "" : "s"}, ` +
      `received ${totals.totalReceived.toFixed(2)} ILS across ` +
      `${totals.receivedCount} transfer${totals.receivedCount === 1 ? "" : "s"}, ` +
      `net ${net.toFixed(2)} ILS. Last interaction: ${lastDirection} ` +
      `${(lastTransaction?.amount ?? 0).toFixed(2)} ILS.`,
    userSummaryHe:
      `היסטוריה מול ${display.userLabel}: שלחת ${totals.totalSent.toFixed(2)} ₪ ` +
      `ב-${totals.sentCount} העברות, ` +
      `קיבלת ${totals.totalReceived.toFixed(2)} ₪ ב-${totals.receivedCount} העברות, ` +
      `נטו ${net.toFixed(2)} ₪. אינטראקציה אחרונה: ${lastDirectionHe} ` +
      `${(lastTransaction?.amount ?? 0).toFixed(2)} ₪.`,
    metadata: {
      recordCount: transactions.length,
      amount: net,
      counterpartyEmail: email,
      maskedLabel: display.emailMasked,
      displayName: display.displayName
    },
    memoryUpdates: {
      counterparties: [
        {
          counterpartyId: display.counterpartyId,
          emailFullForBackendOnly: display.email,
          emailMasked: display.emailMasked,
          displayName: display.displayName,
          firstName: display.firstName,
          lastName: display.lastName,
          relation: "both",
          source: "transaction"
        }
      ]
    }
  });
}
