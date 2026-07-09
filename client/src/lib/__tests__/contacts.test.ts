import { getQuickContacts, mergeRecipientBook } from "../contacts";
import type { Transaction } from "../types";
import type { Contact } from "../types";

function tx(counterpartyEmail: string): Transaction {
  return { counterpartyEmail } as Transaction;
}

describe("getQuickContacts", () => {
  test("derives email + initials avatar for each unique counterparty", () => {
    const contacts = getQuickContacts([tx("alice.smith@example.com")]);
    expect(contacts).toStrictEqual([
      { email: "alice.smith@example.com", avatar: "AS" }
    ]);
  });

  test("dedupes repeated counterparties, keeping first occurrence order", () => {
    const contacts = getQuickContacts([
      tx("a@example.com"),
      tx("b@example.com"),
      tx("a@example.com")
    ]);
    expect(contacts.map((c) => c.email)).toStrictEqual([
      "a@example.com",
      "b@example.com"
    ]);
  });

  test("respects the limit", () => {
    const many = ["a", "b", "c", "d", "e", "f"].map((n) => tx(`${n}@x.com`));
    expect(getQuickContacts(many, 3)).toHaveLength(3);
  });

  test("returns an empty list for no transactions", () => {
    expect(getQuickContacts([])).toStrictEqual([]);
  });
});

function contact(email: string, displayName: string | null = null): Contact {
  return { id: `id-${email}`, email, displayName, createdAt: "2026-07-01T00:00:00.000Z" };
}

describe("mergeRecipientBook", () => {
  test("keeps saved and recent as separate groups", () => {
    const book = mergeRecipientBook(
      [contact("dan@example.com", "Dan")],
      [{ email: "alice@example.com", avatar: "A" }]
    );
    expect(book.saved.map((c) => c.email)).toEqual(["dan@example.com"]);
    expect(book.recent.map((c) => c.email)).toEqual(["alice@example.com"]);
  });

  test("drops recents that are already saved (case-insensitive)", () => {
    const book = mergeRecipientBook(
      [contact("dan@example.com")],
      [
        { email: "Dan@Example.com", avatar: "D" },
        { email: "alice@example.com", avatar: "A" }
      ]
    );
    expect(book.recent.map((c) => c.email)).toEqual(["alice@example.com"]);
  });

  test("saved entries carry contactId, displayName, and an initials avatar", () => {
    const book = mergeRecipientBook([contact("dan@example.com", "Dan Levi")], []);
    expect(book.saved[0].contactId).toBe("id-dan@example.com");
    expect(book.saved[0].displayName).toBe("Dan Levi");
    expect(book.saved[0].avatar).toBe("DL");
  });
});
