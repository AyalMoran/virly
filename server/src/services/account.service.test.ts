

import assert from "node:assert/strict";
import test from "node:test";
import { AppError } from "../utils/app-error.js";
import { accountService } from "./account.service.js";
import { setRepositories } from "../repositories/index.js";
import { createMongoRepositories } from "../repositories/mongo/index.js";
import type { Repositories } from "../repositories/types.js";

function withUsers(stub: Partial<Repositories["users"]>) {
  const base = createMongoRepositories();
  setRepositories({ ...base, users: { ...base.users, ...stub } as Repositories["users"] });
}

const ID = "507f1f77bcf86cd799439011";
const rec = { id: ID, email: "alice@example.com", phone: "+972", isVerified: true, personalDetails: null, balance: 500, role: "user", createdAt: new Date(0), updatedAt: new Date(0) };

test("getById returns the safe record", async () => {
  withUsers({ findByIdSafe: async (id) => (id === ID ? (rec as never) : null) });
  const user = await accountService.getById(ID);
  assert.equal(user.id, ID);
  assert.equal((user as Record<string, unknown>).passwordHash, undefined);
});

test("getById throws AppError(404) when missing", async () => {
  withUsers({ findByIdSafe: async () => null });
  await assert.rejects(() => accountService.getById(ID), (e: unknown) => e instanceof AppError && (e as AppError).status === 404);
});

test("findByIdOrEmail resolves a 24-hex id via findById", async () => {
  withUsers({ findById: async (id) => (id === ID ? (rec as never) : null), findByEmail: async () => null });
  assert.equal((await accountService.findByIdOrEmail(ID))?.id, ID);
});

test("findByIdOrEmail resolves an email via findByEmail", async () => {
  withUsers({ findById: async () => null, findByEmail: async (e) => (e === "alice@example.com" ? (rec as never) : null) });
  assert.equal((await accountService.findByIdOrEmail("alice@example.com"))?.email, "alice@example.com");
});

test("findByIdOrEmail returns null for an invalid identifier", async () => {
  withUsers({ findById: async () => null, findByEmail: async () => null });
  assert.equal(await accountService.findByIdOrEmail("not-anything"), null);
});
