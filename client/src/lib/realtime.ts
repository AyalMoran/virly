// client/src/lib/realtime.ts
import { io, type Socket } from "socket.io-client";

export type RealtimeHandlers = {
  onTransferReceived: (payload: { amount: number; reason: string | null }) => void;
};

/** Pure router so event dispatch is unit-testable without a live socket. */
export function dispatchRealtimeEvent(
  event: string,
  payload: unknown,
  handlers: RealtimeHandlers
): void {
  if (event === "transfer:received") {
    handlers.onTransferReceived(payload as { amount: number; reason: string | null });
  }
}

export function realtimeUrl(): string {
  // Same origin as the API; the JWT cookie rides along with withCredentials.
  // VERIFIED: client reads VITE_API_BASE_URL (see client/src/lib/api.ts), with
  // optional chaining so importing this module is safe under the node test runner.
  return import.meta.env?.VITE_API_BASE_URL ?? "http://localhost:3000";
}

export function connectRealtime(handlers: RealtimeHandlers): () => void {
  const socket: Socket = io(realtimeUrl(), { withCredentials: true });
  socket.on("transfer:received", (p) => dispatchRealtimeEvent("transfer:received", p, handlers));
  return () => socket.close();
}
