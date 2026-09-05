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

test("security:new-login reaches its handler", () => {
  const seen: unknown[] = [];
  dispatchRealtimeEvent(
    "security:new-login",
    { city: "Paris", country: "FR", at: "2026-07-01T10:30:00.000Z", reasons: ["First activity from France."] },
    {
      onTransferReceived: () => {},
      onSecurityNewLogin: (p) => seen.push(p)
    }
  );
  expect(seen).toHaveLength(1);
});

test("security:new-login is a no-op when the handler is not provided", () => {
  expect(() =>
    dispatchRealtimeEvent(
      "security:new-login",
      { city: null, country: null, at: "2026-07-01T10:30:00.000Z", reasons: [] },
      { onTransferReceived: () => {} }
    )
  ).not.toThrow();
});
