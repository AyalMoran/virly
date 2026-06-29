// server/tests/contract/personalDetails.contract.test.ts
import { describeContract } from "./harness.js";

// Helper: create a minimal user to own the personal-details row. Both drivers
// need a real user row because user.id is referenced by personal_details.user_id
// (PG foreign-key) and by Mongo convention.
async function createUser(repos: import("../../src/repositories/types.js").Repositories, suffix = "") {
  return repos.users.create({
    email: `pd-contract${suffix}@test.com`,
    passwordHash: "hash",
    phone: "+9720000000",
    balance: 0
  });
}

describeContract("PersonalDetailsRepository", {
  // ---- ensureForUser ----

  "ensureForUser creates a not_provided row with 24-hex id": async ({ repos }) => {
    const user = await createUser(repos);
    const pd = await repos.personalDetails.ensureForUser(user.id);
    expect(pd.id).toMatch(/^[0-9a-fA-F]{24}$/);
    expect(pd.userId).toBe(user.id);
    expect(pd.status).toBe("not_provided");
    expect(pd.firstName).toBeNull();
    expect(pd.lastName).toBeNull();
    expect(pd.dateOfBirth).toBeNull();
    expect(pd.address).toStrictEqual({});
    expect(pd.lastSkippedAt).toBeNull();
    expect(pd.createdAt).toBeInstanceOf(Date);
    expect(pd.updatedAt).toBeInstanceOf(Date);
  },

  "ensureForUser is idempotent (second call returns same row, no duplicate)": async ({ repos }) => {
    const user = await createUser(repos);
    const first = await repos.personalDetails.ensureForUser(user.id);
    const second = await repos.personalDetails.ensureForUser(user.id);
    // Same identity
    expect(second.id).toBe(first.id);
    expect(second.userId).toBe(first.userId);
    expect(second.status).toBe("not_provided");
    // Only one row should exist
    const found = await repos.personalDetails.findByUserId(user.id);
    expect(found).toBeTruthy();
    expect(found!.id).toBe(first.id);
  },

  // ---- findByUserId ----

  "findByUserId returns null when no row exists": async ({ repos }) => {
    const user = await createUser(repos);
    const result = await repos.personalDetails.findByUserId(user.id);
    expect(result).toBeNull();
  },

  "findByUserId returns the row after ensureForUser": async ({ repos }) => {
    const user = await createUser(repos);
    const created = await repos.personalDetails.ensureForUser(user.id);
    const found = await repos.personalDetails.findByUserId(user.id);
    expect(found).toBeTruthy();
    expect(found!.id).toBe(created.id);
    expect(found!.status).toBe("not_provided");
  },

  // ---- update ----

  "update applies patch fields and returns updated record": async ({ repos }) => {
    const user = await createUser(repos);
    await repos.personalDetails.ensureForUser(user.id);
    const dob = new Date("1990-05-15T00:00:00.000Z");
    const updated = await repos.personalDetails.update(user.id, {
      status: "provided",
      firstName: "Alice",
      lastName: "Smith",
      dateOfBirth: dob,
      address: { city: "Tel Aviv", country: "IL" }
    });
    expect(updated).toBeTruthy();
    expect(updated!.status).toBe("provided");
    expect(updated!.firstName).toBe("Alice");
    expect(updated!.lastName).toBe("Smith");
    expect(updated!.dateOfBirth).toBeInstanceOf(Date);
    expect(updated!.dateOfBirth!.toISOString()).toBe(dob.toISOString());
    expect(updated!.address).toStrictEqual({ city: "Tel Aviv", country: "IL" });
  },

  "update returns null when no row exists for the user": async ({ repos }) => {
    const user = await createUser(repos);
    // Don't call ensureForUser — no row exists
    const result = await repos.personalDetails.update(user.id, { status: "provided" });
    expect(result).toBeNull();
  },

  "update only touches specified patch fields (partial update)": async ({ repos }) => {
    const user = await createUser(repos);
    await repos.personalDetails.ensureForUser(user.id);
    await repos.personalDetails.update(user.id, { firstName: "Bob" });
    const afterFirst = await repos.personalDetails.findByUserId(user.id);
    expect(afterFirst?.firstName).toBe("Bob");
    expect(afterFirst?.status).toBe("not_provided"); // untouched

    await repos.personalDetails.update(user.id, { status: "provided" });
    const afterSecond = await repos.personalDetails.findByUserId(user.id);
    expect(afterSecond?.status).toBe("provided");
    expect(afterSecond?.firstName).toBe("Bob"); // still set
  },

  // ---- findProvidedByUserIds ----

  "findProvidedByUserIds returns only status=provided rows matching the id set": async ({ repos }) => {
    const u1 = await createUser(repos, "-1");
    const u2 = await createUser(repos, "-2");
    const u3 = await createUser(repos, "-3");

    await repos.personalDetails.ensureForUser(u1.id);
    await repos.personalDetails.ensureForUser(u2.id);
    await repos.personalDetails.ensureForUser(u3.id);

    await repos.personalDetails.update(u1.id, { status: "provided", firstName: "Alice", lastName: "A" });
    await repos.personalDetails.update(u2.id, { status: "provided", firstName: "Bob", lastName: "B" });
    // u3 remains not_provided

    const results = await repos.personalDetails.findProvidedByUserIds([u1.id, u2.id, u3.id]);
    const ids = results.map((r) => r.userId).sort();
    expect(ids).toStrictEqual([u1.id, u2.id].sort());
    expect(results.every((r) => r.status === "provided")).toBeTruthy();
  },

  "findProvidedByUserIds returns empty array for empty input": async ({ repos }) => {
    const results = await repos.personalDetails.findProvidedByUserIds([]);
    expect(results).toStrictEqual([]);
  },

  "findProvidedByUserIds excludes user ids not in the set": async ({ repos }) => {
    const u1 = await createUser(repos, "-1");
    const u2 = await createUser(repos, "-2");

    await repos.personalDetails.ensureForUser(u1.id);
    await repos.personalDetails.ensureForUser(u2.id);
    await repos.personalDetails.update(u1.id, { status: "provided", firstName: "Only", lastName: "One" });
    await repos.personalDetails.update(u2.id, { status: "provided", firstName: "Excluded", lastName: "Two" });

    const results = await repos.personalDetails.findProvidedByUserIds([u1.id]);
    expect(results.length).toBe(1);
    expect(results[0].userId).toBe(u1.id);
  },

  // ---- findProvidedByName ----

  "findProvidedByName matches case-insensitively on firstName": async ({ repos }) => {
    const u1 = await createUser(repos, "-1");
    const u2 = await createUser(repos, "-2");

    await repos.personalDetails.ensureForUser(u1.id);
    await repos.personalDetails.ensureForUser(u2.id);
    await repos.personalDetails.update(u1.id, { status: "provided", firstName: "Alice", lastName: "Smith" });
    await repos.personalDetails.update(u2.id, { status: "provided", firstName: "Bob", lastName: "Smith" });

    const results = await repos.personalDetails.findProvidedByName({ firstName: "ALICE", limit: 10 });
    expect(results.length).toBe(1);
    expect(results[0].userId).toBe(u1.id);
  },

  "findProvidedByName filters by lastName when provided": async ({ repos }) => {
    const u1 = await createUser(repos, "-1");
    const u2 = await createUser(repos, "-2");

    await repos.personalDetails.ensureForUser(u1.id);
    await repos.personalDetails.ensureForUser(u2.id);
    await repos.personalDetails.update(u1.id, { status: "provided", firstName: "Alice", lastName: "Smith" });
    await repos.personalDetails.update(u2.id, { status: "provided", firstName: "Alice", lastName: "Jones" });

    const results = await repos.personalDetails.findProvidedByName({ firstName: "alice", lastName: "SMITH", limit: 10 });
    expect(results.length).toBe(1);
    expect(results[0].userId).toBe(u1.id);
  },

  "findProvidedByName respects limit": async ({ repos }) => {
    const users = await Promise.all(
      Array.from({ length: 3 }, (_, i) => createUser(repos, `-${i}`))
    );
    for (const u of users) {
      await repos.personalDetails.ensureForUser(u.id);
      await repos.personalDetails.update(u.id, { status: "provided", firstName: "Common", lastName: "Name" });
    }
    const results = await repos.personalDetails.findProvidedByName({ firstName: "Common", lastName: "Name", limit: 2 });
    expect(results.length).toBe(2);
  },

  "findProvidedByName returns empty when no provided rows match": async ({ repos }) => {
    const user = await createUser(repos);
    await repos.personalDetails.ensureForUser(user.id);
    // not_provided — should not appear
    const results = await repos.personalDetails.findProvidedByName({ firstName: "Ghost", limit: 10 });
    expect(results.length).toBe(0);
  },

  // ---- address jsonb round-trip ----

  "address (jsonb object) round-trips through insert and update": async ({ repos }) => {
    const user = await createUser(repos);
    await repos.personalDetails.ensureForUser(user.id);
    const addr = { street: "123 Main St", city: "Haifa", zip: null };
    await repos.personalDetails.update(user.id, { address: addr });
    const found = await repos.personalDetails.findByUserId(user.id);
    expect(found).toBeTruthy();
    expect(found!.address).toStrictEqual(addr);
  }
});
