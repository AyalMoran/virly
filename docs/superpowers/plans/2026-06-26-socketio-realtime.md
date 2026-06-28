# Socket.IO Real-Time Integration Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Stand up a Socket.IO real-time channel — authenticated with the existing
httpOnly JWT cookie, per-user rooms — and prove it end-to-end with one concrete event:
when a transfer lands, the recipient's client receives `transfer:received` and refreshes
balance/transactions live instead of polling.

**Architecture:** A `RealtimeGateway` interface (`emitToUser(userId, event, payload)`)
is registered at boot through a singleton seam (mirroring the repository registry — DI at
boot, not ambient global state), defaulting to a **no-op** so services and tests never
depend on a live socket server. `index.ts` creates an `http.Server`, attaches Socket.IO,
authenticates each handshake by verifying the JWT cookie → `userId`, and joins
`user:<userId>`. After a transfer commits, `executeTransfer` emits `transfer:received` to
the recipient's room. The client connects `socket.io-client`, and on the event invalidates
the dashboard/transactions queries. Pure pieces (handshake auth, room naming, client event
mapping) are unit-tested; the live socket wiring is a thin, smoke-tested adapter.

**Tech Stack:** `socket.io` (server) + `socket.io-client` (client), Node `http`, the
existing `jsonwebtoken` cookie auth, Express, React, `node:test` + `tsx`.

## Global Constraints

- ESM: relative imports end in `.js`. Server unit tests: `cd server && npm test`. Client:
  `npm run test:client`.
- **No ambient global mutable state for the emitter** (project anti-pattern): use the
  boot-registered `RealtimeGateway` seam exactly like `getRepositories()`. The default is
  a no-op gateway so emit sites and the whole test suite run without a socket server.
- The Socket.IO handshake MUST authenticate with the same JWT httpOnly cookie the REST API
  uses; an unauthenticated socket is rejected. No new auth scheme.
- A realtime failure must NEVER break a transfer: emits are best-effort (`try/catch`,
  post-commit only).
- Real-time replaces polling for this use case (per the repo's anti-pattern note: prefer
  SSE/WebSocket over polling). AI streaming keeps using its existing SSE — untouched.
- TDD for pure logic; live socket wiring is integration/smoke, not unit.

## Implementation Notes (verified deltas, resolved during execution 2026-06-28)

These resolve the plan's flagged verify-and-match placeholders against the real code:

- **Auth verify:** there is **no** `verifyAuthToken` util. The REST middleware
  (`server/src/middleware/auth.ts`) verifies the cookie inline via
  `jwt.verify(token, config.jwtSecret)` and reads `payload.userId`. So
  `handshakeAuth.ts` verifies the JWT directly with `jsonwebtoken` + `config.jwtSecret`.
- **Cookie name + signer source:** `AUTH_COOKIE_NAME = "virly_auth"` and
  `createToken(userId, csrfTokenHash, options?)` are exported from
  **`server/src/utils/auth.ts`** (not `middleware/cookies.ts`). The test mints a
  cookie via `createToken(userId, "<any-csrf-hash>")`; the handshake checks only the
  JWT signature + `userId` (no CSRF on the socket handshake).
- **Client env var:** the client reads **`VITE_API_BASE_URL`** (fallback
  `http://localhost:3000`) in `client/src/lib/api.ts` — not `VITE_API_URL`.
  `realtimeUrl()` reuses `VITE_API_BASE_URL`.
- **Client data surface:** `client/src/features/dashboard/DashboardPage.tsx` loads
  data with a manual `api.accountSummary(...)` fetch (no React Query). Wire
  `connectRealtime` there; on `transfer:received` re-run the page's load function.
- **Test locations:** server unit tests are co-located `server/src/**/*.test.ts` and
  run via `cd server && npm test`. Client tests live in `client/tests/**/*.test.tsx`
  and run via `npm run test:client` (root). There is **no** existing
  `transfer.service.test.ts`; build fakes using the `account.service.test.ts`
  `withUsers`/`setRepositories` pattern and read `executeTransferWithSession`
  (`transfer.service.ts`) for which repo methods to stub.
- **Registry seam:** the module-level `getRealtime()`/`setRealtime()` deliberately
  mirrors the existing `getRepositories()`/`setRepositories()` registry — DI at boot,
  not ambient global state (the project's documented seam pattern).
- **docs/env:** `docs/` is tracked in git (so `docs/realtime.md` is committable).
  There are three `.env.example` files (root, `client/`, `server/`);
  `VITE_API_BASE_URL` already exists in the client env.

## Approach & rationale

What real-time event to ship first? Options: (a) incoming-transfer notification, (b)
video-session status changes, (c) live balance everywhere. **(a) is chosen** — it's the
clearest user-visible win, the transfer path is already understood, and it exercises the
full stack (auth → room → emit → client refresh) with a single, low-risk emit site. (b)
and (c) become trivial follow-ups once the channel exists (documented as such).

Socket.IO vs raw `ws`: Socket.IO gives rooms, reconnection, and a clean client API out of
the box, which matches "per-user rooms + best-effort notify". The emitter-behind-an-
interface design means swapping transports later touches one adapter.

## File Structure

| File | Responsibility |
|---|---|
| `server/package.json` (modify) | Add `socket.io`. |
| `src/realtime/types.ts` (create) | `RealtimeGateway`, `RealtimeEvent` names + payload types. |
| `src/realtime/registry.ts` (create) | `getRealtime()`/`setRealtime()`; no-op default. |
| `src/realtime/rooms.ts` (create) | `userRoom(userId)` helper. |
| `src/realtime/handshakeAuth.ts` (create) | `userIdFromCookieHeader(header)` (pure). |
| `src/realtime/server.ts` (create) | `attachSocketServer(httpServer): RealtimeGateway`. |
| `src/index.ts` (modify) | `http.createServer(app)`, attach socket server, register gateway, `server.listen`. |
| `src/services/transfer.service.ts` (modify) | Emit `transfer:received` post-commit. |
| `client/package.json` (modify) | Add `socket.io-client`. |
| `client/src/lib/realtime.ts` (create) | `connectRealtime()` + event types. |
| `client/src/features/.../*` (modify) | Refetch balance/transactions on `transfer:received`. |
| `.env.example`, `docs/` (modify) | Document the channel + events. |

---

## Task 1: Realtime types + registry (no-op default)

**Files:**
- Create: `src/realtime/types.ts`
- Create: `src/realtime/registry.ts`
- Test: `src/realtime/registry.test.ts`

**Interfaces:**
- Produces:
  - `type RealtimeEvent = "transfer:received"`
  - `type RealtimePayloads = { "transfer:received": { amount: number; reason: string | null } }`
  - `interface RealtimeGateway { emitToUser<E extends RealtimeEvent>(userId: string, event: E, payload: RealtimePayloads[E]): void }`
  - `function getRealtime(): RealtimeGateway`, `function setRealtime(gw: RealtimeGateway): void`, `const noopRealtime: RealtimeGateway`

- [ ] **Step 1: Write the failing test**

```ts
// src/realtime/registry.test.ts
import assert from "node:assert/strict";
import test from "node:test";
import { getRealtime, setRealtime, noopRealtime } from "./registry.js";

test("defaults to a no-op gateway (safe in tests / no socket server)", () => {
  setRealtime(noopRealtime);
  assert.doesNotThrow(() => getRealtime().emitToUser("u1", "transfer:received", { amount: 1, reason: null }));
});

test("setRealtime swaps the active gateway", () => {
  const calls: Array<[string, string]> = [];
  setRealtime({ emitToUser: (uid, ev) => calls.push([uid, ev]) });
  getRealtime().emitToUser("u2", "transfer:received", { amount: 5, reason: "x" });
  assert.deepEqual(calls, [["u2", "transfer:received"]]);
  setRealtime(noopRealtime);
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `cd server && npx tsx --test src/realtime/registry.test.ts`
Expected: FAIL — module not found.

- [ ] **Step 3: Implement types + registry**

```ts
// src/realtime/types.ts
export type RealtimeEvent = "transfer:received";

export type RealtimePayloads = {
  "transfer:received": { amount: number; reason: string | null };
};

export interface RealtimeGateway {
  emitToUser<E extends RealtimeEvent>(
    userId: string,
    event: E,
    payload: RealtimePayloads[E]
  ): void;
}
```

```ts
// src/realtime/registry.ts
import type { RealtimeGateway } from "./types.js";

export const noopRealtime: RealtimeGateway = {
  emitToUser() {
    /* no-op: default until a socket server registers a live gateway */
  }
};

let active: RealtimeGateway = noopRealtime;

export function setRealtime(gateway: RealtimeGateway): void {
  active = gateway;
}

export function getRealtime(): RealtimeGateway {
  return active;
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `cd server && npx tsx --test src/realtime/registry.test.ts`
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add server/src/realtime/types.ts server/src/realtime/registry.ts server/src/realtime/registry.test.ts
git commit -m "feat(realtime): RealtimeGateway interface + boot registry (no-op default)"
```

---

## Task 2: Handshake auth + room helper (pure)

**Files:**
- Create: `src/realtime/handshakeAuth.ts`
- Create: `src/realtime/rooms.ts`
- Test: `src/realtime/handshakeAuth.test.ts`

**Interfaces:**
- Consumes: the existing JWT verify util + cookie name. Confirm with
  `grep -rn "verifyAuthToken\|jwt.verify\|COOKIE\|cookieName\|token" src/utils/auth.ts src/middleware/auth.ts src/middleware/cookies.ts` and reuse the SAME verify function and cookie name the REST middleware uses.
- Produces:
  - `function userIdFromCookieHeader(cookieHeader: string | undefined): string | null`
  - `function userRoom(userId: string): string`

- [ ] **Step 1: Write the failing test**

```ts
// src/realtime/handshakeAuth.test.ts
import assert from "node:assert/strict";
import test from "node:test";
import { userIdFromCookieHeader } from "./handshakeAuth.js";
import { userRoom } from "./rooms.js";
import { signAuthCookieValue, AUTH_COOKIE_NAME } from "./handshakeAuth.js"; // re-export the real signer/name for the test

test("extracts the userId from a valid auth cookie", () => {
  const cookie = `${AUTH_COOKIE_NAME}=${signAuthCookieValue("u1")}`;
  assert.equal(userIdFromCookieHeader(cookie), "u1");
});

test("returns null when the cookie is missing or invalid", () => {
  assert.equal(userIdFromCookieHeader(undefined), null);
  assert.equal(userIdFromCookieHeader(`${AUTH_COOKIE_NAME}=garbage`), null);
  assert.equal(userIdFromCookieHeader("other=1"), null);
});

test("room name is namespaced per user", () => {
  assert.equal(userRoom("u1"), "user:u1");
});
```

> If the codebase exposes the JWT signer/cookie-name elsewhere, import those instead of
> adding `signAuthCookieValue`/`AUTH_COOKIE_NAME` to `handshakeAuth.ts`; the test just
> needs a way to mint a valid cookie the way the app does.

- [ ] **Step 2: Run test to verify it fails**

Run: `cd server && npx tsx --test src/realtime/handshakeAuth.test.ts`
Expected: FAIL — module not found.

- [ ] **Step 3: Implement**

```ts
// src/realtime/rooms.ts
export function userRoom(userId: string): string {
  return `user:${userId}`;
}
```

```ts
// src/realtime/handshakeAuth.ts
// VERIFIED: there is no verifyAuthToken util; the REST middleware verifies the
// cookie inline. Mirror it here. AUTH_COOKIE_NAME + createToken come from utils/auth.js.
import jwt from "jsonwebtoken";
import { config } from "../config.js";
import { AUTH_COOKIE_NAME, createToken } from "../utils/auth.js";

// Re-export so the test can import the real cookie name + a signer from one place:
export { AUTH_COOKIE_NAME };

function parseCookies(header: string): Record<string, string> {
  return header.split(";").reduce<Record<string, string>>((acc, part) => {
    const idx = part.indexOf("=");
    if (idx > -1) {
      acc[part.slice(0, idx).trim()] = decodeURIComponent(part.slice(idx + 1).trim());
    }
    return acc;
  }, {});
}

export function userIdFromCookieHeader(cookieHeader: string | undefined): string | null {
  if (!cookieHeader) {
    return null;
  }
  const token = parseCookies(cookieHeader)[AUTH_COOKIE_NAME];
  if (!token) {
    return null;
  }
  try {
    const payload = jwt.verify(token, config.jwtSecret) as jwt.JwtPayload;
    const userId = payload.userId;
    return typeof userId === "string" ? userId : null;
  } catch {
    return null;
  }
}

// Test signer: the auth cookie value IS the JWT; mint one the way the app does.
// (Handshake validates only the JWT signature + userId, no CSRF.)
export function signAuthCookieValue(userId: string): string {
  return createToken(userId, "handshake-test-csrf-hash");
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `cd server && npx tsx --test src/realtime/handshakeAuth.test.ts`
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add server/src/realtime/handshakeAuth.ts server/src/realtime/rooms.ts server/src/realtime/handshakeAuth.test.ts
git commit -m "feat(realtime): JWT-cookie handshake auth + per-user room helper"
```

---

## Task 3: Socket server adapter

**Files:**
- Modify: `server/package.json` (add `socket.io`)
- Create: `src/realtime/server.ts`
- Test: `src/realtime/server.test.ts` (live in-process socket round-trip)

**Interfaces:**
- Consumes: `userIdFromCookieHeader`, `userRoom` (Task 2), `RealtimeGateway` (Task 1).
- Produces: `function attachSocketServer(httpServer: import("http").Server, opts?: { cors?: string[] }): { gateway: RealtimeGateway; io: import("socket.io").Server }`.

- [ ] **Step 1: Install Socket.IO**

```bash
cd server && npm install socket.io
```

- [ ] **Step 2: Write the failing test (real socket round-trip)**

```ts
// src/realtime/server.test.ts
import assert from "node:assert/strict";
import test from "node:test";
import { createServer } from "node:http";
import { io as ioClient } from "socket.io-client"; // dev-only: add to server devDeps for this test, or use the client ws
import { attachSocketServer } from "./server.js";
import { AUTH_COOKIE_NAME, signAuthCookieValue } from "./handshakeAuth.js";

test("authenticated client joins its room and receives an emitToUser event", async () => {
  const http = createServer();
  const { gateway } = attachSocketServer(http);
  await new Promise<void>((r) => http.listen(0, r));
  const port = (http.address() as { port: number }).port;

  const client = ioClient(`http://localhost:${port}`, {
    extraHeaders: { cookie: `${AUTH_COOKIE_NAME}=${signAuthCookieValue("u1")}` }
  });

  const received = new Promise<{ amount: number }>((resolve) => {
    client.on("transfer:received", resolve);
  });
  await new Promise<void>((r) => client.on("connect", () => r()));
  gateway.emitToUser("u1", "transfer:received", { amount: 42, reason: null });

  const payload = await received;
  assert.equal(payload.amount, 42);
  client.close();
  http.close();
});
```

> `socket.io-client` is needed here as a server devDependency for the test (or reuse the
> client workspace's copy). If adding a devDep is undesirable, make this a manual smoke
> test and keep Tasks 1–2 as the deterministic coverage.

- [ ] **Step 3: Run test to verify it fails**

Run: `cd server && npx tsx --test src/realtime/server.test.ts`
Expected: FAIL — module not found.

- [ ] **Step 4: Implement the adapter**

```ts
// src/realtime/server.ts
import { Server as IOServer } from "socket.io";
import type { Server as HttpServer } from "node:http";
import { config } from "../config.js";
import { userIdFromCookieHeader } from "./handshakeAuth.js";
import { userRoom } from "./rooms.js";
import type { RealtimeGateway } from "./types.js";

export function attachSocketServer(
  httpServer: HttpServer,
  opts: { cors?: string[] } = {}
): { gateway: RealtimeGateway; io: IOServer } {
  const io = new IOServer(httpServer, {
    cors: { origin: opts.cors ?? config.clientUrls, credentials: true }
  });

  // Authenticate every handshake with the JWT cookie; reject anonymous sockets.
  io.use((socket, next) => {
    const userId = userIdFromCookieHeader(socket.handshake.headers.cookie);
    if (!userId) {
      next(new Error("unauthorized"));
      return;
    }
    socket.data.userId = userId;
    next();
  });

  io.on("connection", (socket) => {
    const userId = socket.data.userId as string;
    void socket.join(userRoom(userId));
  });

  const gateway: RealtimeGateway = {
    emitToUser(userId, event, payload) {
      io.to(userRoom(userId)).emit(event, payload);
    }
  };

  return { gateway, io };
}
```

- [ ] **Step 5: Run test to verify it passes**

Run: `cd server && npx tsx --test src/realtime/server.test.ts`
Expected: PASS.

- [ ] **Step 6: Commit**

```bash
git add server/package.json server/package-lock.json package-lock.json server/src/realtime/server.ts server/src/realtime/server.test.ts
git commit -m "feat(realtime): Socket.IO adapter with cookie auth + per-user rooms"
```

---

## Task 4: Boot wiring (HTTP server + attach + register)

**Files:**
- Modify: `src/index.ts`

**Interfaces:**
- Consumes: `attachSocketServer` (Task 3), `setRealtime` (Task 1).

- [ ] **Step 1: Convert `app.listen` to an `http.Server` with Socket.IO**

In `src/index.ts`:

```ts
import { createServer } from "node:http";
import { attachSocketServer } from "./realtime/server.js";
import { setRealtime } from "./realtime/registry.js";
// ...
async function bootstrap() {
  await connectDb();
  await initRepositories();
  if (config.dbDriver === "postgres") startTtlSweeper();
  startDailyFxRefresh();

  const httpServer = createServer(app);
  const { gateway } = attachSocketServer(httpServer);
  setRealtime(gateway);

  httpServer.listen(config.port, () => {
    console.log(`Server running on ${config.serverUrl}:${config.port}`);
  });
}
```

- [ ] **Step 2: Type-check + boot smoke**

Run: `cd server && npx tsc -p tsconfig.json --noEmit`
Expected: no type errors.

Then a manual smoke: start the server (`npm run dev`) and confirm it logs "Server
running …" and accepts a socket connection from an authenticated browser session.

- [ ] **Step 3: Commit**

```bash
git add server/src/index.ts
git commit -m "feat(realtime): attach Socket.IO to the HTTP server at boot"
```

---

## Task 5: Emit `transfer:received` after a transfer commits

**Files:**
- Modify: `src/services/transfer.service.ts`
- Test: `src/services/transfer.service.test.ts` (or `src/transfer.service.test.ts` — match the existing location)

**Interfaces:**
- Consumes: `getRealtime()` (Task 1). Emits to the recipient post-commit, best-effort.

- [ ] **Step 1: Write the failing test**

Using the transfer suite's existing fake repositories, add a test that injects a fake
realtime gateway via `setRealtime(...)` and asserts `executeTransfer` emits
`transfer:received` to the recipient after a successful transfer:

```ts
import { setRealtime, noopRealtime } from "../realtime/registry.js"; // adjust path

test("executeTransfer notifies the recipient in real time", async () => {
  const emits: Array<{ userId: string; event: string; amount: number }> = [];
  setRealtime({ emitToUser: (userId, event, p) => emits.push({ userId, event, amount: (p as { amount: number }).amount }) });

  // …existing setup: sender + recipient in the fake user repo, sufficient balance…
  await executeTransfer({ senderId: "sender-id", recipientEmail: "recip@example.com", amount: 50, reason: null });

  assert.deepEqual(emits, [{ userId: "recipient-id", event: "transfer:received", amount: 50 }]);
  setRealtime(noopRealtime);
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `cd server && npx tsx --test src/services/transfer.service.test.ts`
Expected: FAIL — no emit yet.

- [ ] **Step 3: Emit post-commit in `executeTransfer`**

In `src/services/transfer.service.ts`, change the `executeTransfer` wrapper so it emits
AFTER the transaction commits (never inside it, never breaking the transfer):

```ts
import { getRealtime } from "../realtime/registry.js";

export async function executeTransfer(
  input: ExecuteTransferInput
): Promise<ExecuteTransferResult> {
  const result = await getRepositories().runInTransaction(async (tx) =>
    executeTransferWithSession(input, tx)
  );

  // Best-effort real-time notify; a realtime failure must not affect the transfer.
  try {
    const recipient = await getRepositories().users.findByEmail(
      input.recipientEmail.toLowerCase()
    );
    if (recipient) {
      getRealtime().emitToUser(recipient.id, "transfer:received", {
        amount: input.amount,
        reason: input.reason?.trim() || null
      });
    }
  } catch {
    /* swallow — notification is non-critical */
  }

  return result;
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `cd server && npx tsx --test src/services/transfer.service.test.ts`
Expected: PASS.

- [ ] **Step 5: Run the full server suite**

Run: `cd server && npm test`
Expected: PASS — no-op gateway by default, transfers behave identically.

- [ ] **Step 6: Commit**

```bash
git add server/src/services/transfer.service.ts server/src/services/transfer.service.test.ts
git commit -m "feat(realtime): emit transfer:received to the recipient post-commit"
```

---

## Task 6: Client — connect + refresh on event

**Files:**
- Modify: `client/package.json` (add `socket.io-client`)
- Create: `client/src/lib/realtime.ts`
- Modify: the data-owning surface (e.g. `features/auth/AuthProvider.tsx` or
  `features/dashboard/DashboardPage.tsx`) to refetch on `transfer:received`
- Test: `client/tests/realtime.test.tsx` (pure event-handler mapping)

**Interfaces:**
- Produces:
  - `function connectRealtime(handlers: { onTransferReceived: (p: { amount: number; reason: string | null }) => void }): () => void` (returns a disconnect fn)
  - `function realtimeUrl(): string`

- [ ] **Step 1: Install the client dep**

```bash
cd client && npm install socket.io-client
```

- [ ] **Step 2: Write the failing test (pure mapping, no live socket)**

```tsx
// client/tests/realtime.test.tsx
import assert from "node:assert/strict";
import test from "node:test";
import { dispatchRealtimeEvent } from "../src/lib/realtime";

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
```

- [ ] **Step 3: Run test to verify it fails**

Run: `npm run test:client`
Expected: FAIL — module not found.

- [ ] **Step 4: Implement the client realtime module**

```ts
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
  // VERIFIED: client reads VITE_API_BASE_URL (see client/src/lib/api.ts).
  return import.meta.env.VITE_API_BASE_URL ?? "http://localhost:3000";
}

export function connectRealtime(handlers: RealtimeHandlers): () => void {
  const socket: Socket = io(realtimeUrl(), { withCredentials: true });
  socket.on("transfer:received", (p) => dispatchRealtimeEvent("transfer:received", p, handlers));
  return () => socket.close();
}
```

- [ ] **Step 5: Wire into the app**

In the authenticated data surface (e.g. `AuthProvider` once a user is present, or
`DashboardPage`), `useEffect(() => connectRealtime({ onTransferReceived: () => { refetchBalance(); refetchTransactions(); } }), [])` and disconnect on unmount. Use whatever
refetch/invalidation the page already exposes (match the existing data-loading pattern).

- [ ] **Step 6: Run client tests + build**

Run: `npm run test:client && cd client && npx tsc -b`
Expected: PASS, no type errors.

- [ ] **Step 7: Commit**

```bash
git add client/package.json client/package-lock.json package-lock.json client/src/lib/realtime.ts client/src/features client/tests/realtime.test.tsx
git commit -m "feat(realtime): client socket connection + live refresh on transfer:received"
```

---

## Task 7: Docs + env

**Files:**
- Modify: `.env.example` (note the socket shares the API origin + cookie; add `VITE_API_URL` if not present)
- Create: `docs/realtime.md` (or a section in an existing doc)

- [ ] **Step 1: Document the channel**

Write a short `docs/realtime.md`: the auth model (JWT cookie handshake), room scheme
(`user:<id>`), the `RealtimeGateway` seam (how to emit from a service), the
`transfer:received` event contract, and how to add the next event (video-session status,
balance updates) — emit via `getRealtime().emitToUser(...)`, add the type to
`RealtimePayloads`, handle it client-side in `dispatchRealtimeEvent`.

- [ ] **Step 2: Commit**

```bash
git add .env.example docs/realtime.md
git commit -m "docs(realtime): document Socket.IO channel, auth, and event contract"
```

---

## Self-Review

- **Spec coverage:** infra (registry T1, auth/rooms T2, adapter T3, boot T4), an
  end-to-end event (server emit T5, client consume T6), and docs (T7). "Implement and
  integrate" Socket.IO is covered with one real integration and a documented extension
  path.
- **Placeholder scan:** the auth-util import names (`verifyAuthToken`, `AUTH_COOKIE_NAME`)
  are flagged to verify-and-match against the real REST middleware rather than assumed —
  that's a verification instruction, not a placeholder. The optional `socket.io-client`
  devDep for the server round-trip test has an explicit fallback (manual smoke).
- **Type consistency:** `RealtimeGateway.emitToUser`, `RealtimeEvent`/`RealtimePayloads`,
  and `userRoom`/`userIdFromCookieHeader` are used identically across registry, adapter,
  transfer service, and client.

## Open questions (answer later)

1. **First use case** — is incoming-transfer notification the right first integration, or
   do you want video-session status (agent assigned/active) or live balance first?
2. **Scale** — single instance (this plan) or multi-instance? The latter needs the
   Socket.IO Redis adapter; out of scope until horizontal scaling is real.
3. **Origin/transport** — does the socket share the API origin (assumed), and are there
   CORS/proxy constraints in the deploy (e.g. a load balancer that must allow WS upgrade)?
4. **Notification UX** — refetch silently (this plan) or also show a toast "You received
   ₪50 from …"? The latter needs sender identity in the payload.
