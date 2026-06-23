import { getRepositories } from "../../repositories/index.js";
import { createToolResult } from "../toolResults.js";
import type { RuntimeToolResult, ToolContext } from "../state.js";

export async function getAccountBalance(
  context: ToolContext
): Promise<RuntimeToolResult> {
  const user = await getRepositories().users.findById(context.userId);

  if (!user) {
    throw Object.assign(new Error("Authenticated account not found."), {
      status: 404
    });
  }

  return createToolResult({
    toolName: "getAccountBalance",
    status: "ok",
    data: {
      balance: user.balance
    },
    summary: `Your Virly account available balance is ${user.balance.toFixed(2)}.`,
    metadata: {
      recordCount: 1,
      accountLabel: "Virly account",
      amount: user.balance
    }
  });
}
