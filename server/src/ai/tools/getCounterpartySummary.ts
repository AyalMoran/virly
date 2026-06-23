import { getRepositories } from "../../repositories/index.js";
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
  const transactionRepo = getRepositories().transactions;
  const [directionalTotals, recent] = await Promise.all([
    transactionRepo.getDirectionalTotals({ ownerId: context.userId, counterpartyEmail: email }),
    transactionRepo.recentWithCounterparty({ ownerId: context.userId, counterpartyEmail: email, limit: 1 })
  ]);
  const transactionCount =
    directionalTotals.creditCount + directionalTotals.debitCount;
  const displays = await getCounterpartyDisplays([email]);
  const display = getDisplayOrFallback(displays, email);

  if (transactionCount === 0) {
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

  const totals = {
    totalSent: directionalTotals.debitTotal,
    totalReceived: directionalTotals.creditTotal,
    sentCount: directionalTotals.debitCount,
    receivedCount: directionalTotals.creditCount
  };
  const lastTransaction = recent[0];
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
      recordCount: transactionCount,
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
