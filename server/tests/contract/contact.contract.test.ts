import { describeContract } from "./harness.js";

const OWNER_A = "aaaaaaaaaaaaaaaaaaaaaaaa";
const OWNER_B = "bbbbbbbbbbbbbbbbbbbbbbbb";

describeContract("contacts", {
  "upsert creates a contact and normalizes the email to lowercase": async ({ repos }) => {
    const contact = await repos.contacts.upsertForOwner({
      ownerId: OWNER_A,
      email: "Dan@Example.com",
      displayName: "Dan"
    });
    expect(contact.ownerId).toBe(OWNER_A);
    expect(contact.email).toBe("dan@example.com");
    expect(contact.displayName).toBe("Dan");
    expect(contact.id).toMatch(/^[0-9a-f]{24}$/);
  },

  "upsert is idempotent per (owner, email)": async ({ repos }) => {
    const first = await repos.contacts.upsertForOwner({
      ownerId: OWNER_A,
      email: "dan@example.com",
      displayName: "Dan"
    });
    const second = await repos.contacts.upsertForOwner({
      ownerId: OWNER_A,
      email: "DAN@example.com"
    });
    expect(second.id).toBe(first.id);
    const list = await repos.contacts.listForOwner(OWNER_A);
    expect(list).toHaveLength(1);
  },

  "listForOwner returns only the owner's contacts, newest first": async ({ repos }) => {
    await repos.contacts.upsertForOwner({ ownerId: OWNER_A, email: "a@example.com" });
    await new Promise((r) => setTimeout(r, 5));
    await repos.contacts.upsertForOwner({ ownerId: OWNER_A, email: "b@example.com" });
    await repos.contacts.upsertForOwner({ ownerId: OWNER_B, email: "c@example.com" });

    const list = await repos.contacts.listForOwner(OWNER_A);
    expect(list.map((c) => c.email)).toEqual(["b@example.com", "a@example.com"]);
  },

  "deleteForOwner removes the contact and is owner-scoped": async ({ repos }) => {
    const contact = await repos.contacts.upsertForOwner({
      ownerId: OWNER_A,
      email: "a@example.com"
    });

    expect(await repos.contacts.deleteForOwner({ ownerId: OWNER_B, id: contact.id })).toBe(false);
    expect(await repos.contacts.listForOwner(OWNER_A)).toHaveLength(1);

    expect(await repos.contacts.deleteForOwner({ ownerId: OWNER_A, id: contact.id })).toBe(true);
    expect(await repos.contacts.listForOwner(OWNER_A)).toHaveLength(0);
  }
});
