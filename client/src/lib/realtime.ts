// client/src/lib/realtime.ts
import { io, type Socket } from "socket.io-client";

export type RealtimeHandlers = {
  onTransferReceived: (payload: { amount: number; reason: string | null }) => void;
  onSecurityNewLogin?: (payload: {
    city: string | null;
    country: string | null;
    at: string;
    reasons: string[];
  }) => void;
};

/** Pure router so event dispatch is unit-testable without a live socket. */
export function dispatchRealtimeEvent(
  event: string,
  payload: unknown,
  handlers: RealtimeHandlers
): void {
  if (event === "transfer:received") {
    handlers.onTransferReceived(payload as { amount: number; reason: string | null });
  } else if (event === "security:new-login") {
    handlers.onSecurityNewLogin?.(
      payload as { city: string | null; country: string | null; at: string; reasons: string[] }
    );
  }
}

export function realtimeUrl(): string {
  // Same origin as the API; the JWT cookie rides along with withCredentials.
  // VERIFIED: client reads VITE_API_BASE_URL (see client/src/lib/api.ts), with
  // optional chaining so importing this module is safe under the node test runner.
  return import.meta.env?.VITE_API_BASE_URL ?? "http://localhost:3000";
}

/**
 * Subscriber registry, shared by every `connectRealtime` caller.
 *
 * socket.io multiplexes same-origin connections onto ONE underlying Socket, so
 * a per-caller `socket.close()` used to tear down the connection for the whole
 * app (visiting the dashboard killed the AppShell security toasts). The registry
 * fans one frame out to all live subscribers and ref-counts the transport:
 * it opens on the first subscriber and closes only when the last one leaves.
 * Exported for tests; the socket factory is injectable so the registry logic is
 * testable without a real transport.
 */
export type RealtimeTransport = {
  on: (event: string, listener: (payload: unknown) => void) => void;
  close: () => void;
};

/** One entry per `connectRealtime` call, so two callers passing the same handler
 *  object still count as two subscribers. */
type Subscription = { handlers: RealtimeHandlers };

const subscribers = new Set<Subscription>();
let transport: RealtimeTransport | null = null;

function fanOut(event: string): (payload: unknown) => void {
  // Snapshot: a handler may unsubscribe (or subscribe) while we dispatch.
  return (payload) => {
    for (const entry of [...subscribers]) {
      if (subscribers.has(entry)) dispatchRealtimeEvent(event, payload, entry.handlers);
    }
  };
}

function defaultTransport(): RealtimeTransport {
  const socket: Socket = io(realtimeUrl(), { withCredentials: true });
  return {
    on: (event, listener) => socket.on(event, listener),
    close: () => socket.close()
  };
}

/**
 * Subscribe to realtime frames. Returns an unsubscribe function; the underlying
 * socket is closed only once the last subscriber has unsubscribed.
 */
export function connectRealtime(
  handlers: RealtimeHandlers,
  createTransport: () => RealtimeTransport = defaultTransport
): () => void {
  const entry: Subscription = { handlers };
  subscribers.add(entry);
  if (!transport) {
    transport = createTransport();
    transport.on("transfer:received", fanOut("transfer:received"));
    transport.on("security:new-login", fanOut("security:new-login"));
  }
  let done = false;
  return () => {
    if (done) return; // idempotent: a double-unsubscribe must not drop the refcount twice
    done = true;
    subscribers.delete(entry);
    if (subscribers.size === 0 && transport) {
      transport.close();
      transport = null;
    }
  };
}

/** Test-only: drop all subscribers and the transport. */
export function resetRealtimeForTests(): void {
  subscribers.clear();
  transport = null;
}
