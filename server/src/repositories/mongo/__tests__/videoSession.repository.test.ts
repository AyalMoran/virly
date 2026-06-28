

// src/repositories/mongo/videoSession.repository.test.ts
import { VideoSession } from "../../../models/VideoSession.js";
import { mongoVideoSessionRepository } from "../videoSession.repository.js";

const cleanups: Array<() => void | Promise<void>> = [];
afterEach(async () => { for (const c of cleanups.splice(0).reverse()) await c(); });

function patch<T extends object, K extends keyof T>(o: T, k: K, v: T[K]) {
  const orig = o[k];
  o[k] = v;
  cleanups.push(() => { o[k] = orig; });
}

const SESSION_OID = "507f1f77bcf86cd799439099";
const USER_OID   = "507f1f77bcf86cd799439011";
const AGENT_OID  = "507f1f77bcf86cd799439012";

const leanSession = {
  _id: SESSION_OID,
  userId: USER_OID,
  assignedAgentId: null,
  type: "support",
  status: "waiting_for_agent",
  roomName: "virly-support-abc123",
  provider: "jitsi-public-demo",
  topic: null,
  userProblemSummary: null,
  startedAt: null,
  endedAt: null,
  userJoinedAt: null,
  agentJoinedAt: null,
  metadata: { userAgent: null, locale: null, source: "dashboard" },
  createdAt: new Date("2026-01-01T00:00:00.000Z"),
  updatedAt: new Date("2026-01-01T00:00:00.000Z")
};

// ---------------------------------------------------------------------------
// findById
// ---------------------------------------------------------------------------

test("findById: maps lean doc to record — id is string, no _id leaked", async () => {
  const chain = { session: () => chain, lean: async () => leanSession };
  patch(VideoSession, "findOne", ((_f: unknown) => chain) as unknown as typeof VideoSession.findOne);

  const rec = await mongoVideoSessionRepository.findById(SESSION_OID);
  expect(rec).toBeTruthy();
  expect(rec!.id).toBe(SESSION_OID);
  expect((rec as Record<string, unknown>)._id).toBeUndefined();
  expect(rec!.userId).toBe(USER_OID);
  expect(rec!.assignedAgentId).toBeNull();
  expect(rec!.status).toBe("waiting_for_agent");
});

test("findById: queries by _id", async () => {
  let captured: unknown;
  const chain = { session: () => chain, lean: async () => null };
  patch(VideoSession, "findOne", ((f: unknown) => { captured = f; return chain; }) as unknown as typeof VideoSession.findOne);

  await mongoVideoSessionRepository.findById(SESSION_OID);
  expect(captured).toStrictEqual({ _id: SESSION_OID });
});

test("findById: returns null for malformed id without touching model", async () => {
  let called = false;
  patch(VideoSession, "findOne", (() => { called = true; return { session: () => ({}), lean: async () => null }; }) as unknown as typeof VideoSession.findOne);

  const rec = await mongoVideoSessionRepository.findById("not-an-oid");
  expect(rec).toBeNull();
  expect(called).toBe(false);
});

test("findById: passes session when tx provided", async () => {
  let captured: unknown;
  const fakeSession = { id: "s1" };
  const chain = { session(s: unknown) { captured = s; return chain; }, lean: async () => leanSession };
  patch(VideoSession, "findOne", ((_f: unknown) => chain) as unknown as typeof VideoSession.findOne);

  await mongoVideoSessionRepository.findById(SESSION_OID, fakeSession);
  expect(captured).toBe(fakeSession);
});

test("findById: stringifies non-null assignedAgentId", async () => {
  const withAgent = { ...leanSession, assignedAgentId: { toString: () => AGENT_OID } };
  const chain = { session: () => chain, lean: async () => withAgent };
  patch(VideoSession, "findOne", ((_f: unknown) => chain) as unknown as typeof VideoSession.findOne);

  const rec = await mongoVideoSessionRepository.findById(SESSION_OID);
  expect(rec).toBeTruthy();
  expect(rec!.assignedAgentId).toBe(AGENT_OID);
});

// ---------------------------------------------------------------------------
// findByRoomName
// ---------------------------------------------------------------------------

test("findByRoomName: queries by roomName and maps record", async () => {
  let captured: unknown;
  const chain = { session: () => chain, lean: async () => leanSession };
  patch(VideoSession, "findOne", ((f: unknown) => { captured = f; return chain; }) as unknown as typeof VideoSession.findOne);

  const rec = await mongoVideoSessionRepository.findByRoomName("virly-support-abc123");
  expect(rec).toBeTruthy();
  expect(rec!.roomName).toBe("virly-support-abc123");
  expect(captured).toStrictEqual({ roomName: "virly-support-abc123" });
});

// ---------------------------------------------------------------------------
// create
// ---------------------------------------------------------------------------

test("create: inserts and returns a record (toObject path)", async () => {
  let capturedDocs: unknown;
  patch(
    VideoSession,
    "create",
    (async (docs: unknown, _opts: unknown) => {
      capturedDocs = docs;
      return [{ ...leanSession, toObject: () => leanSession }];
    }) as unknown as typeof VideoSession.create
  );

  const rec = await mongoVideoSessionRepository.create({
    userId: USER_OID,
    assignedAgentId: null,
    type: "support",
    status: "waiting_for_agent",
    roomName: "virly-support-abc123",
    provider: "jitsi-public-demo",
    topic: null,
    userProblemSummary: null,
    startedAt: null,
    endedAt: null,
    userJoinedAt: null,
    agentJoinedAt: null,
    metadata: { userAgent: null, locale: null, source: "dashboard" }
  });

  expect(rec).toBeTruthy();
  expect(rec.id).toBe(SESSION_OID);
  expect((rec as Record<string, unknown>)._id).toBeUndefined();
  expect(Array.isArray(capturedDocs)).toBeTruthy();
});

test("create: passes session in options when tx provided", async () => {
  let capturedOpts: Record<string, unknown> = {};
  const fakeSession = { id: "s1" };
  patch(
    VideoSession,
    "create",
    (async (_docs: unknown, opts: Record<string, unknown>) => {
      capturedOpts = opts;
      return [{ ...leanSession, toObject: () => leanSession }];
    }) as unknown as typeof VideoSession.create
  );

  await mongoVideoSessionRepository.create(
    {
      userId: USER_OID, assignedAgentId: null, type: "support",
      status: "waiting_for_agent", roomName: "virly-support-abc123",
      provider: "jitsi-public-demo", topic: null, userProblemSummary: null,
      startedAt: null, endedAt: null, userJoinedAt: null, agentJoinedAt: null,
      metadata: { userAgent: null, locale: null, source: "dashboard" }
    },
    fakeSession
  );
  expect(capturedOpts.session).toBe(fakeSession);
});

// ---------------------------------------------------------------------------
// update
// ---------------------------------------------------------------------------

test("update: calls findOneAndUpdate with $set patch and { new: true }", async () => {
  let capturedFilter: unknown;
  let capturedUpdate: unknown;
  let capturedOpts: Record<string, unknown> = {};
  patch(
    VideoSession,
    "findOneAndUpdate",
    (async (f: unknown, u: unknown, o: Record<string, unknown>) => {
      capturedFilter = f; capturedUpdate = u; capturedOpts = o;
      return { ...leanSession, status: "active", toObject: () => ({ ...leanSession, status: "active" }) };
    }) as unknown as typeof VideoSession.findOneAndUpdate
  );

  const rec = await mongoVideoSessionRepository.update(SESSION_OID, { status: "active" });
  expect(rec).toBeTruthy();
  expect(rec!.status).toBe("active");
  expect(capturedFilter).toStrictEqual({ _id: SESSION_OID });
  expect((capturedUpdate as Record<string, unknown>).$set).toStrictEqual({ status: "active" });
  expect(capturedOpts.new).toBe(true);
});

test("update: returns null for malformed id", async () => {
  let called = false;
  patch(VideoSession, "findOneAndUpdate", (async () => { called = true; return null; }) as unknown as typeof VideoSession.findOneAndUpdate);

  const rec = await mongoVideoSessionRepository.update("bad-id", { status: "active" });
  expect(rec).toBeNull();
  expect(called).toBe(false);
});

test("update: returns null when no doc matches", async () => {
  patch(VideoSession, "findOneAndUpdate", (async () => null) as unknown as typeof VideoSession.findOneAndUpdate);

  const rec = await mongoVideoSessionRepository.update(SESSION_OID, { status: "active" });
  expect(rec).toBeNull();
});

// ---------------------------------------------------------------------------
// listForUser
// ---------------------------------------------------------------------------

test("listForUser: filters by userId and sorts newest-first", async () => {
  let capturedFilter: unknown;
  let sortSpec: unknown;
  const chain = {
    sort(s: unknown) { sortSpec = s; return chain; },
    session: () => chain,
    lean: async () => [leanSession]
  };
  patch(VideoSession, "find", ((f: unknown) => { capturedFilter = f; return chain; }) as unknown as typeof VideoSession.find);

  const recs = await mongoVideoSessionRepository.listForUser(USER_OID);
  expect(recs.length).toBe(1);
  expect(recs[0].id).toBe(SESSION_OID);
  expect((recs[0] as Record<string, unknown>)._id).toBeUndefined();
  expect(capturedFilter).toStrictEqual({ userId: USER_OID });
  expect(sortSpec).toStrictEqual({ createdAt: -1 });
});

// ---------------------------------------------------------------------------
// listForAgentQueue
// ---------------------------------------------------------------------------

function agentQueueChain(captured: { filter?: Record<string, unknown>; sort?: unknown; limit?: number; session?: unknown }) {
  const chain: Record<string, unknown> = {
    sort: (spec: unknown) => { captured.sort = spec; return chain; },
    limit: (n: number) => { captured.limit = n; return chain; },
    session: (s: unknown) => { captured.session = s; return chain; },
    lean: async () => [leanSession]
  };
  return chain;
}

test("listForAgentQueue: single type -> exact type filter, no status, newest-first, limited", async () => {
  const captured: { filter?: Record<string, unknown>; sort?: unknown; limit?: number } = {};
  patch(VideoSession, "find", ((f: Record<string, unknown>) => { captured.filter = f; return agentQueueChain(captured); }) as unknown as typeof VideoSession.find);

  const recs = await mongoVideoSessionRepository.listForAgentQueue({ types: ["support"], limit: 50 });
  expect(recs.length).toBe(1);
  expect(captured.filter?.type).toBe("support");
  expect(captured.filter?.status).toBeUndefined();
  expect(captured.sort).toStrictEqual({ createdAt: -1 });
  expect(captured.limit).toBe(50);
});

test("listForAgentQueue: multiple types -> $in filter", async () => {
  const captured: { filter?: Record<string, unknown> } = {};
  patch(VideoSession, "find", ((f: Record<string, unknown>) => { captured.filter = f; return agentQueueChain(captured); }) as unknown as typeof VideoSession.find);

  await mongoVideoSessionRepository.listForAgentQueue({ types: ["support", "sales"], limit: 50 });
  expect(captured.filter?.type).toStrictEqual({ $in: ["support", "sales"] });
});

test("listForAgentQueue: applies exact status filter when provided (incl. terminal)", async () => {
  const captured: { filter?: Record<string, unknown> } = {};
  patch(VideoSession, "find", ((f: Record<string, unknown>) => { captured.filter = f; return agentQueueChain(captured); }) as unknown as typeof VideoSession.find);

  await mongoVideoSessionRepository.listForAgentQueue({ types: ["support"], status: "ended", limit: 50 });
  expect(captured.filter?.status).toBe("ended");
});

test("listForAgentQueue: forwards session when tx provided", async () => {
  const captured: { session?: unknown } = {};
  patch(VideoSession, "find", (() => agentQueueChain(captured)) as unknown as typeof VideoSession.find);

  const fakeSession = { id: "tx-1" };
  await mongoVideoSessionRepository.listForAgentQueue({ types: ["support"], limit: 10 }, fakeSession);
  expect(captured.session).toBe(fakeSession);
});
