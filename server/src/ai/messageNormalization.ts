import type {
  AiUserRequest,
  AssistantIntent,
  CurrencySlotValue,
  NormalizedUserMessage,
  RequestSlots
} from "./state.js";

const hebrewRange = /[\u0590-\u05ff]/;
const latinRange = /[a-z]/i;

function detectLanguages(message: string): NormalizedUserMessage["detectedLanguages"] {
  const containsHebrew = hebrewRange.test(message);
  const containsEnglish = latinRange.test(message);

  if (containsHebrew && containsEnglish) {
    return ["mixed"];
  }

  if (containsHebrew) {
    return ["he"];
  }

  if (containsEnglish) {
    return ["en"];
  }

  return ["unknown"];
}

function detectDirection(message: string): NormalizedUserMessage["direction"] {
  const containsHebrew = hebrewRange.test(message);
  const containsEnglish = latinRange.test(message);

  if (containsHebrew && containsEnglish) {
    return "mixed";
  }

  return containsHebrew ? "rtl" : "ltr";
}

export function normalizeUserMessage(message: string): NormalizedUserMessage {
  const normalizedText = message.trim().replace(/\s+/g, " ");
  return {
    originalText: message,
    detectedLanguages: detectLanguages(message),
    normalizedText,
    direction: detectDirection(message),
    containsHebrew: hebrewRange.test(message),
    containsCurrencySymbol: /[$€₪]/.test(message),
    containsDateExpression:
      /\b(today|yesterday|friday|saturday|sunday|monday|tuesday|wednesday|thursday|week|month|year)\b/i.test(
        message
      ) || /(היום|אתמול|שישי|שבת|ראשון|שני|שלישי|רביעי|חמישי|שבוע|חודש|שנה)/.test(message)
  };
}

function inferCurrency(rawMessage: string): {
  currency: CurrencySlotValue | null;
  currencyMentioned: boolean;
  currencySupported: boolean;
} {
  const message = rawMessage.toLowerCase();

  if (/(\$|usd|dollar|dollars|דולר)/i.test(message)) {
    return {
      currency: "USD",
      currencyMentioned: true,
      currencySupported: false
    };
  }

  if (/(€|eur|euro|euros|אירו|יורו)/i.test(message)) {
    return {
      currency: "EUR",
      currencyMentioned: true,
      currencySupported: false
    };
  }

  if (/(₪|ils|nis|shekel|shekels|שקל|שח|שקלים|ש״ח|ש"ח)/i.test(message)) {
    return {
      currency: "ILS",
      currencyMentioned: true,
      currencySupported: true
    };
  }

  return {
    currency: null,
    currencyMentioned: false,
    currencySupported: true
  };
}

function extractAmount(message: string) {
  const amountMatch = message.match(
    /(?:[$€₪]|usd|eur|nis|ils|shekels?|dollars?|euros?|שקל|שח|ש״ח|ש"ח)?\s*(\d+(?:\.\d{1,2})?)|(\d+(?:\.\d{1,2})?)\s*(?:[$€₪]|usd|eur|nis|ils|shekels?|dollars?|euros?|שקל|שח|ש״ח|ש"ח)/i
  );
  const rawText = amountMatch?.[0]?.trim() ?? null;
  const value = Number(amountMatch?.[1] ?? amountMatch?.[2]);

  return {
    rawText,
    value: Number.isFinite(value) && value > 0 ? value : null
  };
}

function extractCounterparty(message: string) {
  const explicitEmail = message.match(/[A-Z0-9._%+-]+@[A-Z0-9.-]+\.[A-Z]{2,}/i)?.[0]
    ?.toLowerCase();
  const referenceText = message.match(
    /\b(him|her|them|this person|that person|this recipient|that recipient)\b/i
  )?.[0] ?? message.match(/(לו|לה|אליו|אליה|אותו|אותה|הנמען הזה|האדם הזה)/)?.[0];

  return {
    explicitEmail: explicitEmail ?? null,
    referenceText: explicitEmail ? null : referenceText ?? null,
    explicitName: null
  };
}

function getRequestOperation(intent: AssistantIntent): AiUserRequest["operation"] {
  if (intent === "unsafe_request") {
    return "unsafe";
  }

  if (intent === "transfer_prepare") {
    return "prepare_transfer";
  }

  if (
    intent === "transfer_modify_pending" ||
    intent === "transfer_cancel_pending"
  ) {
    return "modify_pending_transfer";
  }

  if (intent === "general_help" || intent === "unsupported") {
    return "help";
  }

  return "read";
}

function getRequestLanguage(
  normalizedMessage: NormalizedUserMessage
): AiUserRequest["language"] {
  return normalizedMessage.detectedLanguages[0] ?? "unknown";
}

function buildCounterpartyRef(
  normalizedMessage: NormalizedUserMessage,
  slots: RequestSlots
): AiUserRequest["counterpartyRef"] {
  const explicitEmail = slots.counterparty?.explicitEmail;
  if (explicitEmail) {
    return {
      rawText: explicitEmail,
      kind: "explicit_email",
      email: explicitEmail
    };
  }

  if (slots.ordinalReference) {
    return {
      rawText: slots.ordinalReference.rawText,
      kind: "ordinal",
      ordinal: slots.ordinalReference.ordinal
    };
  }

  const referenceText =
    slots.counterparty?.referenceText ??
    normalizedMessage.normalizedText.match(
      /\b(he|him|she|her|they|them|this person|that person|same person|same recipient|last recipient)\b/i
    )?.[0] ??
    normalizedMessage.normalizedText.match(
      /(לו|לה|אליו|אליה|איתו|איתה|אותו אחד|אותה אחת|הנמען הקודם|האדם הקודם)/
    )?.[0];

  if (referenceText) {
    return {
      rawText: referenceText,
      kind: "pronoun",
      query: referenceText
    };
  }

  const explicitName = slots.counterparty?.explicitName;
  if (explicitName) {
    return {
      rawText: explicitName,
      kind: "name",
      query: explicitName
    };
  }

  if (slots.pendingTransferReference) {
    return {
      rawText: slots.pendingTransferReference.rawText,
      kind: "current_pending_recipient"
    };
  }

  return undefined;
}

function classifyAmountReferenceKind(
  message: string
): NonNullable<AiUserRequest["amountRef"]>["kind"] | null {
  if (
    /\b(same amount\s+(?:he|she|they)\s+sent\s+me|what\s+(?:he|she|they)\s+sent\s+me)\b/i.test(
      message
    ) ||
    /(מה שהוא שלח לי|מה שהיא שלחה לי|מה שהם שלחו לי)/.test(message)
  ) {
    return "same_as_last_received_from_counterparty";
  }

  if (
    /\b(same amount\s+i\s+sent\s+(?:him|her|them)|what\s+i\s+sent\s+(?:him|her|them))\b/i.test(
      message
    ) ||
    /(מה ששלחתי לו|מה ששלחתי לה|מה ששלחתי להם)/.test(message)
  ) {
    return "same_as_last_sent_to_counterparty";
  }

  if (
    /\b(that amount|this amount|that total|previous answer|answer total)\b/i.test(
      message
    ) ||
    /(הסכום הזה|הסכום ההוא|הסה"כ|הסך|הנטו)/.test(message)
  ) {
    return "same_as_previous_answer_total";
  }

  if (
    /\b(same amount(?:\s+again)?|same as before|same as last time)\b/i.test(
      message
    ) ||
    /(אותה כמות|אותו סכום|כמו קודם|כמו פעם שעברה)/.test(message)
  ) {
    return "same_as_last_transfer";
  }

  return null;
}

function buildAmountRef(
  normalizedMessage: NormalizedUserMessage,
  slots: RequestSlots
): AiUserRequest["amountRef"] {
  const amount = slots.amount;
  if (amount?.value) {
    return {
      rawText: amount.rawText ?? String(amount.value),
      kind: "literal",
      value: amount.value,
      currency: amount.currency ?? null
    };
  }

  const referenceKind = classifyAmountReferenceKind(
    normalizedMessage.normalizedText
  );
  if (referenceKind) {
    return {
      rawText: normalizedMessage.normalizedText,
      kind: referenceKind,
      value: null,
      currency: amount?.currency ?? null
    };
  }

  return undefined;
}

function buildDateRangeRef(
  normalizedMessage: NormalizedUserMessage,
  slots: RequestSlots
): AiUserRequest["dateRangeRef"] {
  const rawText = slots.dateRange?.rawText ?? normalizedMessage.normalizedText;
  const message = normalizedMessage.normalizedText.toLowerCase();
  const kind =
    /\btoday\b/i.test(message) || /היום/.test(normalizedMessage.normalizedText)
      ? "today"
      : /\byesterday\b/i.test(message) || /אתמול/.test(normalizedMessage.normalizedText)
        ? "yesterday"
        : /\blast\s+week\b/i.test(message) || /שבוע שעבר/.test(normalizedMessage.normalizedText)
          ? "last_week"
          : /\bthis\s+week\b/i.test(message) || /השבוע/.test(normalizedMessage.normalizedText)
            ? "this_week"
            : /\blast\s+month\b/i.test(message) || /חודש שעבר/.test(normalizedMessage.normalizedText)
              ? "last_month"
              : /\bthis\s+month\b/i.test(message) || /החודש/.test(normalizedMessage.normalizedText)
                ? "this_month"
                : normalizedMessage.containsDateExpression || slots.dateRange
                  ? "relative"
                  : null;

  return kind
    ? {
        rawText,
        kind,
        resolvedFrom: slots.dateRange?.resolvedFrom ?? null,
        resolvedTo: slots.dateRange?.resolvedTo ?? null
      }
    : undefined;
}

export function buildAiUserRequest(
  normalizedMessage: NormalizedUserMessage,
  slots: RequestSlots
): AiUserRequest {
  return {
    intent: slots.intent,
    language: getRequestLanguage(normalizedMessage),
    operation: getRequestOperation(slots.intent),
    counterpartyRef: buildCounterpartyRef(normalizedMessage, slots),
    amountRef: buildAmountRef(normalizedMessage, slots),
    dateRangeRef: buildDateRangeRef(normalizedMessage, slots),
    direction: slots.transactionDirection ?? null,
    reason: null
  };
}

function extractOrdinalReference(message: string) {
  const normalized = message.toLowerCase();
  const ordinalMap: Array<[RegExp, number]> = [
    [/\b(first|1st)\b/, 1],
    [/\b(second|2nd)\b/, 2],
    [/\b(third|3rd)\b/, 3],
    [/\b(fourth|4th)\b/, 4],
    [/\b(fifth|5th)\b/, 5],
    [/(הראשון|ראשון|הראשונה|ראשונה)/, 1],
    [/(השני|שני|השנייה|שנייה)/, 2],
    [/(השלישי|שלישי|השלישית|שלישית)/, 3],
    [/(הרביעי|רביעי|הרביעית|רביעית)/, 4],
    [/(החמישי|חמישי|החמישית|חמישית)/, 5]
  ];
  const match = ordinalMap.find(([pattern]) => pattern.test(normalized));

  return match
    ? {
        rawText: message,
        ordinal: match[1]
      }
    : null;
}

export function extractRequestSlots(
  message: string,
  intent: AssistantIntent
): RequestSlots {
  const amount = extractAmount(message);
  const currency = inferCurrency(message);

  return {
    intent,
    counterparty: extractCounterparty(message),
    amount: {
      rawText: amount.rawText,
      value: amount.value,
      ...currency
    },
    transactionDirection:
      /\b(received|deposit|incoming)\b/i.test(message) ||
      /\bhow\s+much\b.*\b(he|she|they|him|her|them)\b.*\b(send|sent|paid|transferred)\b.*\b(me|to me)\b/i.test(message) ||
      /\b(who|which person|which people)\b.*\b(send|sent|paid|transferred)\b.*\b(me|to me)\b/i.test(message) ||
      /(קיבלתי|נכנס|ממי|מי.*?(שלח|העביר).*?(לי|אליי|אלי)|כמה.*?(הוא|היא|הם|ממנו|ממנה|מהם).*?(שלח|שלחה|שלחו|העביר|העבירה|העבירו).*?(לי|אליי|אלי))/.test(message)
        ? "received"
        : /\b(sent|paid|transferred|to)\b/i.test(message) || /(שלחתי|העברתי|למי|אל)/.test(message)
          ? "sent"
          : null,
    ordinalReference: extractOrdinalReference(message),
    pendingTransferReference:
      /\b(that|this|current|pending|card|confirmation)\b/i.test(message) ||
      /(זה|זאת|הנוכחי|ממתין|כרטיס|אישור)/.test(message)
        ? { rawText: message, kind: "current_card" }
        : null
  };
}
