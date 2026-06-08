export function formatMoneyILS(value: number, locale = "he-IL") {
  return new Intl.NumberFormat(locale || "he-IL", {
    style: "currency",
    currency: "ILS",
    currencyDisplay: "narrowSymbol",
    minimumFractionDigits: 2,
    maximumFractionDigits: 2
  }).format(value);
}

export function formatCurrency(value: number, locale = "en-US") {
  return formatMoneyILS(value, locale);
}

export function formatDate(value?: string, locale = "en-US") {
  if (!value) {
    return "Pending date";
  }

  return new Intl.DateTimeFormat(locale || "en-US", {
    month: "short",
    day: "numeric",
    year: "numeric",
    hour: "2-digit",
    minute: "2-digit"
  }).format(new Date(value));
}

export function formatRelativeDate(value?: string) {
  if (!value) {
    return "Pending";
  }

  const date = new Date(value);
  const diffInHours = Math.floor((Date.now() - date.getTime()) / (1000 * 60 * 60));

  if (diffInHours < 1) {
    return "Just now";
  }

  if (diffInHours < 24) {
    return `${diffInHours}h ago`;
  }

  if (diffInHours < 48) {
    return "Yesterday";
  }

  return new Intl.DateTimeFormat("en-US", {
    month: "short",
    day: "numeric"
  }).format(date);
}

export function getInitials(email: string) {
  const [name] = email.split("@");
  return name
    .split(/[._-]/)
    .filter(Boolean)
    .slice(0, 2)
    .map((part) => part[0])
    .join("")
    .padEnd(2, name[1] ?? "")
    .toUpperCase();
}
