// client/tests/realtime.test.tsx
import {
  connectRealtime,
  dispatchRealtimeEvent,
  resetRealtimeForTests,
  type RealtimeTransport
} from "../../lib/realtime";

/** Fake transport: records listeners + closes, so the ref-counting is testable
 *  without a socket (the node harness has no DOM/WebSocket). */
function fakeTransport() {
  const listeners = new Map<string, (payload: unknown) => void>();
  const state = { created: 0, closed: 0 };
  const create = (): RealtimeTransport => {
    state.created += 1;
    return {
      on: (event, listener) => listeners.set(event, listener),
      close: () => {
        state.closed += 1;
      }
    };
  };
  const emit = (event: string, payload: unknown) => listeners.get(event)?.(payload);
  return { create, emit, state };
}

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

// --- ref-counted shared connection ---------------------------------------
// socket.io multiplexes to ONE socket, so an unmounting subscriber must not
// tear down the connection other subscribers (e.g. the AppShell security
// toasts) still depend on.

afterEach(() => resetRealtimeForTests());

test("two subscribers share one transport and both receive frames", () => {
  const t = fakeTransport();
  const a: unknown[] = [];
  const b: unknown[] = [];
  connectRealtime({ onTransferReceived: (p) => a.push(p) }, t.create);
  connectRealtime({ onTransferReceived: (p) => b.push(p) }, t.create);
  expect(t.state.created).toBe(1);
  t.emit("transfer:received", { amount: 50, reason: null });
  expect(a).toHaveLength(1);
  expect(b).toHaveLength(1);
});

test("unsubscribing one subscriber keeps the transport alive for the others", () => {
  const t = fakeTransport();
  const shell: unknown[] = [];
  const dashboard: unknown[] = [];
  connectRealtime(
    { onTransferReceived: () => {}, onSecurityNewLogin: (p) => shell.push(p) },
    t.create
  );
  const leaveDashboard = connectRealtime(
    { onTransferReceived: (p) => dashboard.push(p) },
    t.create
  );

  leaveDashboard();
  expect(t.state.closed).toBe(0);

  t.emit("security:new-login", { city: "Paris", country: "FR", at: "x", reasons: ["r"] });
  t.emit("transfer:received", { amount: 1, reason: null });
  expect(shell).toHaveLength(1); // AppShell toasts survive the dashboard unmount
  expect(dashboard).toHaveLength(0); // and the gone subscriber hears nothing
});

test("the transport closes only when the last subscriber leaves, and reopens after", () => {
  const t = fakeTransport();
  const off1 = connectRealtime({ onTransferReceived: () => {} }, t.create);
  const off2 = connectRealtime({ onTransferReceived: () => {} }, t.create);
  off1();
  expect(t.state.closed).toBe(0);
  off2();
  expect(t.state.closed).toBe(1);

  connectRealtime({ onTransferReceived: () => {} }, t.create);
  expect(t.state.created).toBe(2);
});

test("unsubscribing twice does not drop the refcount twice", () => {
  const t = fakeTransport();
  const off1 = connectRealtime({ onTransferReceived: () => {} }, t.create);
  connectRealtime({ onTransferReceived: () => {} }, t.create);
  off1();
  off1();
  expect(t.state.closed).toBe(0);
});

test("identical handler objects still count as two subscribers", () => {
  const t = fakeTransport();
  const handlers = { onTransferReceived: () => {} };
  const off1 = connectRealtime(handlers, t.create);
  connectRealtime(handlers, t.create);
  off1();
  expect(t.state.closed).toBe(0);
});
