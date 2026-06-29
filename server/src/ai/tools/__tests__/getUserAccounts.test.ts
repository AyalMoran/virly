import { setRepositories, clearRepositories } from "../../../repositories/index.js";
import { createMongoRepositories } from "../../../repositories/mongo/index.js";
import { getUserAccounts } from "../getUserAccounts.js";
import type { ToolContext } from "../../state.js";
import type { PublicUserRecord } from "../../../repositories/types.js";

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function makeContext(userId = "user1"): ToolContext {
  return { userId, conversationId: "conv1", message: "what are my accounts?" };
}

function stubUserRecord(overrides: Partial<PublicUserRecord> = {}): PublicUserRecord {
  return {
    id: "user1",
    email: "alice@example.com",
    phone: "+972501234567",
    isVerified: true,
    personalDetails: null,
    balance: 1000,
    role: "user",
    createdAt: new Date(),
    updatedAt: new Date(),
    ...overrides
  };
}

function makeRepos(userStub: PublicUserRecord | null) {
  const base = createMongoRepositories();
  return {
    ...base,
    users: {
      ...base.users,
      findByIdSafe: async (_id: string) => userStub
    }
  };
}

// ---------------------------------------------------------------------------
// Tests
// ---------------------------------------------------------------------------

afterEach(() => {
  clearRepositories();
});

describe("getUserAccounts - user found", () => {
  it("returns status ok with Virly account label", async () => {
    setRepositories(makeRepos(stubUserRecord()) as ReturnType<typeof createMongoRepositories>);
    const result = await getUserAccounts(makeContext());
    expect(result.status).toBe("ok");
    expect(result.toolName).toBe("getUserAccounts");
    const data = result.data as { accountLabel: string };
    expect(data.accountLabel).toBe("Virly account");
  });

  it("metadata has recordCount of 1", async () => {
    setRepositories(makeRepos(stubUserRecord()) as ReturnType<typeof createMongoRepositories>);
    const result = await getUserAccounts(makeContext());
    const meta = (result.displayData as { metadata: { recordCount: number } }).metadata;
    expect(meta.recordCount).toBe(1);
  });

  it("summary is 'Virly account'", async () => {
    setRepositories(makeRepos(stubUserRecord()) as ReturnType<typeof createMongoRepositories>);
    const result = await getUserAccounts(makeContext());
    const summary = (result.displayData as { summary: string }).summary;
    expect(summary).toBe("Virly account");
  });

  it("account label is the same for any userId", async () => {
    setRepositories(makeRepos(stubUserRecord({ id: "user99" })) as ReturnType<typeof createMongoRepositories>);
    const result = await getUserAccounts(makeContext("user99"));
    const data = result.data as { accountLabel: string };
    expect(data.accountLabel).toBe("Virly account");
  });
});

describe("getUserAccounts - user not found", () => {
  it("throws an error with status 404 when user is missing", async () => {
    setRepositories(makeRepos(null) as ReturnType<typeof createMongoRepositories>);
    await expect(getUserAccounts(makeContext("missing-user"))).rejects.toThrow(
      "Authenticated account not found."
    );
  });

  it("thrown error has status 404", async () => {
    setRepositories(makeRepos(null) as ReturnType<typeof createMongoRepositories>);
    let thrownError: unknown;
    try {
      await getUserAccounts(makeContext());
    } catch (err) {
      thrownError = err;
    }
    expect((thrownError as { status: number }).status).toBe(404);
  });
});
