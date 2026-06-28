// src/personalDetails.service.test.ts


import assert from "node:assert/strict";
import test from "node:test";
import { AppError } from "../utils/app-error.js";
import { personalDetailsService } from "./personalDetails.service.js";
import { setRepositories } from "../repositories/index.js";
import { createMongoRepositories } from "../repositories/mongo/index.js";
import type {
  PersonalDetailsRecord,
  Repositories,
  UserRecord
} from "../repositories/types.js";

// ---------------------------------------------------------------------------
// Helpers — the service now talks to the repository seam, so tests mock the
// `personalDetails` (and `users`) repositories, not the Mongoose model.
// ---------------------------------------------------------------------------

const PD_ID = "507f191e810c19729de860ea";
const USER_ID = "507f1f77bcf86cd799439011";

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
  personalDetails: Partial<Repositories["personalDetails"]>,
  t: test.TestContext
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
  t.after(() => setRepositories(base));
  return { setPersonalDetailsCalls: calls };
}

// ---------------------------------------------------------------------------
// ensureForUser
// ---------------------------------------------------------------------------

test("ensureForUser: returns the record from the repository", async (t) => {
  const record = createDetailsRecord();
  withRepos({ ensureForUser: async () => record }, t);

  const result = await personalDetailsService.ensureForUser(createUserRecord());
  assert.equal(result, record);
});

test("ensureForUser: back-fills the FK via setPersonalDetails when personalDetails is null", async (t) => {
  const record = createDetailsRecord();
  const { setPersonalDetailsCalls } = withRepos({ ensureForUser: async () => record }, t);

  await personalDetailsService.ensureForUser(createUserRecord({ personalDetails: null }));

  assert.equal(setPersonalDetailsCalls.length, 1, "should back-fill the FK once");
  assert.equal(setPersonalDetailsCalls[0]?.id, USER_ID);
  assert.equal(setPersonalDetailsCalls[0]?.personalDetailsId, record.id);
});

test("ensureForUser: does NOT back-fill when user.personalDetails is already set", async (t) => {
  const record = createDetailsRecord();
  const { setPersonalDetailsCalls } = withRepos({ ensureForUser: async () => record }, t);

  await personalDetailsService.ensureForUser(createUserRecord({ personalDetails: PD_ID }));

  assert.equal(setPersonalDetailsCalls.length, 0, "must NOT back-fill when FK already set");
});

test("ensureForUser: idempotent — a record that already has the FK is not back-filled again", async (t) => {
  const record = createDetailsRecord();
  const { setPersonalDetailsCalls } = withRepos({ ensureForUser: async () => record }, t);

  // First call: no FK yet -> exactly one back-fill.
  await personalDetailsService.ensureForUser(createUserRecord({ personalDetails: null }));
  assert.equal(setPersonalDetailsCalls.length, 1);

  // Second call: FK already populated (as after a reload) -> no further back-fill.
  await personalDetailsService.ensureForUser(createUserRecord({ personalDetails: record.id }));
  assert.equal(setPersonalDetailsCalls.length, 1, "second call must NOT back-fill again");
});

// ---------------------------------------------------------------------------
// getForUser
// ---------------------------------------------------------------------------

test("getForUser: returns the record when found", async (t) => {
  const record = createDetailsRecord();
  withRepos({ findByUserId: async (id) => (id === USER_ID ? record : null) }, t);

  const result = await personalDetailsService.getForUser(USER_ID);
  assert.equal(result, record);
});

test("getForUser: returns null when not found", async (t) => {
  withRepos({ findByUserId: async () => null }, t);

  const result = await personalDetailsService.getForUser(USER_ID);
  assert.equal(result, null);
});

// ---------------------------------------------------------------------------
// getDisplayName
// ---------------------------------------------------------------------------

test("getDisplayName: returns firstName/lastName only when status is 'provided'", async (t) => {
  const record = createDetailsRecord({ status: "provided", firstName: "Alice", lastName: "Goldberg" });
  withRepos({ findByUserId: async () => record }, t);

  const result = await personalDetailsService.getDisplayName(USER_ID);
  assert.deepEqual(result, { firstName: "Alice", lastName: "Goldberg" });
});

test("getDisplayName: returns null when status is 'not_provided'", async (t) => {
  const record = createDetailsRecord({ status: "not_provided", firstName: "Bob" });
  withRepos({ findByUserId: async () => record }, t);

  const result = await personalDetailsService.getDisplayName(USER_ID);
  assert.equal(result, null);
});

test("getDisplayName: returns null when no record exists", async (t) => {
  withRepos({ findByUserId: async () => null }, t);

  const result = await personalDetailsService.getDisplayName(USER_ID);
  assert.equal(result, null);
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

test("update: sets status to 'provided' and returns the updated record", async (t) => {
  let capturedPatch: Record<string, unknown> | undefined;
  withRepos(
    {
      update: async (_userId, patch) => {
        capturedPatch = patch as Record<string, unknown>;
        return createDetailsRecord({
          status: "provided",
          firstName: "Carol",
          lastName: "Danvers",
          dateOfBirth: new Date("1990-03-05T00:00:00.000Z")
        });
      }
    },
    t
  );

  const result = await personalDetailsService.update(USER_ID, VALID_INPUT);

  assert.equal(result.status, "provided");
  assert.equal(result.firstName, "Carol");
  assert.equal(result.lastName, "Danvers");
  assert.equal(capturedPatch?.status, "provided");
  assert.ok(capturedPatch?.dateOfBirth instanceof Date, "dateOfBirth must be parsed to a Date");
});

test("update: throws AppError(404) when the record does not exist", async (t) => {
  withRepos({ update: async () => null }, t);

  await assert.rejects(
    () => personalDetailsService.update(USER_ID, VALID_INPUT),
    (err: unknown) => err instanceof AppError && err.status === 404
  );
});

// ---------------------------------------------------------------------------
// markSkipped
// ---------------------------------------------------------------------------

test("markSkipped: sets lastSkippedAt and returns the record", async (t) => {
  const before = Date.now();
  let capturedPatch: Record<string, unknown> | undefined;
  withRepos(
    {
      update: async (_userId, patch) => {
        capturedPatch = patch as Record<string, unknown>;
        return createDetailsRecord({ lastSkippedAt: new Date() });
      }
    },
    t
  );

  const result = await personalDetailsService.markSkipped(USER_ID);

  assert.ok(result.lastSkippedAt instanceof Date);
  assert.ok(capturedPatch?.lastSkippedAt instanceof Date);
  assert.ok((capturedPatch?.lastSkippedAt as Date).getTime() >= before);
});

test("markSkipped: throws AppError(404) when the record does not exist", async (t) => {
  withRepos({ update: async () => null }, t);

  await assert.rejects(
    () => personalDetailsService.markSkipped(USER_ID),
    (err: unknown) => err instanceof AppError && err.status === 404
  );
});
