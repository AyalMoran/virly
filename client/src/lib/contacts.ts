import { getInitials } from "./format";
import type { Transaction } from "./types";

export type QuickContact = {
  email: string;
  avatar: string;
};

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
