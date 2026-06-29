

// src/repositories/mongo/user.repository.test.ts
import { User } from "../../../models/User.js";
import { mongoUserRepository } from "../user.repository.js";

const cleanups: Array<() => void | Promise<void>> = [];
afterEach(async () => { for (const c of cleanups.splice(0).reverse()) await c(); });

function patch<T extends object, K extends keyof T>(o: T, k: K, v: T[K]) {
  const orig = o[k]; o[k] = v; cleanups.push(() => { o[k] = orig; });
}

const ID = "507f1f77bcf86cd799439011";
const lean = {
  _id: ID, email: "a@b.com", passwordHash: "h", phone: "+972", isVerified: true,
  personalDetails: null,
  balance: 100, role: "user", createdAt: new Date(0), updatedAt: new Date(0)
};

test("findById maps a lean doc to a UserRecord with string id", async () => {
  patch(User, "findById", ((id: string) => ({ lean: async () => (id === ID ? lean : null) })) as never);
  const rec = await mongoUserRepository.findById(ID);
  expect(rec?.id).toBe(ID);
  expect(rec?.balance).toBe(100);
  expect((rec as Record<string, unknown>)._id).toBeUndefined();
});

test("findByIdSafe omits secret fields", async () => {
  patch(User, "findById", (() => ({ lean: async () => lean })) as never);
  const rec = await mongoUserRepository.findByIdSafe(ID);
  expect((rec as Record<string, unknown>).passwordHash).toBeUndefined();
  expect(rec?.email).toBe("a@b.com");
});

test("create maps a duplicate-key (E11000) to DuplicateKeyError", async () => {
  patch(User, "create", (async () => { const e = new Error("dup") as Error & { code: number }; e.code = 11000; throw e; }) as never);
  const err = await mongoUserRepository.create({ email: "a@b.com", passwordHash: "h", phone: "+972", balance: 0 }).then(() => null, (e) => e);
  expect((err as Error).name).toBe("DuplicateKeyError");
});

const ID2 = "507f1f77bcf86cd799439012";
const lean2 = { ...lean, _id: ID2, email: "c@d.com", balance: 200 };

test("findByEmails issues a $in(email) query and maps lean docs to records", async () => {
  let captured: unknown;
  patch(User, "find", ((filter: unknown) => {
    captured = filter;
    return { lean: async () => [lean, lean2] };
  }) as never);
  const recs = await mongoUserRepository.findByEmails(["a@b.com", "c@d.com"]);
  expect(captured).toStrictEqual({ email: { $in: ["a@b.com", "c@d.com"] } });
  expect(recs.length).toBe(2);
  expect(recs[0].id).toBe(ID);
  expect(recs[0].email).toBe("a@b.com");
  expect(recs[0].isVerified).toBe(true);
  expect((recs[0] as Record<string, unknown>)._id).toBeUndefined();
  expect(recs[1].id).toBe(ID2);
});

test("findByEmails passes the session through when a tx is supplied", async () => {
  let sessionArg: unknown = "unset";
  const fakeSession = { marker: "S" };
  patch(User, "find", (() => ({
    session(s: unknown) { sessionArg = s; return this; },
    lean: async () => []
  })) as never);
  await mongoUserRepository.findByEmails(["a@b.com"], fakeSession);
  expect(sessionArg).toBe(fakeSession);
});

test("findByEmails does NOT call session when no tx is supplied", async () => {
  let sessionCalled = false;
  patch(User, "find", (() => ({
    session() { sessionCalled = true; return this; },
    lean: async () => []
  })) as never);
  await mongoUserRepository.findByEmails(["a@b.com"]);
  expect(sessionCalled).toBe(false);
});

test("findManyByIds issues a $in(_id) query and maps lean docs to records", async () => {
  let captured: unknown;
  patch(User, "find", ((filter: unknown) => {
    captured = filter;
    return { lean: async () => [lean, lean2] };
  }) as never);
  const recs = await mongoUserRepository.findManyByIds([ID, ID2]);
  expect(captured).toStrictEqual({ _id: { $in: [ID, ID2] } });
  expect(recs.length).toBe(2);
  expect(recs[0].id).toBe(ID);
  expect((recs[0] as Record<string, unknown>)._id).toBeUndefined();
  expect(recs[1].id).toBe(ID2);
  expect(recs[1].email).toBe("c@d.com");
});

test("findManyByIds passes the session through when a tx is supplied", async () => {
  let sessionArg: unknown = "unset";
  const fakeSession = { marker: "S" };
  patch(User, "find", (() => ({
    session(s: unknown) { sessionArg = s; return this; },
    lean: async () => []
  })) as never);
  await mongoUserRepository.findManyByIds([ID], fakeSession);
  expect(sessionArg).toBe(fakeSession);
});

test("findManyByIds does NOT call session when no tx is supplied", async () => {
  let sessionCalled = false;
  patch(User, "find", (() => ({
    session() { sessionCalled = true; return this; },
    lean: async () => []
  })) as never);
  await mongoUserRepository.findManyByIds([ID]);
  expect(sessionCalled).toBe(false);
});
