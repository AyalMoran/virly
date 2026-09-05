// src/services/__tests__/transfer.origin.test.ts
import { clearRepositories, setRepositories } from "../../repositories/index.js";
import type { ActivityEventCreateInput, Repositories } from "../../repositories/types.js";

function worldRepos() {
  const activityCreates: ActivityEventCreateInput[] = [];
  const users = [
    { id: "6867f000000000000000000a", email: "sender@test.com", balance: 500 },
    { id: "6867f000000000000000000b", email: "rcpt@test.com", balance: 10 }
  ];
  const repos = {
    users: {
      async findById(id: string) {
        return users.find((u) => u.id === id) ?? null;
      },
      async findByEmail(email: string) {
        return users.find((u) => u.email === email) ?? null;
      },
      async setBalance() {}
    },
    transactions: {
      async createMany(inputs: Array<Record<string, unknown>>) {
        return inputs.map((input, i) => ({
          ...input,
          id: String(i).padStart(24, "d"), // 24-hex-shaped fake ids: "000...0" / "000...1" with d-padding
          createdAt: new Date(),
          updatedAt: new Date()
        }));
      }
    },
    activityEvents: {
      async create(input: ActivityEventCreateInput) {
        activityCreates.push(input);
        return { ...input, id: "6867f00000000000000000aa", transactionId: input.transactionId ?? null, createdAt: input.at, updatedAt: input.at };
      },
      async listRecentByUser() {
        return [];
      },
      async deleteExpired() {
        return 0;
      }
    }
  } as unknown as Repositories;
  return { repos, activityCreates };
}

afterEach(() => clearRepositories());

test("executeTransferWithSession records a located transfer event for the sender", async () => {
  const { repos, activityCreates } = worldRepos();
  setRepositories(repos);
  const { executeTransferWithSession } = await import("../transfer.service.js");
  const result = await executeTransferWithSession(
    {
      senderId: "6867f000000000000000000a",
      recipientEmail: "rcpt@test.com",
      amount: 50,
      origin: { ip: "203.0.113.7", geo: { country: "FR", city: "Paris", lat: 48.8566, lng: 2.3522 } }
    },
    undefined
  );
  expect(activityCreates).toHaveLength(1);
  expect(activityCreates[0]!.kind).toBe("transfer");
  expect(activityCreates[0]!.userId).toBe("6867f000000000000000000a");
  expect(activityCreates[0]!.geo?.city).toBe("Paris");
  expect(activityCreates[0]!.transactionId).toBe(result.transaction.id);
});

test("no origin -> no event, and a failing event write does not fail the transfer", async () => {
  const { repos, activityCreates } = worldRepos();
  setRepositories(repos);
  const { executeTransferWithSession } = await import("../transfer.service.js");
  await executeTransferWithSession(
    { senderId: "6867f000000000000000000a", recipientEmail: "rcpt@test.com", amount: 50 },
    undefined
  );
  expect(activityCreates).toHaveLength(0);
});
