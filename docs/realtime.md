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

Emitted from the shared `notifyTransferReceived` helper in
`server/src/services/transfer.service.ts`, always after the money-moving database
transaction commits:

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

## Notification coverage

Recipient notification is centralized in `notifyTransferReceived`
(`server/src/services/transfer.service.ts`) and fires post-commit, best-effort, from
every money-moving path:

- the UI route (`server/src/routes/transaction.routes.ts`) and the fraud-hold release
  (`server/src/fraud/holds.ts`) call `executeTransfer`, which invokes
  `notifyTransferReceived` after its transaction commits;
- the AI-confirmed path (`respondToAiPendingTransfer` in
  `server/src/services/aiPendingTransfer.service.ts`, reached by both the v1 service
  and the v2 graph node) executes inside its own transaction and calls
  `notifyTransferReceived` in its post-commit block, gated on the same flag that marks
  that money actually moved.

A held transfer does NOT notify when the card is confirmed — no money has moved yet.
It notifies only when the hold is later released via the email link, which goes through
`executeTransfer`. The notify is always best-effort: a realtime failure is swallowed and
never affects the transfer result.

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

## Scaling (single instance)

The gateway emits through one in-process Socket.IO server (`io`), so delivery is correct
only on a single instance: a recipient connected to instance B will not receive an event
emitted on instance A. Horizontal scaling requires a shared backplane — the Socket.IO
Redis adapter (`@socket.io/redis-adapter`) — so emits fan out across instances. That is
intentionally out of scope until horizontal scaling is real; the load balancer must also
allow the WebSocket upgrade on the Socket.IO path.
