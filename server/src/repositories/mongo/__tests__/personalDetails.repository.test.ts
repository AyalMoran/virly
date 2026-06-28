
// src/repositories/mongo/personalDetails.repository.test.ts
import { PersonalDetails } from "../../../models/PersonalDetails.js";
import { mongoPersonalDetailsRepository } from "../personalDetails.repository.js";

const cleanups: Array<() => void | Promise<void>> = [];
afterEach(async () => { for (const c of cleanups.splice(0).reverse()) await c(); });

function patch<T extends object, K extends keyof T>(o: T, k: K, v: T[K]) {
  const orig = o[k]; o[k] = v; cleanups.push(() => { o[k] = orig; });
}

const USER_OID = "507f1f77bcf86cd799439011";
const PD_OID   = "507f191e810c19729de860ea";

const leanPd = {
  _id: PD_OID,
  userId: USER_OID,
  status: "not_provided",
  firstName: null,
  lastName: null,
  dateOfBirth: null,
  address: {},
  lastSkippedAt: null,
  createdAt: new Date("2026-01-01T00:00:00.000Z"),
  updatedAt: new Date("2026-01-01T00:00:00.000Z")
};

// ---------------------------------------------------------------------------
// findByUserId
// ---------------------------------------------------------------------------

test("findByUserId: maps lean doc to PersonalDetailsRecord with string id", async () => {
  const fakeChain = { session: () => fakeChain, lean: async () => leanPd };
  patch(
    PersonalDetails,
    "findOne",
    ((_filter: unknown) => fakeChain) as unknown as typeof PersonalDetails.findOne
  );

  const rec = await mongoPersonalDetailsRepository.findByUserId(USER_OID);

  expect(rec).toBeTruthy();
  expect(rec!.id).toBe(PD_OID);
  expect((rec as Record<string, unknown>)._id).toBeUndefined();
  expect(rec!.userId).toBe(USER_OID);
  expect(rec!.status).toBe("not_provided");
});

test("findByUserId: returns null when not found", async () => {
  const fakeChain = { session: () => fakeChain, lean: async () => null };
  patch(
    PersonalDetails,
    "findOne",
    ((_filter: unknown) => fakeChain) as unknown as typeof PersonalDetails.findOne
  );

  const rec = await mongoPersonalDetailsRepository.findByUserId(USER_OID);
  expect(rec).toBeNull();
});

test("findByUserId: queries by userId field", async () => {
  let capturedFilter: unknown;
  const fakeChain = { session: () => fakeChain, lean: async () => null };
  patch(
    PersonalDetails,
    "findOne",
    ((filter: unknown) => { capturedFilter = filter; return fakeChain; }) as unknown as typeof PersonalDetails.findOne
  );

  await mongoPersonalDetailsRepository.findByUserId(USER_OID);
  expect(capturedFilter).toStrictEqual({ userId: USER_OID });
});

// ---------------------------------------------------------------------------
// ensureForUser
// ---------------------------------------------------------------------------

test("ensureForUser: calls findOneAndUpdate with upsert and returns record", async () => {
  let capturedFilter: unknown;
  let capturedUpdate: unknown;
  let capturedOpts: unknown;

  patch(
    PersonalDetails,
    "findOneAndUpdate",
    (async (filter: unknown, update: unknown, opts: unknown) => {
      capturedFilter = filter;
      capturedUpdate = update;
      capturedOpts = opts;
      return { ...leanPd, toObject: () => leanPd };
    }) as unknown as typeof PersonalDetails.findOneAndUpdate
  );

  const rec = await mongoPersonalDetailsRepository.ensureForUser(USER_OID);

  expect(rec).toBeTruthy();
  expect(rec.id).toBe(PD_OID);
  expect((rec as Record<string, unknown>)._id).toBeUndefined();
  expect(rec.userId).toBe(USER_OID);
  expect(capturedFilter).toStrictEqual({ userId: USER_OID });
  expect((capturedOpts as Record<string, unknown>).upsert).toBe(true);
  expect((capturedOpts as Record<string, unknown>).new).toBe(true);
  // Must seed userId on insert
  const setOnInsert = (capturedUpdate as { $setOnInsert?: Record<string, unknown> }).$setOnInsert;
  expect(setOnInsert).toBeTruthy();
  expect(setOnInsert!.userId).toBe(USER_OID);
  expect(setOnInsert!.status).toBe("not_provided");
});

test("ensureForUser: returns a record without _id when existing doc found", async () => {
  patch(
    PersonalDetails,
    "findOneAndUpdate",
    (async () => ({ ...leanPd, toObject: () => leanPd })) as unknown as typeof PersonalDetails.findOneAndUpdate
  );

  const rec = await mongoPersonalDetailsRepository.ensureForUser(USER_OID);
  expect(rec.id).toBe(PD_OID);
  expect((rec as Record<string, unknown>)._id).toBeUndefined();
});

// ---------------------------------------------------------------------------
// update
// ---------------------------------------------------------------------------

test("update: calls findOneAndUpdate with $set patch and returns updated record", async () => {
  let capturedFilter: unknown;
  let capturedUpdate: unknown;
  let capturedOpts: unknown;

  const updatedLean = {
    ...leanPd,
    status: "provided",
    firstName: "Alice",
    lastName: "Smith",
    dateOfBirth: new Date("1990-05-15T00:00:00.000Z")
  };

  patch(
    PersonalDetails,
    "findOneAndUpdate",
    (async (filter: unknown, update: unknown, opts: unknown) => {
      capturedFilter = filter;
      capturedUpdate = update;
      capturedOpts = opts;
      return { ...updatedLean, toObject: () => updatedLean };
    }) as unknown as typeof PersonalDetails.findOneAndUpdate
  );

  const rec = await mongoPersonalDetailsRepository.update(USER_OID, {
    status: "provided",
    firstName: "Alice",
    lastName: "Smith",
    dateOfBirth: new Date("1990-05-15T00:00:00.000Z")
  });

  expect(rec).toBeTruthy();
  expect(rec!.id).toBe(PD_OID);
  expect((rec as Record<string, unknown>)._id).toBeUndefined();
  expect(rec!.status).toBe("provided");
  expect(rec!.firstName).toBe("Alice");
  expect(capturedFilter).toStrictEqual({ userId: USER_OID });
  expect((capturedUpdate as Record<string, unknown>).$set).toBeTruthy();
  expect((capturedOpts as Record<string, unknown>).new).toBe(true);
});

test("update: spreads patch fields into $set (address stays a plain object)", async () => {
  let capturedUpdate: unknown;

  const updatedLean = {
    ...leanPd,
    address: { country: "US", city: "NY", street: "5th Ave", postalCode: "10001", stateRegion: null, addressLine2: null }
  };

  patch(
    PersonalDetails,
    "findOneAndUpdate",
    (async (_f: unknown, update: unknown) => {
      capturedUpdate = update;
      return { ...updatedLean, toObject: () => updatedLean };
    }) as unknown as typeof PersonalDetails.findOneAndUpdate
  );

  await mongoPersonalDetailsRepository.update(USER_OID, {
    address: { country: "US", city: "NY", street: "5th Ave", postalCode: "10001", stateRegion: null, addressLine2: null }
  });

  const setClause = (capturedUpdate as { $set?: Record<string, unknown> }).$set ?? {};
  expect(setClause.address).toStrictEqual({
    country: "US", city: "NY", street: "5th Ave", postalCode: "10001", stateRegion: null, addressLine2: null
  });
});

test("update: passes session when tx context is provided", async () => {
  let capturedOpts: unknown;
  const fakeSession = { id: "fake-session" };

  patch(
    PersonalDetails,
    "findOneAndUpdate",
    (async (_f: unknown, _u: unknown, opts: unknown) => {
      capturedOpts = opts;
      return { ...leanPd, toObject: () => leanPd };
    }) as unknown as typeof PersonalDetails.findOneAndUpdate
  );

  await mongoPersonalDetailsRepository.update(USER_OID, { status: "provided" }, fakeSession);
  expect((capturedOpts as Record<string, unknown>).session).toBe(fakeSession);
});

test("update: returns null when no doc exists for the user", async () => {
  patch(
    PersonalDetails,
    "findOneAndUpdate",
    (async () => null) as unknown as typeof PersonalDetails.findOneAndUpdate
  );

  const rec = await mongoPersonalDetailsRepository.update(USER_OID, { status: "provided" });
  expect(rec).toBeNull();
});

// ---------------------------------------------------------------------------
// findProvidedByUserIds
// ---------------------------------------------------------------------------

test("findProvidedByUserIds: filters by $in userIds + provided, maps records", async () => {
  let captured: Record<string, unknown> = {};
  const chain = {
    session: () => chain,
    lean: async () => [{ ...leanPd, status: "provided", firstName: "Alice" }]
  };
  patch(
    PersonalDetails,
    "find",
    ((f: Record<string, unknown>) => { captured = f; return chain; }) as unknown as typeof PersonalDetails.find
  );

  const recs = await mongoPersonalDetailsRepository.findProvidedByUserIds([USER_OID]);
  expect(recs.length).toBe(1);
  expect(recs[0].id).toBe(PD_OID);
  expect((recs[0] as Record<string, unknown>)._id).toBeUndefined();
  expect((captured.userId as { $in: string[] }).$in).toStrictEqual([USER_OID]);
  expect(captured.status).toBe("provided");
});

// ---------------------------------------------------------------------------
// findProvidedByName
// ---------------------------------------------------------------------------

test("findProvidedByName: case-insensitive first+last name match, provided, limited", async () => {
  let captured: Record<string, unknown> = {};
  let limitVal: unknown;
  const chain = {
    limit(n: unknown) { limitVal = n; return chain; },
    session: () => chain,
    lean: async () => [{ ...leanPd, status: "provided", firstName: "Alice", lastName: "Smith" }]
  };
  patch(
    PersonalDetails,
    "find",
    ((f: Record<string, unknown>) => { captured = f; return chain; }) as unknown as typeof PersonalDetails.find
  );

  const recs = await mongoPersonalDetailsRepository.findProvidedByName({
    firstName: "alice",
    lastName: "smith",
    limit: 2
  });
  expect(recs.length).toBe(1);
  expect(captured.status).toBe("provided");
  expect(captured.firstName).toBeInstanceOf(RegExp);
  expect((captured.firstName as RegExp).test("ALICE")).toBeTruthy();
  expect(captured.lastName).toBeInstanceOf(RegExp);
  expect((captured.lastName as RegExp).test("SMITH")).toBeTruthy();
  expect(limitVal).toBe(2);
});

test("findProvidedByName: omits lastName constraint when not supplied", async () => {
  let captured: Record<string, unknown> = {};
  const chain = {
    limit: () => chain,
    session: () => chain,
    lean: async () => []
  };
  patch(
    PersonalDetails,
    "find",
    ((f: Record<string, unknown>) => { captured = f; return chain; }) as unknown as typeof PersonalDetails.find
  );

  await mongoPersonalDetailsRepository.findProvidedByName({ firstName: "alice", limit: 2 });
  expect("lastName" in captured).toBe(false);
});
