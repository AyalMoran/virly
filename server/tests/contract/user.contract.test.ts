
// server/tests/contract/user.contract.test.ts
import assert from "node:assert/strict";
import { describeContract } from "./harness.js";
import { DuplicateKeyError } from "../../src/repositories/types.js";

describeContract("UserRepository", {
  "create then findById round-trips a record with a 24-hex id": async ({ repos }) => {
    const u = await repos.users.create({ email: "A@B.com", passwordHash: "h", phone: "+972", balance: 50 });
    assert.match(u.id, /^[0-9a-fA-F]{24}$/);
    assert.equal(u.email, "a@b.com"); // lowercased
    const found = await repos.users.findById(u.id);
    assert.equal(found?.balance, 50);
  },
  "findByIdSafe omits secrets": async ({ repos }) => {
    const u = await repos.users.create({ email: "s@x.com", passwordHash: "h", phone: "+972", balance: 0 });
    const safe = await repos.users.findByIdSafe(u.id);
    assert.equal((safe as Record<string, unknown>).passwordHash, undefined);
  },
  "duplicate email rejects with DuplicateKeyError": async ({ repos }) => {
    await repos.users.create({ email: "dup@x.com", passwordHash: "h", phone: "+972", balance: 0 });
    await assert.rejects(
      () => repos.users.create({ email: "dup@x.com", passwordHash: "h", phone: "+972", balance: 0 }),
      (e: unknown) => e instanceof DuplicateKeyError
    );
  },
  "findById returns null for a malformed id": async ({ repos }) => {
    assert.equal(await repos.users.findById("not-an-id"), null);
  },
  "setBalance / markVerified mutate as expected": async ({ repos }) => {
    const u = await repos.users.create({ email: "m@x.com", passwordHash: "h", phone: "+972", balance: 0 });
    await repos.users.setBalance(u.id, 999);
    await repos.users.markVerified(u.id);
    const after = await repos.users.findById(u.id);
    assert.equal(after?.balance, 999);
    assert.equal(after?.isVerified, true);
  }
});
