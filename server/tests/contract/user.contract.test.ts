
// server/tests/contract/user.contract.test.ts
import { describeContract } from "./harness.js";
import { DuplicateKeyError } from "../../src/repositories/types.js";

describeContract("UserRepository", {
  "create then findById round-trips a record with a 24-hex id": async ({ repos }) => {
    const u = await repos.users.create({ email: "A@B.com", passwordHash: "h", phone: "+972", balance: 50 });
    expect(u.id).toMatch(/^[0-9a-fA-F]{24}$/);
    expect(u.email).toBe("a@b.com"); // lowercased
    const found = await repos.users.findById(u.id);
    expect(found?.balance).toBe(50);
  },
  "findByIdSafe omits secrets": async ({ repos }) => {
    const u = await repos.users.create({ email: "s@x.com", passwordHash: "h", phone: "+972", balance: 0 });
    const safe = await repos.users.findByIdSafe(u.id);
    expect((safe as Record<string, unknown>).passwordHash).toBeUndefined();
  },
  "duplicate email rejects with DuplicateKeyError": async ({ repos }) => {
    await repos.users.create({ email: "dup@x.com", passwordHash: "h", phone: "+972", balance: 0 });
    const err = await repos.users.create({ email: "dup@x.com", passwordHash: "h", phone: "+972", balance: 0 }).then(
      () => null,
      (e) => e
    );
    expect(err).toBeInstanceOf(DuplicateKeyError);
  },
  "findById returns null for a malformed id": async ({ repos }) => {
    expect(await repos.users.findById("not-an-id")).toBeNull();
  },
  "setBalance / markVerified mutate as expected": async ({ repos }) => {
    const u = await repos.users.create({ email: "m@x.com", passwordHash: "h", phone: "+972", balance: 0 });
    await repos.users.setBalance(u.id, 999);
    await repos.users.markVerified(u.id);
    const after = await repos.users.findById(u.id);
    expect(after?.balance).toBe(999);
    expect(after?.isVerified).toBe(true);
  }
});
