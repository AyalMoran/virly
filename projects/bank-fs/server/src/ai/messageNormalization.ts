import type {
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
      /\b(who|which person|which people)\b.*\b(sent|paid|transferred)\b.*\b(me|to me)\b/i.test(message) ||
      /(קיבלתי|נכנס|ממי|מי.*?(שלח|העביר).*?(לי|אליי|אלי))/.test(message)
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
