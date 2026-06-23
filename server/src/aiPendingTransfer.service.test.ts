

import assert from "node:assert/strict";
import test from "node:test";
import { AiPendingTransfer } from "./models/AiPendingTransfer.js";
import { getResumablePendingForUser } from "./services/aiPendingTransfer.service.js";

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

type MockPending = {
  _id: string;
  userId: string;
  conversationId: string;
};

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

// Simulate Mongoose .select().lean() chaining — returns a thenable that also
// exposes .select() (which returns a thenable with .lean()).
function buildFindOneChain(doc: MockPending | null) {
  const leanResult = Promise.resolve(doc);
  const selectChain = {
    lean() {
      return leanResult;
    }
  };
  return {
    select(_projection: string) {
      return selectChain;
    }
  };
}

// Patches AiPendingTransfer.findOne and records the filter it was called with.
function patchFindOne(
  t: test.TestContext,
  doc: MockPending | null
): { capturedFilter: Record<string, unknown> | null } {
  const capture: { capturedFilter: Record<string, unknown> | null } = {
    capturedFilter: null
  };
  patchModel(
    AiPendingTransfer,
    "findOne",
    ((filter: Record<string, unknown>) => {
      capture.capturedFilter = filter;
      return buildFindOneChain(doc);
    }) as unknown as typeof AiPendingTransfer.findOne,
    t
  );
  return capture;
}

// ---------------------------------------------------------------------------
// Tests
// ---------------------------------------------------------------------------

const pendingTransferId = "507f1f77bcf86cd799439011";
const userId = "507f1f77bcf86cd799439022";

test("getResumablePendingForUser queries by pendingTransferId and userId", async (t) => {
  const mockDoc: MockPending = {
    _id: pendingTransferId,
    userId,
    conversationId: "conv-abc"
  };
  const capture = patchFindOne(t, mockDoc);

  await getResumablePendingForUser(pendingTransferId, userId);

  assert.ok(capture.capturedFilter !== null, "findOne was not called");
  assert.equal(
    String(capture.capturedFilter._id),
    pendingTransferId,
    "_id filter must match pendingTransferId"
  );
  assert.equal(
    capture.capturedFilter.userId,
    userId,
    "userId filter must match the supplied userId"
  );
});

test("getResumablePendingForUser returns the document the model resolves", async (t) => {
  const mockDoc: MockPending = {
    _id: pendingTransferId,
    userId,
    conversationId: "conv-abc"
  };
  patchFindOne(t, mockDoc);

  const result = await getResumablePendingForUser(pendingTransferId, userId);

  assert.ok(result !== null, "expected a document to be returned");
  assert.equal(
    (result as unknown as MockPending).conversationId,
    "conv-abc"
  );
});

test("getResumablePendingForUser returns null when no document is found", async (t) => {
  patchFindOne(t, null);

  const result = await getResumablePendingForUser(pendingTransferId, userId);

  assert.equal(result, null);
});

test("getResumablePendingForUser filter contains no extra undocumented conditions", async (t) => {
  const capture = patchFindOne(t, null);

  await getResumablePendingForUser(pendingTransferId, userId);

  assert.ok(capture.capturedFilter !== null, "findOne was not called");
  const keys = Object.keys(capture.capturedFilter);
  // The only filter fields must be _id and userId — matching the route's
  // original predicate verbatim (no status/expiresAt in this lookup).
  assert.deepEqual(keys.sort(), ["_id", "userId"].sort());
});
