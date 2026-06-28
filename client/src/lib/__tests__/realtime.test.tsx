// client/tests/realtime.test.tsx
import assert from "node:assert/strict";
import test from "node:test";
import { dispatchRealtimeEvent } from "../../lib/realtime";

test("routes a transfer:received frame to the right handler", () => {
  let got: { amount: number } | null = null;
  dispatchRealtimeEvent(
    "transfer:received",
    { amount: 50, reason: null },
    { onTransferReceived: (p) => (got = p) }
  );
  assert.equal(got!.amount, 50);
});

test("ignores unknown events", () => {
  assert.doesNotThrow(() =>
    dispatchRealtimeEvent("nope" as never, {}, { onTransferReceived: () => {} })
  );
});
