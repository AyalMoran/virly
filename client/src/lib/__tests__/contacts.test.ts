import { getQuickContacts } from "../contacts";
import type { Transaction } from "../types";

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
