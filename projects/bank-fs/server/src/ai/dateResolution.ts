const hebrewRange = /[\u0590-\u05ff]/;

function startOfDay(date: Date) {
  return new Date(date.getFullYear(), date.getMonth(), date.getDate());
}

function addDays(date: Date, days: number) {
  const next = new Date(date);
  next.setDate(next.getDate() + days);
  return next;
}

function startOfWeek(date: Date) {
  const start = startOfDay(date);
  const day = start.getDay();
  start.setDate(start.getDate() - day);
  return start;
}

function startOfMonth(date: Date) {
  return new Date(date.getFullYear(), date.getMonth(), 1);
}

export type DateExpressionResolution = {
  originalText: string;
  timezone: string;
  resolvedFrom: string;
  resolvedTo: string;
  granularity: "day" | "week" | "month" | "range";
  confidence: "medium" | "high";
  label: string;
};

export function resolveCommonDateRange(
  message: string,
  timezone = "Asia/Jerusalem",
  now = new Date()
): DateExpressionResolution | undefined {
  const normalized = message.toLowerCase();
  const today = startOfDay(now);

  if (/\b(yesterday)\b/i.test(normalized) || /אתמול/.test(message)) {
    const from = addDays(today, -1);
    return {
      originalText: message,
      timezone,
      resolvedFrom: from.toISOString(),
      resolvedTo: today.toISOString(),
      granularity: "day",
      confidence: "high",
      label: "yesterday"
    };
  }

  if (/\b(today)\b/i.test(normalized) || /היום/.test(message)) {
    return {
      originalText: message,
      timezone,
      resolvedFrom: today.toISOString(),
      resolvedTo: addDays(today, 1).toISOString(),
      granularity: "day",
      confidence: "high",
      label: "today"
    };
  }

  if (/\b(last week)\b/i.test(normalized) || /שבוע שעבר/.test(message)) {
    const thisWeek = startOfWeek(now);
    return {
      originalText: message,
      timezone,
      resolvedFrom: addDays(thisWeek, -7).toISOString(),
      resolvedTo: thisWeek.toISOString(),
      granularity: "week",
      confidence: "high",
      label: "last week"
    };
  }

  if (/\b(this week)\b/i.test(normalized) || /השבוע/.test(message)) {
    const thisWeek = startOfWeek(now);
    return {
      originalText: message,
      timezone,
      resolvedFrom: thisWeek.toISOString(),
      resolvedTo: addDays(thisWeek, 7).toISOString(),
      granularity: "week",
      confidence: "high",
      label: "this week"
    };
  }

  if (/\b(last month)\b/i.test(normalized) || /חודש שעבר/.test(message)) {
    const thisMonth = startOfMonth(now);
    const lastMonth = new Date(
      thisMonth.getFullYear(),
      thisMonth.getMonth() - 1,
      1
    );
    return {
      originalText: message,
      timezone,
      resolvedFrom: lastMonth.toISOString(),
      resolvedTo: thisMonth.toISOString(),
      granularity: "month",
      confidence: "high",
      label: "last month"
    };
  }

  if (/\b(this month)\b/i.test(normalized) || /החודש/.test(message)) {
    const thisMonth = startOfMonth(now);
    const nextMonth = new Date(
      thisMonth.getFullYear(),
      thisMonth.getMonth() + 1,
      1
    );
    return {
      originalText: message,
      timezone,
      resolvedFrom: thisMonth.toISOString(),
      resolvedTo: nextMonth.toISOString(),
      granularity: "month",
      confidence: "high",
      label: "this month"
    };
  }

  return undefined;
}

export function messageContainsHebrewDate(message: string) {
  return hebrewRange.test(message);
}
