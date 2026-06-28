# Backend area: Cross-cutting (middleware / utils)

> The middleware pipeline and the utility/DTO modules shared across every area.
> No HTTP endpoints of their own. See [`../index.md`](../index.md) for layering.

**Middleware:** `server/src/middleware/*`
**Utils/DTOs:** `server/src/utils/*`

## Middleware

Wired in `server/src/app.ts` (global) or per-router (`requireAuth`, role guards).

| File | Export | Role |
|------|--------|------|
| `middleware/cookies.ts` | `parseCookies` | Global: parses the cookie header into `req.cookies` (runs before auth). |
| `middleware/auth.ts` | `requireAuth` | Verifies the `virly_auth` JWT, sets `req.userId` + `req.csrfToken`, enforces CSRF on unsafe methods. |
| `middleware/roles.ts` | `requireAnyVideoAgentRole`, `getAllowedVideoSessionTypes`, `isSupportVideoRole`, `isSalesVideoRole` | Gates the admin video-session router by user role. |
| `middleware/error-handler.ts` | `errorHandler` | Terminal handler: maps `AppError` → its status/`code`, `ZodError` → 400 with `issues`, unknown → generic 500. |

The auth/CSRF/JWT model and the error envelope are documented in
[API reference §2 + §3](../../api/README.md#2-authentication-and-csrf) — not
repeated here.

## Utils / DTOs

| File | Exports | Role |
|------|---------|------|
| `utils/app-error.ts` | `AppError` | HTTP status + optional machine-readable `code` (e.g. `QUOTE_REQUIRED`). |
| `utils/auth.ts` | `AUTH_COOKIE_NAME`, `CSRF_COOKIE_NAME`, `SESSION_TOKEN_EXPIRES_IN`, `PERSISTENT_SESSION_EXPIRES_IN` | Cookie names + token lifetimes (`virly_auth`/`virly_csrf`, 7d/30d). |
| `utils/session.ts` | `setAuthCookies`, `clearAuthCookies`, `createCsrfToken`, `hashCsrfToken` | Issues/clears the auth + CSRF cookies; CSRF token create/hash. |
| `utils/token.ts` | `hashToken`, `verificationTokenExpiry` | Email-verification token hashing + expiry. |
| `utils/otp.ts` | `randomStartingBalance`, … | Randomisation helpers (e.g. seed balance for new accounts). |
| `utils/pagination.ts` | `parsePagination`, `getPaginationMeta` | Page/limit parsing + the `pagination` response object. |
| `utils/personal-details.ts` | `toAuthUserDto`, `toPersonalDetailsDto` | User + personal-details → API DTOs. |
| `utils/transaction-dto.ts` | `toTransactionDto` | Ledger entry → API DTO. |
| `utils/user-profile-dto.ts` | `toPublicUserProfileDto`, `toRelationshipTransactionDto`, `resolveRelationshipStatus`, `roundMoney`, relationship DTO types | Public-profile + relationship DTOs and status resolution. |
| `utils/env.ts` | `getStringEnv`, `getOptionalStringEnv`, `getBooleanEnv`, `getIntEnv` | Typed environment-variable readers used by `config.ts`. |

## Cross-cutting notes

- **Pagination is page/limit, not cursor.** This is deliberate for user-scoped,
  bounded ledgers — see [API reference §4](../../api/README.md#4-pagination) and
  the residual follow-up noted in
  [`../../improvements/README.md`](../../improvements/README.md).
- **DTO mappers are the boundary between repository records and API responses.**
  Routes return DTOs, never raw records, so the wire shape is decoupled from the
  driver row/document shape.
- **Errors never leak internals.** Plain `Error` objects that reach
  `errorHandler` become a generic 500; only `AppError` messages/codes are
  surfaced.
