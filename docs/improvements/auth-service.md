# Extract an `AuthService` from `auth.routes.ts`

> **✅ Implemented (commit `672869d`).** `server/src/services/auth.service.ts`
> now owns `register`, `verifyEmail`, `login`, and `resendVerification` and
> throws `AppError` for the 401/403/409 cases; `auth.routes.ts` is reduced to
> parsing, cookie issuance, and DTO shaping. The auth tests called for here were
> added (`server/src/auth.service.test.ts`). Line numbers below reflect the
> pre-refactor handler and are kept only as a historical record.

**Priority:** High · **Effort:** Medium–Large · **Risk:** Medium (security-sensitive)

## Problem

`server/src/routes/auth.routes.ts` is the one route file where substantial
business logic still lives in the handlers. The route currently owns:

- password hashing and comparison — `bcrypt.hash` (`:78`), `bcrypt.compare` (`:169`)
- user creation — `User.create` (`:79`)
- verification-token issuance + persistence — `sendNewVerificationLink` (`:45`)
- verification-token validation, expiry/match checks, and the
  already-verified short-circuit — `/verify` (`:97`–`:139`)
- the unverified-login gate (`:174`) and the user-enumeration-safe resend (`:147`)

Mixing this with HTTP concerns makes the security-critical paths hard to unit
test in isolation (the project review flagged `auth.routes.ts` as having **zero**
route-level tests) and hard to reuse.

## Proposed service

`server/src/services/auth.service.ts` — framework-agnostic, throws `AppError`:

```ts
export const authService = {
  register(input: { email; password; phone }): Promise<{ user; verificationToken }>;
  verifyEmail(token: string): Promise<{ user; alreadyVerified: boolean }>; // throws AppError(400) on invalid/expired
  login(creds: { email; password }): Promise<UserDocument>;                // throws AppError(401/403)
  resendVerification(email: string): Promise<void>;                        // no-op silently if absent/verified
};
```

The route stays responsible only for cookie issuance (`setAuthCookies` /
`clearAuthCookies`) and response shaping (`createAuthResponse`), which depend on
`res` and so belong in the controller. Example:

```ts
router.post("/login", async (req, res, next) => {
  try {
    const { email, password, rememberMe } = loginSchema.parse(req.body);
    const user = await authService.login({ email, password });
    const csrfToken = setAuthCookies(res, user.id, { rememberMe });
    return res.json(await createAuthResponse(user, csrfToken));
  } catch (error) {
    next(error);
  }
});
```

Note the `401`/`403` decisions (`Invalid email or password`, `Verify your email`)
become `AppError`s thrown by the service and rendered by the central handler —
no inline status returns.

## Migration steps

1. Build `auth.service.ts` on top of the [`AccountService`](account-service.md)
   (`findByEmail` / `create` / `getById`).
2. Move `sendNewVerificationLink` and `createAuthResponse`'s data parts into the
   service; keep cookie + DTO shaping in the route.
3. **Write the auth tests as you go** (register/login/verify/resend, incl. the
   unverified gate and enumeration-safe resend) — this is the highest-value test
   gap in the project.

## Reference

`transfer.service.ts` shows the throw-`AppError`-from-service, map-in-route split.
