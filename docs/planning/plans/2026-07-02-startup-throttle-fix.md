# Dev Throttle Slows Every API Call - Fix Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Todoist task:** `6h2Rpwm7rQG9XH76` - "Im pretty sure the throttle at the start affects every api call" (every page takes seconds to load).

**Goal:** Stop the dev latency simulator from silently delaying every API response by 6 seconds, and make it structurally impossible for it to lurk unnoticed again.

**Architecture:** The root cause is already known: `server/.env` sets `VIRLY_THROTTLE_MS=6000`, and `server/src/app.ts` registers a global middleware that delays EVERY response by that many ms (it was never startup-only; see the verbatim code below).
The fix extracts the throttle into a tested `middleware/devThrottle.ts` module that is hard-disabled in production, warns loudly at boot when active, and the stale `6000` is removed from the local `.env`.

**Tech Stack:** Express middleware, server Jest (native ESM, `.js` import specifiers), no new dependencies.

## Global Constraints

- Server code uses NodeNext ESM: source imports carry `.js` specifiers even though files are `.ts`.
- Server unit tests live in `__tests__/` folders under `server/src/` and run via `npm run test:server` (pass a file path after `--` for one file).
- `server/.env` is gitignored (`.gitignore` line 3), so the `.env` change is a local operational step, never a commit.
- Prefer reading config through `server/src/config.ts`, but this variable is documented as intentionally read from `process.env` directly (`docs/configuration.md`, the `VIRLY_THROTTLE_MS` row); keep that seam but centralize it in one module.
- Per Ayal's bug-fix rule: reproduce E2E first, before changing code.

## Root cause (verified 2026-07-02)

`server/src/app.ts` (immediately after the `morgan` registration):

```ts
// Dev latency simulator: when VIRLY_THROTTLE_MS is set, delay every response by
// that many ms — handy for previewing the client's boot/loading states against
// a slow (e.g. cold-starting) API. Off unless the env var is present.
const throttleMs = Number(process.env.VIRLY_THROTTLE_MS) || 0;
if (throttleMs > 0) {
  app.use((_req, _res, next) => {
    setTimeout(next, throttleMs);
  });
}
```

`server/.env:58` currently sets `VIRLY_THROTTLE_MS=6000`.
The middleware is registered before every `/api/*` route, so every request (auth `/me`, account summary, transactions, AI chat) waits 6 seconds.
The task title says "throttle at the start" because the developer believed it only affected boot; the implementation has always been global, and the value was left enabled.

## File Structure

| File | Responsibility |
|---|---|
| `server/src/middleware/devThrottle.ts` (create) | `resolveDevThrottleMs`, `devThrottleMiddleware`, `warnDevThrottleActive`: parse + guard + warn in one place. |
| `server/src/middleware/__tests__/devThrottle.test.ts` (create) | Unit tests for the resolver (unset, valid, garbage, production guard). |
| `server/src/app.ts` (modify) | Replace the inline block with the tested module. |
| `server/.env` (local edit, not committed) | Remove `VIRLY_THROTTLE_MS=6000`. |
| `server/.env.example` (modify) | Add a commented, documented `VIRLY_THROTTLE_MS` entry. |
| `docs/configuration.md` (modify) | Update the `VIRLY_THROTTLE_MS` row: production guard + boot warning. |

---

## Task 1: Reproduce the bug end-to-end

**Files:** none (measurement only).

- [ ] **Step 1: Start the dev server with the current (broken) env**

Run: `npm run dev:server`
Wait for the boot log to settle.

- [ ] **Step 2: Time an unauthenticated endpoint**

Run: `curl -s -o /dev/null -w "total: %{time_total}s\n" http://localhost:3000/api/health`
Expected: `total: 6.0xx` (about 6 seconds), proving the delay is server-side and global, not client rendering.

- [ ] **Step 3: Confirm the source of the delay**

Run: `grep -n "VIRLY_THROTTLE_MS" server/.env`
Expected: `58:VIRLY_THROTTLE_MS=6000`.
Record both observations in the PR description later; do not fix anything yet.

---

## Task 2: `resolveDevThrottleMs` with a production guard (TDD)

**Files:**
- Create: `server/src/middleware/devThrottle.ts`
- Test: `server/src/middleware/__tests__/devThrottle.test.ts`

**Interfaces:**
- Consumes: nothing (pure function over an env-shaped object).
- Produces:
  - `function resolveDevThrottleMs(env: Pick<NodeJS.ProcessEnv, "VIRLY_THROTTLE_MS" | "NODE_ENV">): number`
  - `function devThrottleMiddleware(throttleMs: number): RequestHandler`
  - `function warnDevThrottleActive(throttleMs: number): void`

- [ ] **Step 1: Write the failing test**

```ts
// server/src/middleware/__tests__/devThrottle.test.ts
import { resolveDevThrottleMs } from "../devThrottle.js";

describe("resolveDevThrottleMs", () => {
  test("returns 0 when VIRLY_THROTTLE_MS is unset", () => {
    expect(resolveDevThrottleMs({})).toBe(0);
  });

  test("parses a positive integer", () => {
    expect(resolveDevThrottleMs({ VIRLY_THROTTLE_MS: "1500" })).toBe(1500);
  });

  test("returns 0 for non-numeric, negative, or zero values", () => {
    expect(resolveDevThrottleMs({ VIRLY_THROTTLE_MS: "abc" })).toBe(0);
    expect(resolveDevThrottleMs({ VIRLY_THROTTLE_MS: "-200" })).toBe(0);
    expect(resolveDevThrottleMs({ VIRLY_THROTTLE_MS: "0" })).toBe(0);
  });

  test("floors fractional values", () => {
    expect(resolveDevThrottleMs({ VIRLY_THROTTLE_MS: "99.9" })).toBe(99);
  });

  test("returns 0 in production even when set", () => {
    expect(
      resolveDevThrottleMs({ VIRLY_THROTTLE_MS: "6000", NODE_ENV: "production" })
    ).toBe(0);
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npm run test:server -- src/middleware/__tests__/devThrottle.test.ts`
Expected: FAIL - cannot find module `../devThrottle.js`.

- [ ] **Step 3: Implement the module**

```ts
// server/src/middleware/devThrottle.ts
import type { RequestHandler } from "express";

type ThrottleEnv = Pick<NodeJS.ProcessEnv, "VIRLY_THROTTLE_MS" | "NODE_ENV">;

/**
 * Dev-only latency simulator control. Reads VIRLY_THROTTLE_MS directly from the
 * env (documented exception to the config.ts rule; see docs/configuration.md).
 * Hard-disabled in production so a leftover value can never slow real traffic.
 */
export function resolveDevThrottleMs(env: ThrottleEnv): number {
  if (env.NODE_ENV === "production") {
    return 0;
  }
  const parsed = Number(env.VIRLY_THROTTLE_MS);
  if (!Number.isFinite(parsed) || parsed <= 0) {
    return 0;
  }
  return Math.floor(parsed);
}

export function devThrottleMiddleware(throttleMs: number): RequestHandler {
  return (_req, _res, next) => {
    setTimeout(next, throttleMs);
  };
}

export function warnDevThrottleActive(throttleMs: number): void {
  console.warn(
    `[virly] VIRLY_THROTTLE_MS=${throttleMs} is active: EVERY API response is delayed by ${throttleMs}ms. ` +
      "This is a dev-only latency simulator (docs/configuration.md). Unset it if pages feel slow."
  );
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `npm run test:server -- src/middleware/__tests__/devThrottle.test.ts`
Expected: PASS (5 tests).

- [ ] **Step 5: Commit**

```bash
git add server/src/middleware/devThrottle.ts server/src/middleware/__tests__/devThrottle.test.ts
git commit -m "feat(server): guarded dev throttle resolver with production kill-switch"
```

---

## Task 3: Wire `app.ts` to the guarded module

**Files:**
- Modify: `server/src/app.ts`

**Interfaces:**
- Consumes: `resolveDevThrottleMs`, `devThrottleMiddleware`, `warnDevThrottleActive` (Task 2).

- [ ] **Step 1: Replace the inline throttle block**

In `server/src/app.ts`, add to the imports at the top (matching the file's existing `./` + `.js` style):

```ts
import {
  devThrottleMiddleware,
  resolveDevThrottleMs,
  warnDevThrottleActive
} from "./middleware/devThrottle.js";
```

Then replace the entire block quoted in "Root cause" above (the comment plus the `const throttleMs ... }` lines) with:

```ts
// Dev latency simulator: see middleware/devThrottle.ts. Hard-disabled in
// production and warns loudly at boot when active, so a leftover env value
// can never silently slow every request again.
const throttleMs = resolveDevThrottleMs(process.env);
if (throttleMs > 0) {
  warnDevThrottleActive(throttleMs);
  app.use(devThrottleMiddleware(throttleMs));
}
```

- [ ] **Step 2: Typecheck and run the server suite**

Run: `npx tsc -p server/tsconfig.json --noEmit && npm run test:server`
Expected: no type errors, all tests PASS.

- [ ] **Step 3: Commit**

```bash
git add server/src/app.ts
git commit -m "fix(server): route dev throttle through guarded module with boot warning"
```

---

## Task 4: Clean the local env and document the trap

**Files:**
- Local edit (NOT committed): `server/.env` - delete the `VIRLY_THROTTLE_MS=6000` line.
- Modify: `server/.env.example`
- Modify: `docs/configuration.md`

- [ ] **Step 1: Remove the live value locally**

Edit `server/.env` and delete line 58 (`VIRLY_THROTTLE_MS=6000`).
This file is gitignored; the change is operational, not a commit.

- [ ] **Step 2: Document the variable in `.env.example`**

Add to `server/.env.example` (keep alphabetical/section placement consistent with neighboring entries):

```bash
# Dev-only latency simulator: delays EVERY API response by this many ms.
# Ignored in production. Leave unset for normal development.
# VIRLY_THROTTLE_MS=1500
```

- [ ] **Step 3: Update `docs/configuration.md`**

Find the `VIRLY_THROTTLE_MS` row (currently says: "When set to a positive integer, a dev middleware delays every response by that many ms — handy for previewing the client boot/loading splash against a slow API. Off unless present").
Rewrite it to state, on separate sentences: it delays every response, not only boot; it is ignored when `NODE_ENV=production`; the server prints a `[virly] VIRLY_THROTTLE_MS=... is active` warning at boot while it is on.

- [ ] **Step 4: Commit the committable parts**

```bash
git add server/.env.example docs/configuration.md
git commit -m "docs(config): document VIRLY_THROTTLE_MS dev-only semantics and boot warning"
```

---

## Task 5: Verify end-to-end (mirror of Task 1)

**Files:** none.

- [ ] **Step 1: Restart the dev server**

Run: `npm run dev:server`
Expected: no `[virly] VIRLY_THROTTLE_MS` warning in the boot log (the value is gone).

- [ ] **Step 2: Re-time the endpoint**

Run: `curl -s -o /dev/null -w "total: %{time_total}s\n" http://localhost:3000/api/health`
Expected: `total: 0.0xx` (tens of milliseconds).

- [ ] **Step 3: Confirm the warning fires when the simulator is wanted**

Run: `VIRLY_THROTTLE_MS=1500 npm run dev:server`
Expected: boot log contains `[virly] VIRLY_THROTTLE_MS=1500 is active: EVERY API response is delayed by 1500ms.` and `curl` now shows ~1.5s.
Stop the server and start it normally afterwards.

- [ ] **Step 4: Full suite**

Run: `npm test`
Expected: PASS.

---

## Self-Review

- **Spec coverage:** the task's two claims are both addressed: "affects every api call" (reproduced in Task 1, verified fixed in Task 5) and "throttle at the start" (the misconception is corrected in docs, and the boot warning makes the real semantics visible).
- **Placeholder scan:** none; every step has exact code or exact commands.
- **Type consistency:** `resolveDevThrottleMs` / `devThrottleMiddleware` / `warnDevThrottleActive` names match between Task 2 (definition), Task 3 (wiring), and the tests.

## Open questions (answer later)

1. Should the throttle also be surfaced in `/api/health` output (e.g. `{ status: "ok", devThrottleMs: 1500 }`) so the client dev tools can display it? Deferred; the boot warning covers the observed failure mode.
2. `docker-compose` dev flows pass env via compose files; if a compose file ever sets `VIRLY_THROTTLE_MS`, the same guard applies, but check `docker-compose.yml` when executing this plan and remove any stale value there too.
