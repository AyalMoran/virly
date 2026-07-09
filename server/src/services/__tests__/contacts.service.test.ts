import { AppError } from "../../utils/app-error.js";
import { contactsService } from "../contacts.service.js";
import { setRepositories } from "../../repositories/index.js";
import { createMongoRepositories } from "../../repositories/mongo/index.js";
import type { ContactRecord, Repositories } from "../../repositories/types.js";

const OWNER = "507f1f77bcf86cd799439011";
const OTHER_USER = {
  id: "507f1f77bcf86cd799439022",
  email: "dan@example.com",
  passwordHash: "x",
  phone: "+972",
  isVerified: true,
  personalDetails: null,
  balance: 0,
  role: "user",
  createdAt: new Date(0),
  updatedAt: new Date(0)
};

function contactRecord(over: Partial<ContactRecord> = {}): ContactRecord {
  return {
    id: "507f1f77bcf86cd799439033",
    ownerId: OWNER,
    email: "dan@example.com",
    displayName: null,
    createdAt: new Date(0),
    updatedAt: new Date(0),
    ...over
  };
}

function withStubs(stubs: {
  users?: Partial<Repositories["users"]>;
  contacts?: Partial<Repositories["contacts"]>;
}) {
  const base = createMongoRepositories();
  setRepositories({
    ...base,
    users: { ...base.users, ...stubs.users } as Repositories["users"],
    contacts: { ...base.contacts, ...stubs.contacts } as Repositories["contacts"]
  });
}

test("addContact normalizes the email and saves via upsert", async () => {
  const calls: unknown[] = [];
  withStubs({
    users: {
      findByEmail: async (email) => (email === "dan@example.com" ? (OTHER_USER as never) : null),
      findByIdSafe: async () => ({ ...OTHER_USER, id: OWNER, email: "me@example.com" }) as never
    },
    contacts: {
      upsertForOwner: async (input) => {
        calls.push(input);
        return contactRecord({ email: input.email });
      }
    }
  });

  const saved = await contactsService.addContact({ ownerId: OWNER, email: " Dan@Example.com " });
  expect(saved.email).toBe("dan@example.com");
  expect(calls).toEqual([{ ownerId: OWNER, email: "dan@example.com", displayName: null }]);
});

test("addContact rejects an email with no registered user (404)", async () => {
  withStubs({
    users: {
      findByEmail: async () => null,
      findByIdSafe: async () => ({ ...OTHER_USER, id: OWNER, email: "me@example.com" }) as never
    }
  });

  const err = await contactsService
    .addContact({ ownerId: OWNER, email: "ghost@example.com" })
    .then(() => null, (e: unknown) => e);
  expect(err).toBeInstanceOf(AppError);
  expect((err as AppError).status).toBe(404);
});

test("addContact rejects saving yourself (400)", async () => {
  withStubs({
    users: {
      findByEmail: async () => OTHER_USER as never,
      findByIdSafe: async () => ({ ...OTHER_USER, id: OWNER }) as never
    }
  });

  const err = await contactsService
    .addContact({ ownerId: OWNER, email: OTHER_USER.email })
    .then(() => null, (e: unknown) => e);
  expect(err).toBeInstanceOf(AppError);
  expect((err as AppError).status).toBe(400);
});

test("removeContact throws 404 when nothing was deleted", async () => {
  withStubs({ contacts: { deleteForOwner: async () => false } });

  const err = await contactsService
    .removeContact({ ownerId: OWNER, id: "507f1f77bcf86cd799439099" })
    .then(() => null, (e: unknown) => e);
  expect(err).toBeInstanceOf(AppError);
  expect((err as AppError).status).toBe(404);
});

test("listContacts delegates to the repository", async () => {
  withStubs({ contacts: { listForOwner: async () => [contactRecord()] } });
  const list = await contactsService.listContacts(OWNER);
  expect(list).toHaveLength(1);
});
