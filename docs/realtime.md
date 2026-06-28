# Realtime channel (Socket.IO)

Virly uses Socket.IO to push events from the server to connected clients. The channel
shares the HTTP server, the API origin, and the existing JWT cookie — no separate
connection or credentials are needed.

## Auth model

Every handshake is authenticated in `server/src/realtime/handshakeAuth.ts`. The
middleware reads the `virly_auth` httpOnly cookie (the same cookie the REST API uses),
verifies it with `config.jwtSecret` via `jsonwebtoken`, and rejects the connection with
`unauthorized` if the cookie is absent or invalid. The verified `userId` is stored in
`socket.data.userId` and used immediately on connection.

Unauthenticated sockets never complete the handshake — they are rejected before any
event can be sent or received.

## Room scheme

On connect, each socket joins a private room named `user:<userId>` (computed by
`userRoom()` in `server/src/realtime/rooms.ts`). The gateway always emits to this room:

```ts
io.to(userRoom(userId)).emit(event, payload);
```

No socket joins a room it does not own, so a user can only receive events addressed to
their own `userId`.

## RealtimeGateway seam

`server/src/realtime/types.ts` defines the interface:

```ts
export interface RealtimeGateway {
  emitToUser<E extends RealtimeEvent>(
    userId: string,
    event: E,
    payload: RealtimePayloads[E]
  ): void;
}
```

The active gateway is accessed via the module-level registry in
`server/src/realtime/registry.ts`:

```ts
getRealtime().emitToUser(userId, "transfer:received", payload);
```

At startup the registry holds `noopRealtime` (a silent no-op), so services and tests
work without a live socket server. Boot replaces it with the real gateway via
`setRealtime(gateway)` after `attachSocketServer` returns. This mirrors the
`getRepositories()` / `setRepositories()` pattern.

## transfer:received event contract

Emitted in `server/src/services/transfer.service.ts` inside `executeTransfer`, after
the database transaction commits:

```ts
getRealtime().emitToUser(recipient.id, "transfer:received", {
  amount: input.amount,
  reason: input.reason?.trim() || null
});
```

Payload type (from `RealtimePayloads` in `server/src/realtime/types.ts`):

```ts
{ amount: number; reason: string | null }
```

The emit is wrapped in `try/catch`; a realtime failure is swallowed and never affects
the transfer result. The client handles it in `client/src/lib/realtime.ts`:

```ts
socket.on("transfer:received", (p) =>
  dispatchRealtimeEvent("transfer:received", p, handlers)
);
```

`dispatchRealtimeEvent` routes to `handlers.onTransferReceived`, which is the only
entry in `RealtimeHandlers` today.

## Adding a new event

1. Add the event name and payload shape to `RealtimePayloads` in
   `server/src/realtime/types.ts`:

   ```ts
   export type RealtimeEvent = "transfer:received" | "session:status";

   export type RealtimePayloads = {
     "transfer:received": { amount: number; reason: string | null };
     "session:status": { sessionId: string; status: "active" | "ended" };
   };
   ```

2. Emit from the relevant service using `getRealtime().emitToUser(...)`.

3. Client: add a handler to `RealtimeHandlers` in `client/src/lib/realtime.ts`, wire
   the `socket.on` listener in `connectRealtime`, and route it in
   `dispatchRealtimeEvent`.

TypeScript enforces that the payload matches `RealtimePayloads[E]` at the call site, so
a type error will catch mismatches before runtime.
