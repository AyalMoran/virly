import { User } from "../../models/User.js";
import {
  AssistantToolResult,
  ToolContext
} from "../state.js";

export async function getAccountBalance(
  context: ToolContext
): Promise<AssistantToolResult> {
  const user = await User.findById(context.userId).select("balance");

  if (!user) {
    throw Object.assign(new Error("Authenticated account not found."), {
      status: 404
    });
  }

  return {
    toolName: "getAccountBalance",
    summary: `Your Bank FS account available balance is ${user.balance.toFixed(2)}.`,
    metadata: {
      recordCount: 1,
      accountLabel: "Bank FS account"
    }
  };
}
