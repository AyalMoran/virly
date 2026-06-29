// src/personalDetails.service.test.ts

import { AppError } from "../../utils/app-error.js";
import { personalDetailsService } from "../personalDetails.service.js";
import { setRepositories } from "../../repositories/index.js";
import { createMongoRepositories } from "../../repositories/mongo/index.js";
import type {
  PersonalDetailsRecord,
  Repositories,
  UserRecord
} from "../../repositories/types.js";

// ---------------------------------------------------------------------------
// Helpers — the service now talks to the repository seam, so tests mock the
// `personalDetails` (and `users`) repositories, not the Mongoose model.
// ---------------------------------------------------------------------------

const PD_ID = "507f191e810c19729de860ea";
const USER_ID = "507f1f77bcf86cd799439011";

const cleanups: Array<() => void | Promise<void>> = [];
afterEach(async () => { for (const c of cleanups.splice(0).reverse()) await c(); });

function createDetailsRecord(
  overrides: Partial<PersonalDetailsRecord> = {}
): PersonalDetailsRecord {
  return {
    id: PD_ID,
    userId: USER_ID,
    status: "not_provided",
    firstName: null,
    lastName: null,
    dateOfBirth: null,
    address: {},
    lastSkippedAt: null,
    createdAt: new Date("2026-01-01T00:00:00.000Z"),
    updatedAt: new Date("2026-01-01T00:00:00.000Z"),
    ...overrides
  };
}

function createUserRecord(overrides: Partial<UserRecord> = {}): UserRecord {
  return {
    id: USER_ID,
    email: "alice@example.com",
    passwordHash: "placeholder-hash",
    phone: "+972500000000",
    isVerified: true,
    balance: 0,
    role: "user",
    personalDetails: null,
    createdAt: new Date("2026-01-01T00:00:00.000Z"),
    updatedAt: new Date("2026-01-01T00:00:00.000Z"),
    ...overrides
  };
}

/**
 * Install repository stubs. Captures users.setPersonalDetails calls (the FK
 * back-fill) so tests can assert on them.
 */
function withRepos(
  personalDetails: Partial<Repositories["personalDetails"]>
): { setPersonalDetailsCalls: Array<{ id: string; personalDetailsId: string }> } {
  const calls: Array<{ id: string; personalDetailsId: string }> = [];
  const base = createMongoRepositories();
  setRepositories({
    ...base,
    personalDetails: {
      ...base.personalDetails,
      ...personalDetails
    } as Repositories["personalDetails"],
    users: {
      ...base.users,
      setPersonalDetails: async (id: string, personalDetailsId: string) => {
        calls.push({ id, personalDetailsId });
      }
    } as Repositories["users"]
  });
  cleanups.push(() => setRepositories(base));
  return { setPersonalDetailsCalls: calls };
}

// ---------------------------------------------------------------------------
// ensureForUser
// ---------------------------------------------------------------------------

test("ensureForUser: returns the record from the repository", async () => {
  const record = createDetailsRecord();
  withRepos({ ensureForUser: async () => record });

  const result = await personalDetailsService.ensureForUser(createUserRecord());
  expect(result).toBe(record);
});

test("ensureForUser: back-fills the FK via setPersonalDetails when personalDetails is null", async () => {
  const record = createDetailsRecord();
  const { setPersonalDetailsCalls } = withRepos({ ensureForUser: async () => record });

  await personalDetailsService.ensureForUser(createUserRecord({ personalDetails: null }));

  expect(setPersonalDetailsCalls.length).toBe(1);
  expect(setPersonalDetailsCalls[0]?.id).toBe(USER_ID);
  expect(setPersonalDetailsCalls[0]?.personalDetailsId).toBe(record.id);
});

test("ensureForUser: does NOT back-fill when user.personalDetails is already set", async () => {
  const record = createDetailsRecord();
  const { setPersonalDetailsCalls } = withRepos({ ensureForUser: async () => record });

  await personalDetailsService.ensureForUser(createUserRecord({ personalDetails: PD_ID }));

  expect(setPersonalDetailsCalls.length).toBe(0);
});

test("ensureForUser: idempotent — a record that already has the FK is not back-filled again", async () => {
  const record = createDetailsRecord();
  const { setPersonalDetailsCalls } = withRepos({ ensureForUser: async () => record });

  // First call: no FK yet -> exactly one back-fill.
  await personalDetailsService.ensureForUser(createUserRecord({ personalDetails: null }));
  expect(setPersonalDetailsCalls.length).toBe(1);

  // Second call: FK already populated (as after a reload) -> no further back-fill.
  await personalDetailsService.ensureForUser(createUserRecord({ personalDetails: record.id }));
  expect(setPersonalDetailsCalls.length).toBe(1);
});

// ---------------------------------------------------------------------------
// getForUser
// ---------------------------------------------------------------------------

test("getForUser: returns the record when found", async () => {
  const record = createDetailsRecord();
  withRepos({ findByUserId: async (id) => (id === USER_ID ? record : null) });

  const result = await personalDetailsService.getForUser(USER_ID);
  expect(result).toBe(record);
});

test("getForUser: returns null when not found", async () => {
  withRepos({ findByUserId: async () => null });

  const result = await personalDetailsService.getForUser(USER_ID);
  expect(result).toBeNull();
});

// ---------------------------------------------------------------------------
// getDisplayName
// ---------------------------------------------------------------------------

test("getDisplayName: returns firstName/lastName only when status is 'provided'", async () => {
  const record = createDetailsRecord({ status: "provided", firstName: "Alice", lastName: "Goldberg" });
  withRepos({ findByUserId: async () => record });

  const result = await personalDetailsService.getDisplayName(USER_ID);
  expect(result).toStrictEqual({ firstName: "Alice", lastName: "Goldberg" });
});

test("getDisplayName: returns null when status is 'not_provided'", async () => {
  const record = createDetailsRecord({ status: "not_provided", firstName: "Bob" });
  withRepos({ findByUserId: async () => record });

  const result = await personalDetailsService.getDisplayName(USER_ID);
  expect(result).toBeNull();
});

test("getDisplayName: returns null when no record exists", async () => {
  withRepos({ findByUserId: async () => null });

  const result = await personalDetailsService.getDisplayName(USER_ID);
  expect(result).toBeNull();
});

// ---------------------------------------------------------------------------
// update
// ---------------------------------------------------------------------------

const VALID_INPUT = {
  firstName: "Carol",
  lastName: "Danvers",
  dateOfBirth: "1990-03-05",
  address: {
    country: "US",
    stateRegion: null,
    city: "New York",
    street: "5th Ave",
    addressLine2: null,
    postalCode: "10001"
  }
};

test("update: sets status to 'provided' and returns the updated record", async () => {
  let capturedPatch: Record<string, unknown> | undefined;
  withRepos({
    update: async (_userId, patch) => {
      capturedPatch = patch as Record<string, unknown>;
      return createDetailsRecord({
        status: "provided",
        firstName: "Carol",
        lastName: "Danvers",
        dateOfBirth: new Date("1990-03-05T00:00:00.000Z")
      });
    }
  });

  const result = await personalDetailsService.update(USER_ID, VALID_INPUT);

  expect(result.status).toBe("provided");
  expect(result.firstName).toBe("Carol");
  expect(result.lastName).toBe("Danvers");
  expect(capturedPatch?.status).toBe("provided");
  expect(capturedPatch?.dateOfBirth instanceof Date).toBeTruthy();
});

test("update: throws AppError(404) when the record does not exist", async () => {
  withRepos({ update: async () => null });

  const err = await personalDetailsService.update(USER_ID, VALID_INPUT).then(() => null, (e) => e);
  expect(err instanceof AppError && err.status === 404).toBeTruthy();
});

// ---------------------------------------------------------------------------
// markSkipped
// ---------------------------------------------------------------------------

test("markSkipped: sets lastSkippedAt and returns the record", async () => {
  const before = Date.now();
  let capturedPatch: Record<string, unknown> | undefined;
  withRepos({
    update: async (_userId, patch) => {
      capturedPatch = patch as Record<string, unknown>;
      return createDetailsRecord({ lastSkippedAt: new Date() });
    }
  });

  const result = await personalDetailsService.markSkipped(USER_ID);

  expect(result.lastSkippedAt instanceof Date).toBeTruthy();
  expect(capturedPatch?.lastSkippedAt instanceof Date).toBeTruthy();
  expect((capturedPatch?.lastSkippedAt as Date).getTime()).toBeGreaterThanOrEqual(before);
});

test("markSkipped: throws AppError(404) when the record does not exist", async () => {
  withRepos({ update: async () => null });

  const err = await personalDetailsService.markSkipped(USER_ID).then(() => null, (e) => e);
  expect(err instanceof AppError && err.status === 404).toBeTruthy();
});
