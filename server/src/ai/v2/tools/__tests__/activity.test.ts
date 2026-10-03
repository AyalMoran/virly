import { DEFAULT_ASSISTANT_ID } from "../../../assistants.js";
import {
  createTransferModificationService,
  createTransferPreparationService
} from "../../../evals/support.js";
import { WORLD } from "../../../evals/v2/world.js";
import { createV2WorldTools } from "../../../evals/v2/worldTools.js";
import { clearRepositories, setRepositories } from "../../../../repositories/index.js";
import type { ActivityEventRecord, Repositories } from "../../../../repositories/types.js";
import type { V2Configurable, V2TurnOutcome } from "../../toolContext.js";
import { getRecentActivityTool } from "../activity.js";

function makeConfig(message: string, outcome: V2TurnOutcome = { uiBlocks: [] }) {
  const configurable: V2Configurable = {
    userId: WORLD.userId,
    conversationId: "tools-test",
    assistantId: DEFAULT_ASSISTANT_ID,
    message,
    now: new Date("2026-06-14T00:00:00.000Z"),
    timezone: "Asia/Jerusalem",
    locale: "en",
    executors: createV2WorldTools(),
    transferPreparationService: createTransferPreparationService(),
    transferModificationService: createTransferModificationService(),
    pendingConfirmation: null,
    turnOutcome: outcome,
    knownCounterparties: []
  };
  return { configurable };
}

const TLV = { country: "IL", city: "Tel Aviv", lat: 32.0853, lng: 34.7818 };

function located(at: string, kind: "login" | "transfer", transactionId: string | null = null): ActivityEventRecord {
  return {
    id: "6867f00000000000000000aa",
    userId: "any",
    kind,
    at: new Date(at),
    ip: "203.0.113.7",
    geo: TLV,
    transactionId,
    expiresAt: new Date("2027-01-01T00:00:00Z"),
    createdAt: new Date(at),
    updatedAt: new Date(at)
  };
}

function fakeReposRecording(calls: string[]): Repositories {
  return {
    activityEvents: {
      async listRecentByUser(userId: string) {
        calls.push(userId);
        return [
          located("2026-07-01T10:00:00Z", "login"),
          located("2026-07-01T09:00:00Z", "transfer", "6867f00000000000000000ab")
        ];
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

test("getRecentActivity lists located events scoped to the config user", async () => {
  const calls: string[] = [];
  setRepositories(fakeReposRecording(calls));
  const out = await getRecentActivityTool.invoke({ limit: 10 }, makeConfig("any logins from unusual places?"));
  expect(String(out)).toMatch(/Tel Aviv/);
  expect(String(out)).toMatch(/login/i);
  expect(String(out)).toMatch(/6867f00000000000000000ab/);
  expect(calls).toStrictEqual([WORLD.userId]); // authoritative id from configurable, never from the message
});

test("getRecentActivity degrades to text when repositories are unavailable", async () => {
  clearRepositories();
  const out = await getRecentActivityTool.invoke({ limit: 10 }, makeConfig("recent activity"));
  expect(String(out)).toMatch(/unavailable/i);
});
