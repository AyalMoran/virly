
// server/tests/contract/activityEvent.contract.test.ts
import { describeContract } from "./harness.js";
import type { Repositories, ActivityEventCreateInput } from "../../src/repositories/types.js";

async function createUser(repos: Repositories, suffix = "") {
  return repos.users.create({
    email: `activity-contract${suffix}@test.com`,
    passwordHash: "hash",
    phone: "+9720000000",
    balance: 0
  });
}

const TLV = { country: "IL", city: "Tel Aviv", lat: 32.0853, lng: 34.7818 };

function eventInput(userId: string, overrides: Partial<ActivityEventCreateInput> = {}): ActivityEventCreateInput {
  return {
    userId,
    kind: "login",
    at: new Date("2026-07-01T10:00:00.000Z"),
    ip: "203.0.113.7",
    geo: TLV,
    expiresAt: new Date("2026-12-28T10:00:00.000Z"),
    ...overrides
  };
}

describeContract("ActivityEventRepository", {
  "create returns a 24-hex id and round-trips every field": async ({ repos }) => {
    const user = await createUser(repos);
    const created = await repos.activityEvents.create(eventInput(user.id));
    expect(created.id).toMatch(/^[0-9a-f]{24}$/i);
    expect(created.userId).toBe(user.id);
    expect(created.kind).toBe("login");
    expect(created.at.toISOString()).toBe("2026-07-01T10:00:00.000Z");
    expect(created.ip).toBe("203.0.113.7");
    expect(created.geo).toStrictEqual(TLV);
    expect(created.transactionId).toBeNull();
    expect(created.expiresAt.toISOString()).toBe("2026-12-28T10:00:00.000Z");
  },

  "create accepts null ip and null geo (unresolvable request)": async ({ repos }) => {
    const user = await createUser(repos);
    const created = await repos.activityEvents.create(
      eventInput(user.id, { ip: null, geo: null })
    );
    expect(created.ip).toBeNull();
    expect(created.geo).toBeNull();
  },

  "transfer events keep their transactionId": async ({ repos }) => {
    const user = await createUser(repos);
    const txId = "6867f00000000000000000ab";
    const created = await repos.activityEvents.create(
      eventInput(user.id, { kind: "transfer", transactionId: txId })
    );
    expect(created.kind).toBe("transfer");
    expect(created.transactionId).toBe(txId);
  },

  "listRecentByUser is newest-first and scoped to the user": async ({ repos }) => {
    const a = await createUser(repos, "-a");
    const b = await createUser(repos, "-b");
    await repos.activityEvents.create(eventInput(a.id, { at: new Date("2026-07-01T08:00:00Z") }));
    await repos.activityEvents.create(eventInput(a.id, { at: new Date("2026-07-01T09:00:00Z") }));
    await repos.activityEvents.create(eventInput(b.id, { at: new Date("2026-07-01T10:00:00Z") }));
    const list = await repos.activityEvents.listRecentByUser(a.id, { limit: 10 });
    expect(list.map((e) => e.at.toISOString())).toStrictEqual([
      "2026-07-01T09:00:00.000Z",
      "2026-07-01T08:00:00.000Z"
    ]);
    expect(list.every((e) => e.userId === a.id)).toBe(true);
  },

  "listRecentByUser honors limit and the before cursor": async ({ repos }) => {
    const user = await createUser(repos);
    await repos.activityEvents.create(eventInput(user.id, { at: new Date("2026-07-01T08:00:00Z") }));
    await repos.activityEvents.create(eventInput(user.id, { at: new Date("2026-07-01T09:00:00Z") }));
    await repos.activityEvents.create(eventInput(user.id, { at: new Date("2026-07-01T10:00:00Z") }));
    await repos.activityEvents.create(eventInput(user.id, { at: new Date("2026-07-01T11:00:00Z") }));
    const page1 = await repos.activityEvents.listRecentByUser(user.id, { limit: 2 });
    expect(page1).toHaveLength(2);
    const page2 = await repos.activityEvents.listRecentByUser(user.id, {
      limit: 2,
      before: page1[1]!.at
    });
    expect(page2).toHaveLength(2);
    const all = [...page1, ...page2].map((e) => e.at.getTime());
    expect(new Set(all).size).toBe(4);
    expect([...all].sort((x, y) => y - x)).toStrictEqual(all);
  },

  "deleteExpired removes only past-expiry rows and reports the count": async ({ repos }) => {
    const user = await createUser(repos);
    await repos.activityEvents.create(eventInput(user.id, { expiresAt: new Date("2026-01-01T00:00:00Z") }));
    await repos.activityEvents.create(eventInput(user.id, { expiresAt: new Date("2027-01-01T00:00:00Z") }));
    const removed = await repos.activityEvents.deleteExpired(new Date("2026-06-01T00:00:00Z"));
    expect(removed).toBe(1);
    const remaining = await repos.activityEvents.listRecentByUser(user.id, { limit: 10 });
    expect(remaining).toHaveLength(1);
  }
});
