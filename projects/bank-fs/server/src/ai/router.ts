import {
  AssistantIntent,
  AssistantLlmProvider,
  AssistantToolName,
  ClassifyAssistantIntentInput,
  IntentClassification
} from "./state.js";
import { getUnsafeRequestReason } from "./policy.js";

const validIntents: AssistantIntent[] = [
  "balance_inquiry",
  "account_summary",
  "recent_transactions",
  "transaction_search",
  "transaction_summary",
  "transaction_count",
  "transaction_detail",
  "counterparty_lookup",
  "last_sent_counterparty",
  "counterparty_transactions",
  "counterparty_total_sent",
  "transfer_prepare",
  "transfer_modify_pending",
  "transfer_cancel_pending",
  "pending_confirmation_status",
  "verified_recipients",
  "transfer_limits",
  "transfer_status",
  "general_help",
  "unsafe_request",
  "unsupported"
];

export function classifyAssistantIntentDeterministic(
  message: string
): IntentClassification {
  const refusalReason = getUnsafeRequestReason(message);
  if (refusalReason) {
    return { intent: "unsafe_request", refusalReason };
  }

  const normalized = message.toLowerCase();

  if (/(^|\b)(yes|confirm|approve|send it|go ahead|do it)(\b|$)/i.test(normalized) || /(כן|תאשר|יאללה|שלח|בצע)/.test(message)) {
    return { intent: "pending_confirmation_status" };
  }

  if (/\b(cancel|deny|stop)\b.*\b(transfer|payment|confirmation|it)\b/i.test(normalized) || /(בטל|תבטל|אל תשלח)/.test(message)) {
    return { intent: "transfer_cancel_pending" };
  }

  if (/\b(change|modify|update|make it)\b.*\b(transfer|payment|amount|recipient|reason|it)\b/i.test(normalized) || /(תשנה|שנה|עדכן|במקום)/.test(message)) {
    return { intent: "transfer_modify_pending" };
  }

  if (
    /\b(last|most recent)\b.*\b(person|recipient|counterparty|who)\b.*\b(sent|paid|transferred)\b/i.test(normalized) ||
    /\b(who|person|recipient|counterparty)\b.*\b(last|most recent)\b.*\b(sent|paid|transferred)\b/i.test(normalized) ||
    /(למי).*?(העברתי|שלחתי).*?(אחרונה|האחרון|פעם אחרונה)/.test(message) ||
    /(מי).*?(הנמען האחרון|האחרון).*?(שלחתי|העברתי)/.test(message)
  ) {
    return { intent: "last_sent_counterparty" };
  }

  if (
    /\b(total|ever|altogether|in total|sum)\b.*\b(send|sent|paid|transferred)\b.*\b(this|that|person|recipient|counterparty|them)\b/i.test(normalized) ||
    /\bhow much\b.*\b(send|sent|paid|transferred)\b.*\b(this|that|person|recipient|counterparty|them)\b/i.test(normalized) ||
    /(כמה).*?(שלחתי|העברתי).*?(לו|לה|אליו|אליה|לנמען|לאדם)/.test(message)
  ) {
    return { intent: "counterparty_total_sent" };
  }

  if (
    /\b(transaction|transactions|activity|history|recent|last\s+\d+)\b.*\b(with|to|from)\b.*\b(this|that|person|recipient|counterparty|them)\b/i.test(normalized) ||
    /(עסקאות|העברות).*?(עם|ל|אל).*?(לו|לה|אליו|אליה|הנמען|האדם)/.test(message)
  ) {
    return { intent: "counterparty_transactions" };
  }

  if (
    /\b(send|transfer|pay|move|wire|return|give)\b.*\b(\$|usd|dollar|dollars|nis|shekel|shekels|money|[0-9])/i.test(normalized) ||
    /\b(send|transfer|pay|move|wire|return|give)\b.*\b(to|for)\b/i.test(normalized) ||
    /(תעביר|תשלח|שלח|תחזיר|תן).*?(\d+|כסף|שקל|שח|ש״ח|דולר|אירו|לו|לה|אליו|אליה)/.test(message)
  ) {
    return { intent: "transfer_prepare" };
  }

  if (/\b(balance|available funds|how much.*have)\b/i.test(normalized) || /(יתרה|כמה.*יש לי)/.test(message)) {
    return { intent: "balance_inquiry" };
  }

  if (/\b(how many|count)\b.*\b(transaction|transfer|payment)s?\b/i.test(normalized)) {
    return { intent: "transaction_count" };
  }

  if (/\b(summary|summarize|recap)\b.*\b(transaction|transfer|payment|activity)s?\b/i.test(normalized)) {
    return { intent: "transaction_summary" };
  }

  if (/\b(transaction|transactions|activity|history|recent|spent|received)\b/i.test(normalized) || /(עסקאות|העברות|פעילות|היסטוריה|קיבלתי|שלחתי)/.test(message)) {
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

function normalizeClassification(
  classification: IntentClassification
): IntentClassification {
  if (!validIntents.includes(classification.intent)) {
    return { intent: "unsupported" };
  }

  if (classification.intent === "unsafe_request" && !classification.refusalReason) {
    return {
      intent: "unsafe_request",
      refusalReason: "write_action_not_supported"
    };
  }

  return classification;
}

export async function classifyAssistantIntent(
  message: string,
  llmProvider?: AssistantLlmProvider,
  context?: Pick<ClassifyAssistantIntentInput, "messages" | "counterpartyMemory">
): Promise<IntentClassification> {
  const refusalReason = getUnsafeRequestReason(message);
  if (refusalReason) {
    return { intent: "unsafe_request", refusalReason };
  }

  if (!llmProvider) {
    return classifyAssistantIntentDeterministic(message);
  }

  try {
    return normalizeClassification(
      await llmProvider.classifyIntent({
        userMessage: message,
        messages: context?.messages ?? [{ role: "user", content: message }],
        counterpartyMemory:
          context?.counterpartyMemory ?? {
            turn: 0,
            mentionedCounterparties: []
          }
      })
    );
  } catch (error) {
    console.warn(
      "AI intent classifier failed; using deterministic fallback.",
      error instanceof Error ? error.message : error
    );
    return classifyAssistantIntentDeterministic(message);
  }
}

export function getReadOnlyToolsForIntent(
  intent: AssistantIntent
): AssistantToolName[] {
  switch (intent) {
    case "balance_inquiry":
    case "account_summary":
      return ["getUserAccounts", "getAccountBalance"];
    case "recent_transactions":
    case "transaction_search":
    case "transaction_summary":
    case "transaction_count":
    case "transaction_detail":
      return ["getRecentTransactions"];
    case "last_sent_counterparty":
      return ["getLastSentCounterparty"];
    case "counterparty_transactions":
      return ["getTransactionsWithCounterparty"];
    case "counterparty_total_sent":
      return ["getTotalSentToCounterparty"];
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
    "getLastSentCounterparty",
    "getTransactionsWithCounterparty",
    "getTotalSentToCounterparty",
    "getVerifiedRecipients",
    "getTransferLimits"
  ].includes(toolName);
}
