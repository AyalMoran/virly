import { getInitials } from "./format";
import type { Contact, Transaction } from "./types";

export type QuickContact = {
  email: string;
  avatar: string;
};

export type RecipientBookEntry = QuickContact & {
  contactId?: string;
  displayName?: string | null;
};

function initialsFrom(text: string): string {
  const trimmed = text.trim();
  // If it looks like an email (contains @), use the email initials helper.
  if (trimmed.includes("@")) {
    return getInitials(trimmed);
  }
  // Otherwise treat it as a display name: split on whitespace.
  const parts = trimmed.split(/\s+/).filter(Boolean);
  return parts
    .slice(0, 2)
    .map((p) => p[0])
    .join("")
    .toUpperCase()
    .padEnd(2, trimmed[1] ?? "");
}

export function mergeRecipientBook(
  saved: Contact[],
  recent: QuickContact[]
): { saved: RecipientBookEntry[]; recent: RecipientBookEntry[] } {
  const savedEmails = new Set(saved.map((c) => c.email.toLowerCase()));

  return {
    saved: saved.map((c) => ({
      email: c.email,
      avatar: initialsFrom(c.displayName?.trim() || c.email),
      contactId: c.id,
      displayName: c.displayName
    })),
    recent: recent.filter((c) => !savedEmails.has(c.email.toLowerCase()))
  };
}

export function getQuickContacts(transactions: Transaction[], limit = 5): QuickContact[] {
  const seen = new Set<string>();
  const contacts: QuickContact[] = [];

  for (const transaction of transactions) {
    if (seen.has(transaction.counterpartyEmail)) {
      continue;
    }

    seen.add(transaction.counterpartyEmail);
    contacts.push({
      email: transaction.counterpartyEmail,
      avatar: getInitials(transaction.counterpartyEmail)
    });

    if (contacts.length >= limit) {
      break;
    }
  }

  return contacts;
}
