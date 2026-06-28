// client/tests/realtime.test.tsx
import { dispatchRealtimeEvent } from "../../lib/realtime";

test("routes a transfer:received frame to the right handler", () => {
  let got: { amount: number } | null = null;
  dispatchRealtimeEvent(
    "transfer:received",
    { amount: 50, reason: null },
    { onTransferReceived: (p) => (got = p) }
  );
  expect(got!.amount).toBe(50);
});

test("ignores unknown events", () => {
  expect(() =>
    dispatchRealtimeEvent("nope" as never, {}, { onTransferReceived: () => {} })
  ).not.toThrow();
});
