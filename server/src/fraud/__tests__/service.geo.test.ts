import { clearRepositories, setRepositories } from "../../repositories/index.js";
import type { ActivityEventRecord, Repositories } from "../../repositories/types.js";

const TLV = { country: "IL", city: "Tel Aviv", lat: 32.0853, lng: 34.7818 };
const PARIS = { country: "FR", city: "Paris", lat: 48.8566, lng: 2.3522 };

function located(at: string, geo: typeof TLV): ActivityEventRecord {
  return {
    id: "6867f00000000000000000aa",
    userId: "u1",
    kind: "login",
    at: new Date(at),
    ip: "203.0.113.7",
    geo,
    transactionId: null,
    expiresAt: new Date("2027-01-01T00:00:00Z"),
    createdAt: new Date(at),
    updatedAt: new Date(at)
  };
}

function fakeRepos(history: ActivityEventRecord[]): Repositories {
  return {
    transactions: {
      async hasDebitToCounterparty() {
        return true; // not a new counterparty - keep non-geo score at 0
      },
      async getDailyDebitUsage() {
        return { total: 0 };
      },
      async recentForOwner() {
        return [];
      }
    },
    activityEvents: {
      async listRecentByUser() {
        return history;
      },
      async create() {
        throw new Error("not used");
      },
      async deleteExpired() {
        return 0;
      }
    }
  } as unknown as Repositories;
}

afterEach(() => clearRepositories());

test("Paris transfer 30 minutes after Tel Aviv login is high risk and holdable", async () => {
  setRepositories(
    fakeRepos([
      located("2026-07-01T10:00:00Z", TLV),
      located("2026-06-28T09:00:00Z", TLV),
      located("2026-06-25T09:00:00Z", TLV),
      located("2026-06-20T09:00:00Z", TLV),
      located("2026-06-15T09:00:00Z", TLV)
    ])
  );
  const { scoreTransfer } = await import("../service.js");
  const result = await scoreTransfer({
    userId: "u1",
    recipientEmail: "rcpt@test.com",
    amount: 50,
    now: new Date("2026-07-01T10:30:00Z"),
    origin: { ip: "198.51.100.9", geo: PARIS }
  });
  expect(result.flags.impossibleTravel).toBe(true);
  expect(result.flags.newCountry).toBe(true);
  expect(result.level).toBe("high");
});

test("no origin geo -> geo rules silent (fail-open)", async () => {
  setRepositories(fakeRepos([located("2026-07-01T10:00:00Z", TLV)]));
  const { scoreTransfer } = await import("../service.js");
  const result = await scoreTransfer({
    userId: "u1",
    recipientEmail: "rcpt@test.com",
    amount: 50,
    now: new Date("2026-07-01T10:30:00Z"),
    origin: { ip: "198.51.100.9", geo: null }
  });
  expect(result.flags.impossibleTravel).toBe(false);
  expect(result.flags.newCountry).toBe(false);
  expect(result.level).toBe("low");
});

test("hour-of-day interplay: keep now at a non-odd hour so only geo drives the score", async () => {
  // 10:30 UTC is outside ODD_HOURS - guard against accidental oddHour +0.1 in the cases above.
  expect([0, 1, 2, 3, 4, 5]).not.toContain(new Date("2026-07-01T10:30:00Z").getUTCHours());
});
