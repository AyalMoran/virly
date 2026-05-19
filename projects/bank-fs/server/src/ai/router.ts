import {
  AssistantIntent,
  AssistantToolName
} from "./state.js";
import { getUnsafeRequestReason } from "./policy.js";

type IntentClassification = {
  intent: AssistantIntent;
  refusalReason?: string;
};

export function classifyAssistantIntent(message: string): IntentClassification {
  const refusalReason = getUnsafeRequestReason(message);
  if (refusalReason) {
    return { intent: "unsafe_request", refusalReason };
  }

  const normalized = message.toLowerCase();

  if (/\b(balance|available funds|how much.*have)\b/i.test(normalized)) {
    return { intent: "balance_inquiry" };
  }

  if (/\b(transaction|transactions|activity|history|recent|spent|received)\b/i.test(normalized)) {
    return { intent: "recent_transactions" };
  }

  if (/\b(recipient|recipients|people|contacts|verified)\b/i.test(normalized)) {
    return { intent: "verified_recipients" };
  }

  if (/\b(limit|limits|maximum|max|how much can)\b/i.test(normalized)) {
    return { intent: "transfer_limits" };
  }

  if (/\b(status|pending|completed|failed)\b/i.test(normalized)) {
    return { intent: "transfer_status" };
  }

  if (/\b(help|how do i|what can you do|support)\b/i.test(normalized)) {
    return { intent: "general_help" };
  }

  return { intent: "unsupported" };
}

export function getReadOnlyToolsForIntent(
  intent: AssistantIntent
): AssistantToolName[] {
  switch (intent) {
    case "balance_inquiry":
      return ["getUserAccounts", "getAccountBalance"];
    case "recent_transactions":
      return ["getRecentTransactions"];
    case "verified_recipients":
      return ["getVerifiedRecipients"];
    case "transfer_limits":
      return ["getTransferLimits"];
    default:
      return [];
  }
}

export function isReadOnlyToolName(toolName: string): toolName is AssistantToolName {
  return [
    "getUserAccounts",
    "getAccountBalance",
    "getRecentTransactions",
    "getVerifiedRecipients",
    "getTransferLimits"
  ].includes(toolName);
}
