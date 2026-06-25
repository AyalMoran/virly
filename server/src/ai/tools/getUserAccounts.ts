import { getRepositories } from "../../repositories/index.js";
import { createToolResult } from "../toolResults.js";
import type { RuntimeToolResult, ToolContext } from "../state.js";

export async function getUserAccounts(
  context: ToolContext
): Promise<RuntimeToolResult> {
  const user = await getRepositories().users.findByIdSafe(context.userId);

  if (!user) {
    throw Object.assign(new Error("Authenticated account not found."), {
      status: 404
    });
  }

  return createToolResult({
    toolName: "getUserAccounts",
    status: "ok",
    data: {
      accountLabel: "Virly account"
    },
    summary: "Virly account",
    metadata: {
      recordCount: 1,
      accountLabel: "Virly account"
    }
  });
}
