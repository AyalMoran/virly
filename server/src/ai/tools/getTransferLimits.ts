import { config } from "../../config.js";
import {
  AssistantToolResult,
  ToolContext
} from "../state.js";

export async function getTransferLimits(
  _context: ToolContext
): Promise<AssistantToolResult> {
  return {
    toolName: "getTransferLimits",
    summary: `Current development transfer limits are ${config.ai.perTransferLimit.toFixed(
      2
    )} per transfer and ${config.ai.dailyTransferLimit.toFixed(2)} per day. These are informational only; transfers must still use the secure app flow.`,
    metadata: {
      recordCount: 1
    }
  };
}
