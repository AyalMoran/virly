import { createToolResult } from "../toolResults.js";
import type { RuntimeToolResult, ToolContext } from "../state.js";
import { getDailyTransferUsage as getUsage } from "./transferPreflightHelpers.js";

export async function getDailyTransferUsage(
  context: ToolContext
): Promise<RuntimeToolResult> {
  const usage = await getUsage(context.userId);

  return createToolResult({
    toolName: "getDailyTransferUsage",
    status: "ok",
    data: usage,
    summary:
      `Daily transfer usage: used ${usage.usedToday.toFixed(2)} ILS of ` +
      `${usage.dailyLimit.toFixed(2)} ILS today, with ${usage.remainingToday.toFixed(2)} ILS remaining ` +
      `across ${usage.transferCountToday} transfer${usage.transferCountToday === 1 ? "" : "s"}. ` +
      `The daily limit resets at ${usage.resetAt.toISOString()}.`,
    metadata: {
      recordCount: usage.transferCountToday,
      amount: usage.remainingToday
    }
  });
}
