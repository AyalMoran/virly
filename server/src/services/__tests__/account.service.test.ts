import { AppError } from "../../utils/app-error.js";
import { accountService } from "../account.service.js";
import { setRepositories } from "../../repositories/index.js";
import { createMongoRepositories } from "../../repositories/mongo/index.js";
import type { Repositories } from "../../repositories/types.js";

function withUsers(stub: Partial<Repositories["users"]>) {
  const base = createMongoRepositories();
  setRepositories({ ...base, users: { ...base.users, ...stub } as Repositories["users"] });
}

const ID = "507f1f77bcf86cd799439011";
const rec = { id: ID, email: "alice@example.com", phone: "+972", isVerified: true, personalDetails: null, balance: 500, role: "user", createdAt: new Date(0), updatedAt: new Date(0) };

test("getById returns the safe record", async () => {
  withUsers({ findByIdSafe: async (id) => (id === ID ? (rec as never) : null) });
  const user = await accountService.getById(ID);
  expect(user.id).toBe(ID);
  expect((user as Record<string, unknown>).passwordHash).toBeUndefined();
});

test("getById throws AppError(404) when missing", async () => {
  withUsers({ findByIdSafe: async () => null });
  const err = await accountService.getById(ID).then(() => null, (e: unknown) => e);
  expect(err).toBeInstanceOf(AppError);
  expect((err as AppError).status).toBe(404);
});

test("findByIdOrEmail resolves a 24-hex id via findById", async () => {
  withUsers({ findById: async (id) => (id === ID ? (rec as never) : null), findByEmail: async () => null });
  expect((await accountService.findByIdOrEmail(ID))?.id).toBe(ID);
});

test("findByIdOrEmail resolves an email via findByEmail", async () => {
  withUsers({ findById: async () => null, findByEmail: async (e) => (e === "alice@example.com" ? (rec as never) : null) });
  expect((await accountService.findByIdOrEmail("alice@example.com"))?.email).toBe("alice@example.com");
});

test("findByIdOrEmail returns null for an invalid identifier", async () => {
  withUsers({ findById: async () => null, findByEmail: async () => null });
  expect(await accountService.findByIdOrEmail("not-anything")).toBeNull();
});
