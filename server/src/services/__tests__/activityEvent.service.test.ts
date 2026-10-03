// src/services/__tests__/activityEvent.service.test.ts
import { jest } from "@jest/globals";
import { clearRepositories, setRepositories } from "../../repositories/index.js";
import type { ActivityEventCreateInput, ActivityEventRecord, Repositories } from "../../repositories/types.js";

function fakeRepos(overrides: { createImpl?: (input: ActivityEventCreateInput) => Promise<ActivityEventRecord> } = {}) {
  const created: ActivityEventCreateInput[] = [];
  const record = (input: ActivityEventCreateInput): ActivityEventRecord => ({
    id: "6867f00000000000000000aa",
    userId: input.userId,
    kind: input.kind,
    at: input.at,
    ip: input.ip,
    geo: input.geo,
    transactionId: input.transactionId ?? null,
    expiresAt: input.expiresAt,
    createdAt: input.at,
    updatedAt: input.at
  });
  const repos = {
    activityEvents: {
      async create(input: ActivityEventCreateInput) {
        created.push(input);
        return overrides.createImpl ? overrides.createImpl(input) : record(input);
      },
      async listRecentByUser() {
        return [];
      },
      async deleteExpired() {
        return 0;
      }
    }
  } as unknown as Repositories;
  return { repos, created };
}

afterEach(() => clearRepositories());

test("records an event with expiresAt = at + retentionDays", async () => {
  const { repos, created } = fakeRepos();
  setRepositories(repos);
  const { recordActivityEventSafe } = await import("../activityEvent.service.js");
  const now = new Date("2026-07-01T10:00:00.000Z");
  const rec = await recordActivityEventSafe({
    userId: "u1",
    kind: "login",
    origin: { ip: "203.0.113.7", geo: { country: "IL", city: "Tel Aviv", lat: 32.0853, lng: 34.7818 } },
    now
  });
  expect(rec).not.toBeNull();
  expect(created).toHaveLength(1);
  expect(created[0]!.at).toStrictEqual(now);
  // default retention is 180 days
  expect(created[0]!.expiresAt.getTime()).toBe(now.getTime() + 180 * 24 * 60 * 60 * 1000);
});

test("never throws when the write fails; logs and returns null", async () => {
  const { repos } = fakeRepos({
    createImpl: async () => {
      throw new Error("db down");
    }
  });
  setRepositories(repos);
  const errorSpy = jest.spyOn(console, "error").mockImplementation(() => {});
  const { recordActivityEventSafe } = await import("../activityEvent.service.js");
  const rec = await recordActivityEventSafe({
    userId: "u1",
    kind: "transfer",
    origin: { ip: null, geo: null },
    transactionId: "6867f00000000000000000ab"
  });
  expect(rec).toBeNull();
  expect(errorSpy).toHaveBeenCalled();
  errorSpy.mockRestore();
});
