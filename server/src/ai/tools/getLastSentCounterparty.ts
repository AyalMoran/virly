import { Transaction } from "../../models/Transaction.js";
import { createToolResult } from "../toolResults.js";
import type { RuntimeToolResult, ToolContext } from "../state.js";
import {
  getCounterpartyDisplays,
  getDisplayOrFallback
} from "./counterpartyHelpers.js";

export async function getLastSentCounterparty(
  context: ToolContext
): Promise<RuntimeToolResult> {
  const transaction = await Transaction.findOne({
    ownerId: context.userId,
    type: "debit"
  })
    .sort({ createdAt: -1 })
    .select("counterpartyEmail");

  if (!transaction) {
    return createToolResult({
      toolName: "getLastSentCounterparty",
      status: "empty",
      data: null,
      summary: "No sent transactions were found for your account.",
      metadata: {
        recordCount: 0
      }
    });
  }

  const displays = await getCounterpartyDisplays([transaction.counterpartyEmail]);
  const display = getDisplayOrFallback(displays, transaction.counterpartyEmail);

  return createToolResult({
    toolName: "getLastSentCounterparty",
    status: "ok",
    data: {
      email: transaction.counterpartyEmail,
      maskedLabel: display.emailMasked,
      userLabel: display.userLabel,
      displayName: display.displayName
    },
    summary: `The last person you sent money to was ${display.llmLabel}.`,
    userSummary: `The last person you sent money to was ${display.userLabel}.`,
    userSummaryHe: `האדם האחרון שאליו שלחת כסף הוא ${display.userLabel}.`,
    metadata: {
      recordCount: 1,
      counterpartyEmail: transaction.counterpartyEmail,
      maskedLabel: display.emailMasked,
      displayName: display.displayName
    },
    memoryUpdates: {
      counterparties: [
        {
          counterpartyId: transaction.counterpartyEmail.toLowerCase(),
          emailFullForBackendOnly: transaction.counterpartyEmail.toLowerCase(),
          emailMasked: display.emailMasked,
          displayName: display.displayName,
          firstName: display.firstName,
          lastName: display.lastName,
          relation: "sent_to",
          source: "transaction"
        }
      ]
    }
  });
}
