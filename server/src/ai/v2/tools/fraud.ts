/**
 * `assessTransactionRisk` — the v2 fraud-risk tool (RAG_PLAN.md M4 phase 3).
 *
 * Lets the assistant check how risky a prospective transfer looks (rules +
 * unsupervised anomaly on the user's own history) so it can warn before the user
 * confirms. Read-only, scoped to the authenticated user from config; it does not
 * move money or flag anything (the transfer flow records flags post-commit).
 */
import { tool } from "@langchain/core/tools";
import type { LangGraphRunnableConfig } from "@langchain/langgraph";
import { z } from "zod";

import { scoreTransfer } from "../../../fraud/service.js";
import { getConfigurable } from "../toolContext.js";
import { statusWriter } from "../streamEvents.js";

export const assessTransactionRiskTool = tool(
  async (args, config: LangGraphRunnableConfig) => {
    const cfg = getConfigurable(config);
    statusWriter(config)?.({ kind: "status", label: "Checking transfer risk" });
    try {
      const result = await scoreTransfer({
        userId: cfg.userId,
        recipientEmail: args.recipientEmail,
        amount: args.amount,
        alreadyExecuted: false
      });
      if (result.level === "low") {
        return `Risk: low (score ${result.score}). Nothing unusual about this transfer.`;
      }
      return `Risk: ${result.level} (score ${result.score}). ${result.reasons.join(" ")} Mention this to the user before they confirm.`;
    } catch (error) {
      console.error("[assessTransactionRisk] failed:", error instanceof Error ? error.message : error);
      return "The risk check is temporarily unavailable.";
    }
  },
  {
    name: "assessTransactionRisk",
    description:
      "Assess how risky a prospective transfer looks (new recipient, unusually high amount, " +
      "near/over the daily limit, odd hour, or a pattern unlike the user's normal transfers). " +
      "Call this before/while preparing a transfer, or when the user asks if a transfer is safe. " +
      "Returns a risk level + reasons; surface elevated risk to the user before they confirm.",
    schema: z.object({
      recipientEmail: z.string().describe("The recipient's email (from context or findCounterparty)."),
      amount: z.number().positive().describe("The transfer amount in ILS.")
    })
  }
);

export const fraudTools = [assessTransactionRiskTool];
