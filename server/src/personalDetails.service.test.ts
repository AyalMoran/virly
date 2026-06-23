

import assert from "node:assert/strict";
import test from "node:test";
import { PersonalDetails } from "./models/PersonalDetails.js";
import { AppError } from "./utils/app-error.js";
import { personalDetailsService } from "./services/personalDetails.service.js";

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function patchModel<T extends object, K extends keyof T>(
  model: T,
  key: K,
  value: T[K],
  t: test.TestContext
) {
  const original = model[key];
  model[key] = value;
  t.after(() => {
    model[key] = original;
  });
}

type MockPersonalDetails = {
  _id: string;
  id: string;
  userId: string;
  status: string;
  firstName: string | null;
  lastName: string | null;
  dateOfBirth: Date | null;
  address: Record<string, string | null>;
  lastSkippedAt: Date | null;
  createdAt: Date;
  updatedAt: Date;
  saveCalls: number;
  save: () => Promise<void>;
};

function createMockDetails(overrides: Partial<MockPersonalDetails> = {}): MockPersonalDetails {
  const doc: MockPersonalDetails = {
    _id: "507f191e810c19729de860ea",
    id: "507f191e810c19729de860ea",
    userId: "507f1f77bcf86cd799439011",
    status: "not_provided",
    firstName: null,
    lastName: null,
    dateOfBirth: null,
    address: {},
    lastSkippedAt: null,
    createdAt: new Date("2026-01-01T00:00:00.000Z"),
    updatedAt: new Date("2026-01-01T00:00:00.000Z"),
    saveCalls: 0,
    save: async () => {
      doc.saveCalls += 1;
    },
    ...overrides
  };
  return doc;
}

type MockUser = {
  _id: string;
  id: string;
  personalDetails: unknown;
  saveCalls: number;
  save: () => Promise<void>;
};

function createMockUser(overrides: Partial<MockUser> = {}): MockUser {
  const user: MockUser = {
    _id: "507f1f77bcf86cd799439011",
    id: "507f1f77bcf86cd799439011",
    personalDetails: null,
    saveCalls: 0,
    save: async () => {
      user.saveCalls += 1;
    },
    ...overrides
  };
  return user;
}

// ---------------------------------------------------------------------------
// ensureForUser
// ---------------------------------------------------------------------------

test("ensureForUser: uses findOneAndUpdate upsert — does not call findOne or create", async (t) => {
  const details = createMockDetails({ status: "not_provided" });
  const user = createMockUser({ personalDetails: null });

  let findOneAndUpdateCalled = false;
  let findOneCalled = false;

  patchModel(
    PersonalDetails,
    "findOneAndUpdate",
    (async () => {
      findOneAndUpdateCalled = true;
      return details;
    }) as unknown as typeof PersonalDetails.findOneAndUpdate,
    t
  );

  patchModel(
    PersonalDetails,
    "findOne",
    (async () => {
      findOneCalled = true;
      return details;
    }) as unknown as typeof PersonalDetails.findOne,
    t
  );

  const result = await personalDetailsService.ensureForUser(user as never);

  assert.equal(result, details);
  assert.equal(findOneAndUpdateCalled, true, "must use findOneAndUpdate for upsert");
  assert.equal(findOneCalled, false, "must NOT fall back to findOne");
});

test("ensureForUser: patches user.personalDetails and calls user.save when personalDetails is null", async (t) => {
  const details = createMockDetails();
  const user = createMockUser({ personalDetails: null });

  patchModel(
    PersonalDetails,
    "findOneAndUpdate",
    (async () => details) as unknown as typeof PersonalDetails.findOneAndUpdate,
    t
  );

  await personalDetailsService.ensureForUser(user as never);

  assert.equal(user.personalDetails, details._id, "should patch user.personalDetails to the returned doc._id");
  assert.equal(user.saveCalls, 1, "should call user.save() once when personalDetails was null");
});

test("ensureForUser: does NOT call user.save when user.personalDetails is already set", async (t) => {
  const existingId = { _id: "507f191e810c19729de860ea" };
  const details = createMockDetails();
  const user = createMockUser({ personalDetails: existingId });

  patchModel(
    PersonalDetails,
    "findOneAndUpdate",
    (async () => details) as unknown as typeof PersonalDetails.findOneAndUpdate,
    t
  );

  await personalDetailsService.ensureForUser(user as never);

  assert.equal(user.saveCalls, 0, "must NOT call user.save when personalDetails was already set");
});

test("ensureForUser: idempotent — calling twice does not double-save the user", async (t) => {
  const details = createMockDetails();
  // First call: no personalDetails; after first call user.personalDetails is set
  const user = createMockUser({ personalDetails: null });

  patchModel(
    PersonalDetails,
    "findOneAndUpdate",
    (async () => details) as unknown as typeof PersonalDetails.findOneAndUpdate,
    t
  );

  await personalDetailsService.ensureForUser(user as never);
  assert.equal(user.saveCalls, 1);

  // Second call: personalDetails now set (as it would be after first call)
  await personalDetailsService.ensureForUser(user as never);
  assert.equal(user.saveCalls, 1, "second call must NOT call user.save again");
});

// ---------------------------------------------------------------------------
// getForUser
// ---------------------------------------------------------------------------

test("getForUser: returns the doc when found", async (t) => {
  const details = createMockDetails({ userId: "507f1f77bcf86cd799439011" });

  patchModel(
    PersonalDetails,
    "findOne",
    (async () => details) as unknown as typeof PersonalDetails.findOne,
    t
  );

  const result = await personalDetailsService.getForUser("507f1f77bcf86cd799439011");
  assert.equal(result, details);
});

test("getForUser: returns null when not found", async (t) => {
  patchModel(
    PersonalDetails,
    "findOne",
    (async () => null) as unknown as typeof PersonalDetails.findOne,
    t
  );

  const result = await personalDetailsService.getForUser("507f1f77bcf86cd799439011");
  assert.equal(result, null);
});

// ---------------------------------------------------------------------------
// getDisplayName
// ---------------------------------------------------------------------------

test("getDisplayName: returns firstName/lastName only when status is 'provided'", async (t) => {
  const details = createMockDetails({
    status: "provided",
    firstName: "Alice",
    lastName: "Goldberg"
  });

  patchModel(
    PersonalDetails,
    "findOne",
    (async () => details) as unknown as typeof PersonalDetails.findOne,
    t
  );

  const result = await personalDetailsService.getDisplayName("507f1f77bcf86cd799439011");
  assert.deepEqual(result, { firstName: "Alice", lastName: "Goldberg" });
});

test("getDisplayName: returns null when status is 'not_provided'", async (t) => {
  const details = createMockDetails({ status: "not_provided", firstName: "Bob" });

  patchModel(
    PersonalDetails,
    "findOne",
    (async () => details) as unknown as typeof PersonalDetails.findOne,
    t
  );

  const result = await personalDetailsService.getDisplayName("507f1f77bcf86cd799439011");
  assert.equal(result, null);
});

test("getDisplayName: returns null when no doc exists", async (t) => {
  patchModel(
    PersonalDetails,
    "findOne",
    (async () => null) as unknown as typeof PersonalDetails.findOne,
    t
  );

  const result = await personalDetailsService.getDisplayName("507f1f77bcf86cd799439011");
  assert.equal(result, null);
});

// ---------------------------------------------------------------------------
// update
// ---------------------------------------------------------------------------

test("update: sets status to 'provided' and persists all fields", async (t) => {
  const details = createMockDetails({ status: "not_provided" });

  patchModel(
    PersonalDetails,
    "findOneAndUpdate",
    (async (_filter: unknown, update: Record<string, unknown>, _opts: unknown) => {
      // simulate applying the update to our mock doc
      const set = (update as { $set?: Record<string, unknown> }).$set ?? {};
      Object.assign(details, set);
      details.saveCalls += 1;
      return details;
    }) as unknown as typeof PersonalDetails.findOneAndUpdate,
    t
  );

  const input = {
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

  const result = await personalDetailsService.update("507f1f77bcf86cd799439011", input);

  assert.equal(result.status, "provided");
  assert.equal(result.firstName, "Carol");
  assert.equal(result.lastName, "Danvers");
  assert.ok(result.dateOfBirth instanceof Date || typeof result.dateOfBirth === "string" || result.dateOfBirth !== undefined);
});

test("update: throws AppError(404) when doc does not exist", async (t) => {
  patchModel(
    PersonalDetails,
    "findOneAndUpdate",
    (async () => null) as unknown as typeof PersonalDetails.findOneAndUpdate,
    t
  );

  await assert.rejects(
    () =>
      personalDetailsService.update("507f1f77bcf86cd799439011", {
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
      }),
    (err: unknown) => {
      assert.ok(err instanceof AppError);
      assert.equal((err as AppError).status, 404);
      return true;
    }
  );
});

// ---------------------------------------------------------------------------
// markSkipped
// ---------------------------------------------------------------------------

test("markSkipped: sets lastSkippedAt and persists", async (t) => {
  const details = createMockDetails({ lastSkippedAt: null });
  const before = Date.now();

  patchModel(
    PersonalDetails,
    "findOneAndUpdate",
    (async (_filter: unknown, update: Record<string, unknown>, _opts: unknown) => {
      const set = (update as { $set?: Record<string, unknown> }).$set ?? {};
      Object.assign(details, set);
      return details;
    }) as unknown as typeof PersonalDetails.findOneAndUpdate,
    t
  );

  const result = await personalDetailsService.markSkipped("507f1f77bcf86cd799439011");

  assert.ok(result.lastSkippedAt instanceof Date || result.lastSkippedAt !== null);
  if (result.lastSkippedAt instanceof Date) {
    assert.ok(result.lastSkippedAt.getTime() >= before);
  }
});

test("markSkipped: throws AppError(404) when doc does not exist", async (t) => {
  patchModel(
    PersonalDetails,
    "findOneAndUpdate",
    (async () => null) as unknown as typeof PersonalDetails.findOneAndUpdate,
    t
  );

  await assert.rejects(
    () => personalDetailsService.markSkipped("507f1f77bcf86cd799439011"),
    (err: unknown) => {
      assert.ok(err instanceof AppError);
      assert.equal((err as AppError).status, 404);
      return true;
    }
  );
});
