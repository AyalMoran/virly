# Backend area: Auth

> Identity, email verification, session, and CSRF. Mounted at `/api/auth` (rate
> limited by `authLimiter` in production). See
> [`../index.md`](../index.md) for the layering rules and
> [`../../api/README.md`](../../api/README.md) for full request/response shapes.

**Router:** `server/src/routes/auth.routes.ts`
**Services:** `server/src/services/auth.service.ts`,
`server/src/services/account.service.ts`,
`server/src/services/personalDetails.service.ts`,
`server/src/services/email.service.ts`
**Utils:** `server/src/utils/session.ts`,
`server/src/utils/token.ts`, `server/src/utils/auth.ts`,
`server/src/utils/personal-details.ts`

## Endpoints

| Method | Path | Auth | Handler calls | Notes |
|--------|------|------|---------------|-------|
| POST | `/api/auth/register` | No | `authService.register` | Creates user + sends verification email; returns 201 with a message only. |
| GET | `/api/auth/verify` | No | `authService.verifyEmail` → `setAuthCookies` | Token in query; on success sets auth + CSRF cookies and returns the user DTO. |
| POST | `/api/auth/resend-verification` | No | `authService.resendVerification` | Always returns the same neutral message (no account enumeration). |
| POST | `/api/auth/login` | No | `authService.login` → `setAuthCookies` | `rememberMe` selects 7d vs 30d cookie lifetime. |
| GET | `/api/auth/me` | Yes | `accountService.findById` | Returns the current user DTO + `csrfToken` from `req.csrfToken`. |
| POST | `/api/auth/logout` | Yes (+ CSRF) | `clearAuthCookies` | Clears both cookies. |

Request/response bodies: [API reference §1 (Authentication)](../../api/README.md#1-endpoint-groups).

## Layer walk

- **Route** validates with Zod (`registerSchema`, `loginSchema`,
  `verifyQuerySchema`, `resendVerificationSchema`), calls the auth/account
  services, and builds the response DTO via `createAuthResponse` →
  `toAuthUserDto` (`utils/personal-details.ts`). On register/verify it also
  ensures a `PersonalDetails` record exists (`personalDetailsService.ensureForUser`).
- **Service** (`auth.service.ts`) owns credential logic: password hashing,
  verification-token issue/check (`utils/token.ts`), and the
  register/verify/login/resend flows. `account.service.ts` owns user lookup.
  `email.service.ts` sends the verification email.
- **Session** (`utils/session.ts`) issues the JWT + CSRF token and sets/clears
  the `virly_auth` / `virly_csrf` cookies; names + lifetimes live in
  `utils/auth.ts`.
- **Repository** access is via the seam (`users`, `personalDetails`); no model
  is touched directly.

## Cross-cutting

- `requireAuth` (`middleware/auth.ts`) guards `me` and `logout`; CSRF is checked
  on unsafe methods. The full cookie/CSRF/JWT model is documented in
  [API reference §2](../../api/README.md#2-authentication-and-csrf) and
  [`../../security.md`](../../security.md) — not repeated here.
