import {
  AssistantIntent,
  AssistantLlmProvider,
  AssistantToolName,
  ClassifyAssistantIntentInput,
  IntentClassification,
  assistantIntentValues,
  assistantToolNames
} from "./state.js";
import { getUnsafeRequestReason } from "./policy.js";

const validIntents = [...assistantIntentValues];

export const intentToReadOnlyTools: Record<
  AssistantIntent,
  AssistantToolName[]
> = {
  balance_inquiry: ["getUserAccounts", "getAccountBalance"],
  account_summary: ["getUserAccounts", "getAccountBalance"],
  recent_transactions: ["getRecentTransactions"],
  transaction_search: ["searchTransactions"],
  transaction_summary: ["getTransactionStats"],
  transaction_count: ["getTransactionStats"],
  transaction_detail: ["resolveTransactionReference", "getTransactionReceipt"],
  transaction_stats: ["getTransactionStats"],
  cashflow_summary: ["getCashflowSummary"],
  counterparty_lookup: ["resolveCounterpartyCandidates"],
  recent_sent_counterparties: ["getRecentSentCounterparties"],
  recent_received_counterparties: ["getRecentReceivedCounterparties"],
  counterparty_summary: [
    "resolveCounterpartyCandidates",
    "getCounterpartySummary"
  ],
  counterparty_activity_timeline: [
    "resolveCounterpartyCandidates",
    "getCounterpartyActivityTimeline"
  ],
  last_sent_counterparty: ["getLastSentCounterparty"],
  counterparty_transactions: ["getTransactionsWithCounterparty"],
  counterparty_total_sent: ["getTotalSentToCounterparty"],
  verified_recipients: ["getVerifiedRecipients"],
  recipient_profile: ["resolveCounterpartyCandidates"],
  transfer_prepare: [],
  transfer_modify_pending: [],
  transfer_cancel_pending: [],
  transfer_limits: ["getTransferLimits"],
  transfer_eligibility: ["getTransferEligibility"],
  transfer_quote: ["resolveCounterpartyCandidates", "getTransferQuote"],
  daily_transfer_usage: ["getDailyTransferUsage"],
  transfer_status: ["getRecentTransactions"],
  pending_ai_transfers: ["getPendingAiTransfers"],
  pending_confirmation_status: [],
  general_help: [],
  unsafe_request: [],
  unsupported: []
};

export function classifyAssistantIntentDeterministic(
  message: string,
  context?: Pick<ClassifyAssistantIntentInput, "counterpartyMemory">
): IntentClassification {
  const refusalReason = getUnsafeRequestReason(message);
  if (refusalReason) {
    return { intent: "unsafe_request", refusalReason };
  }

  const normalized = message.toLowerCase();
  const hasActivePending =
    context?.counterpartyMemory.pendingConfirmation?.status === "pending";

  if (
    /(^|\b)(yes|confirm|approve|send it|go ahead|do it)(\b|$)/i.test(normalized) ||
    /(?:^|\s)(כן|תאשר|יאללה|בצע)(?:\s|$|[.!?])/.test(message)
  ) {
    return { intent: "pending_confirmation_status" };
  }

  if (/\b(cancel|deny|stop)\b.*\b(transfer|payment|confirmation|it)\b/i.test(normalized) || /(בטל|תבטל|אל תשלח)/.test(message)) {
    return { intent: "transfer_cancel_pending" };
  }

  if (
    hasActivePending &&
    (/\b(actually|instead|no,|change|modify|update|make it|make that|set it|add reason)\b/i.test(normalized) ||
      /\b(send it|send that)\b.*\b(to|for)\b/i.test(normalized) ||
      /(בעצם|תשנה|שנה|עדכן|במקום|לא,|סיבה)/.test(message))
  ) {
    return { intent: "transfer_modify_pending" };
  }

  if (
    /\b(who|which people|which recipients)\b.*\b(sent|paid|transferred)\b.*\b(me|to me)\b/i.test(normalized) ||
    /\b(recent|latest|last)\b.*\b(people|recipients|counterparties)\b.*\b(sent|paid|transferred)\b.*\b(me|to me)\b/i.test(normalized) ||
    /(מי).*?(שלח|העביר).*?(לי|אליי|אלי).*?(לאחרונה|השבוע|החודש)?/.test(message)
  ) {
    return { intent: "recent_received_counterparties" };
  }

  if (
    /\b(last|recent|latest|most recent)\s+\d*\s*(people|recipients|counterparties|payees)\b.*\b(i\s+)?(sent|paid|transferred)\b/i.test(normalized) ||
    /\b(who|which people|which recipients)\b.*\b(i\s+)?(sent|paid|transferred)\b.*\b(recently|latest|last)\b/i.test(normalized) ||
    /(למי).*?(שלחתי|העברתי).*?(לאחרונה|אחרונים|אחרונות|האחרונים|האחרונות)/.test(message)
  ) {
    return { intent: "recent_sent_counterparties" };
  }

  if (
    /\b(history|summary|relationship|overview)\b.*\b(with|for|to|from)\b/i.test(normalized) ||
    /(היסטוריה|סיכום).*?(עם|ל|אל|מ)/.test(message) ||
    /(כמה).*?(שלחתי|העברתי).*?(וקיבלתי|קיבלתי).*?(מ|עם|ל|אל)/.test(message)
  ) {
    return { intent: "counterparty_summary" };
  }

  if (
    /\b(activity|timeline)\b.*\b(with|for|to|from)\b/i.test(normalized) ||
    /(פעילות|ציר זמן|העברות).*?(עם|מול)/.test(message)
  ) {
    return { intent: "counterparty_activity_timeline" };
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
    /\b(tell me more|more details|details|receipt|show|open)\b.*\b(the\s+)?(first|second|third|fourth|fifth|1st|2nd|3rd|4th|5th|one|transaction|transfer|payment)\b/i.test(normalized) ||
    /\b(first|second|third|fourth|fifth|1st|2nd|3rd|4th|5th)\s+(one|transaction|transfer|payment)\b/i.test(normalized) ||
    /(תראה|פרטים|קבלה|ספר).*?(הראשון|הראשונה|השני|השנייה|השלישי|השלישית|הרביעי|הרביעית|החמישי|החמישית|העסקה|ההעברה)/.test(message)
  ) {
    return { intent: "transaction_detail" };
  }

  if (
    /\b(how many|count)\b.*\b(transaction|transfer|payment)s?\b/i.test(normalized) ||
    /(כמה).*?(עסקאות|העברות|תשלומים)/.test(message)
  ) {
    return { intent: "transaction_count" };
  }

  if (
    /\b(stats|statistics|totals|summary|summarize|recap)\b.*\b(transaction|transfer|payment|activity)s?\b/i.test(normalized) ||
    /(סטטיסטיקה|סיכום|סה"כ|סך הכל).*?(עסקאות|העברות|תשלומים)/.test(message)
  ) {
    return { intent: "transaction_stats" };
  }

  if (
    /\b(show|find|search|list)\b.*\b(transaction|transactions|transfer|transfers|payment|payments)\b.*\b(over|above|under|below|less than|more than|last week|this week|last month|this month|today|yesterday|for|reason)\b/i.test(normalized) ||
    /\b(transaction|transactions|transfer|transfers|payment|payments)\b.*\b(over|above|under|below|less than|more than|last week|this week|last month|this month|today|yesterday)\b/i.test(normalized) ||
    /(תראה|מצא|חפש|הצג).*?(עסקאות|העברות|תשלומים).*?(מעל|מתחת|פחות|יותר|שבוע שעבר|השבוע|חודש שעבר|החודש|היום|אתמול|סיבה)/.test(message)
  ) {
    return { intent: "transaction_search" };
  }

  if (
    /\b(pending confirmations?|pending transfers?|transfers? waiting for confirmation|waiting confirmations?)\b/i.test(normalized) ||
    /(העברות ממתינות|אישורים ממתינים|העברות שמחכות לאישור|כרטיסי אישור)/.test(message)
  ) {
    return { intent: "pending_ai_transfers" };
  }

  if (
    /\b(how much|what amount)\b.*\b(daily limit|left|remaining)\b.*\b(send|transfer)\b/i.test(normalized) ||
    /\bhow much can i\b.*\b(still\s+)?(send|transfer)\b.*\btoday\b/i.test(normalized) ||
    /\b(daily limit|daily transfer usage|used today|remaining today)\b/i.test(normalized) ||
    /(כמה).*?(נשאר|נותר|השתמשתי).*?(לשלוח|להעביר|היום|יומי)/.test(message)
  ) {
    return { intent: "daily_transfer_usage" };
  }

  if (
    /\b(quote|preview|what would happen|what happens)\b.*\b(send|transfer|pay)\b/i.test(normalized) ||
    /\b(send|transfer|pay)\b.*\b(quote|preview)\b/i.test(normalized) ||
    /(תן.*?(ציטוט|תצוגה מקדימה)|מה יקרה אם).*?(אשלח|אעביר|נעביר)/.test(message)
  ) {
    return { intent: "transfer_quote" };
  }

  if (
    /\b(can i|am i able to|eligible to)\b.*\b(send|transfer|pay)\b/i.test(normalized) ||
    /\b(how much can i|what can i)\b.*\b(send|transfer)\b/i.test(normalized) ||
    /(אפשר|יכול|יכולה).*?(לשלוח|להעביר).*?\d/.test(message) ||
    /(כמה).*?(אפשר|יכול|יכולה).*?(לשלוח|להעביר)/.test(message)
  ) {
    return { intent: "transfer_eligibility" };
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

  const deterministicClassification = classifyAssistantIntentDeterministic(
    message,
    context
  );
  if (
    deterministicClassification.intent === "transfer_modify_pending" ||
    deterministicClassification.intent === "transfer_cancel_pending" ||
    deterministicClassification.intent === "pending_confirmation_status"
  ) {
    return deterministicClassification;
  }

  if (!llmProvider) {
    return deterministicClassification;
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
    return deterministicClassification;
  }
}

export function getReadOnlyToolsForIntent(
  intent: AssistantIntent
): AssistantToolName[] {
  return intentToReadOnlyTools[intent] ?? [];
}

export function isReadOnlyToolName(toolName: string): toolName is AssistantToolName {
  return assistantToolNames.includes(toolName as AssistantToolName);
}
