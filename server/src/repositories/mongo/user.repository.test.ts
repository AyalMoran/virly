

// src/repositories/mongo/user.repository.test.ts
import assert from "node:assert/strict";
import test from "node:test";
import { User } from "../../models/User.js";
import { mongoUserRepository } from "./user.repository.js";

function patch<T extends object, K extends keyof T>(o: T, k: K, v: T[K], t: test.TestContext) {
  const orig = o[k]; o[k] = v; t.after(() => { o[k] = orig; });
}

const ID = "507f1f77bcf86cd799439011";
const lean = {
  _id: ID, email: "a@b.com", passwordHash: "h", phone: "+972", isVerified: true,
  personalDetails: null,
  balance: 100, role: "user", createdAt: new Date(0), updatedAt: new Date(0)
};

test("findById maps a lean doc to a UserRecord with string id", async (t) => {
  patch(User, "findById", ((id: string) => ({ lean: async () => (id === ID ? lean : null) })) as never, t);
  const rec = await mongoUserRepository.findById(ID);
  assert.equal(rec?.id, ID);
  assert.equal(rec?.balance, 100);
  assert.equal((rec as Record<string, unknown>)._id, undefined);
});

test("findByIdSafe omits secret fields", async (t) => {
  patch(User, "findById", (() => ({ lean: async () => lean })) as never, t);
  const rec = await mongoUserRepository.findByIdSafe(ID);
  assert.equal((rec as Record<string, unknown>).passwordHash, undefined);
  assert.equal(rec?.email, "a@b.com");
});

test("create maps a duplicate-key (E11000) to DuplicateKeyError", async (t) => {
  patch(User, "create", (async () => { const e = new Error("dup") as Error & { code: number }; e.code = 11000; throw e; }) as never, t);
  await assert.rejects(
    () => mongoUserRepository.create({ email: "a@b.com", passwordHash: "h", phone: "+972", balance: 0 }),
    (e: unknown) => (e as Error).name === "DuplicateKeyError"
  );
});

const ID2 = "507f1f77bcf86cd799439012";
const lean2 = { ...lean, _id: ID2, email: "c@d.com", balance: 200 };

test("findByEmails issues a $in(email) query and maps lean docs to records", async (t) => {
  let captured: unknown;
  patch(User, "find", ((filter: unknown) => {
    captured = filter;
    return { lean: async () => [lean, lean2] };
  }) as never, t);
  const recs = await mongoUserRepository.findByEmails(["a@b.com", "c@d.com"]);
  assert.deepEqual(captured, { email: { $in: ["a@b.com", "c@d.com"] } });
  assert.equal(recs.length, 2);
  assert.equal(recs[0].id, ID);
  assert.equal(recs[0].email, "a@b.com");
  assert.equal(recs[0].isVerified, true);
  assert.equal((recs[0] as Record<string, unknown>)._id, undefined);
  assert.equal(recs[1].id, ID2);
});

test("findByEmails passes the session through when a tx is supplied", async (t) => {
  let sessionArg: unknown = "unset";
  const fakeSession = { marker: "S" };
  patch(User, "find", (() => ({
    session(s: unknown) { sessionArg = s; return this; },
    lean: async () => []
  })) as never, t);
  await mongoUserRepository.findByEmails(["a@b.com"], fakeSession);
  assert.equal(sessionArg, fakeSession);
});

test("findByEmails does NOT call session when no tx is supplied", async (t) => {
  let sessionCalled = false;
  patch(User, "find", (() => ({
    session() { sessionCalled = true; return this; },
    lean: async () => []
  })) as never, t);
  await mongoUserRepository.findByEmails(["a@b.com"]);
  assert.equal(sessionCalled, false);
});

test("findManyByIds issues a $in(_id) query and maps lean docs to records", async (t) => {
  let captured: unknown;
  patch(User, "find", ((filter: unknown) => {
    captured = filter;
    return { lean: async () => [lean, lean2] };
  }) as never, t);
  const recs = await mongoUserRepository.findManyByIds([ID, ID2]);
  assert.deepEqual(captured, { _id: { $in: [ID, ID2] } });
  assert.equal(recs.length, 2);
  assert.equal(recs[0].id, ID);
  assert.equal((recs[0] as Record<string, unknown>)._id, undefined);
  assert.equal(recs[1].id, ID2);
  assert.equal(recs[1].email, "c@d.com");
});

test("findManyByIds passes the session through when a tx is supplied", async (t) => {
  let sessionArg: unknown = "unset";
  const fakeSession = { marker: "S" };
  patch(User, "find", (() => ({
    session(s: unknown) { sessionArg = s; return this; },
    lean: async () => []
  })) as never, t);
  await mongoUserRepository.findManyByIds([ID], fakeSession);
  assert.equal(sessionArg, fakeSession);
});

test("findManyByIds does NOT call session when no tx is supplied", async (t) => {
  let sessionCalled = false;
  patch(User, "find", (() => ({
    session() { sessionCalled = true; return this; },
    lean: async () => []
  })) as never, t);
  await mongoUserRepository.findManyByIds([ID]);
  assert.equal(sessionCalled, false);
});
