# ADR-0005: HttpOnly-JWT-cookie + CSRF double-submit auth

**Status:** Accepted
**Date:** 2026-06-22
**Source:** [`docs/security.md`](../security.md) — §2 "Authentication and session", §2.1–2.3. Code: `server/src/middleware/auth.ts` (CSRF check lines 26–43), `server/src/utils/session.ts` (cookie issuance lines 36–55).

---

## Context

A single-page application served from a separate origin from the API needs
session credentials that are resistant to XSS and CSRF. Storing the JWT in
`localStorage` is simple but exposes it to any XSS payload. An `HttpOnly` cookie
hides the JWT from JavaScript but opens CSRF risk for unsafe methods. A
double-submit CSRF scheme closes that gap without server-side session state.
Full details in [`../security.md`](../security.md).

## Decision

Login and email-verification responses set two cookies:

- `virly_auth` — HttpOnly, Secure: signed JWT carrying `userId` and
  `csrfTokenHash`. Never readable by JavaScript.
- `virly_csrf` — Secure, JS-readable: raw CSRF token.

On every `POST`/`PUT`/`PATCH`/`DELETE`, `requireAuth` (`server/src/middleware/auth.ts`)
reads the `X-CSRF-Token` header, SHA-256 hashes it, and compares it to
`payload.csrfTokenHash` inside the JWT. A mismatch returns `403`. The JWT itself
is verified with the `jsonwebtoken` library (`jwt.verify`), never by hand.

## Alternatives considered

| Alternative | Why not chosen |
|---|---|
| JWT in `localStorage` | Exposed to XSS; any script running on the page can read and exfiltrate the token. |
| `SameSite=Strict` cookie only | Breaks cross-origin SPA+API deployments (Vercel frontend + Render API); CORS `credentials: true` requires `SameSite=None` in production. |
| Server-side session store (Redis) | Adds an infrastructure dependency; stateless JWTs are sufficient given the short session window and fast key-rotation path. |

## Status

Accepted — the two-cookie scheme, CSRF header check, and `jwt.verify`-based
validation are live. Covered by `server/src/authCookie.test.ts`.

## Consequences

**Positive:** JWT is not reachable by XSS; CSRF is blocked without server-side
state; stateless JWT means no session-store dependency.

**Negative / trade-offs:** CSRF token must be threaded through every client
request; logout requires an explicit `/api/auth/logout` call to clear cookies
(the client cannot rely on GC). The `SameSite=None` production setting requires
HTTPS (`Secure` flag).

**Neutral / follow-on work:** JWT revocation (e.g. on password reset) requires
a denylist or short-lived tokens; that is not yet implemented and is an accepted
known gap.
