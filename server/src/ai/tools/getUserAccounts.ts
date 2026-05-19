import { User } from "../../models/User.js";
import {
  AssistantToolResult,
  ToolContext
} from "../state.js";

export async function getUserAccounts(
  context: ToolContext
): Promise<AssistantToolResult> {
  const user = await User.findById(context.userId).select("email isVerified");

  if (!user) {
    throw Object.assign(new Error("Authenticated account not found."), {
      status: 404
    });
  }

  return {
    toolName: "getUserAccounts",
    summary: "Virly account",
    metadata: {
      recordCount: 1,
      accountLabel: "Virly account"
    }
  };
}
