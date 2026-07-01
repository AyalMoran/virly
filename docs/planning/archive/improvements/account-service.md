# Extract an `AccountService` for `User` access

> **✅ Implemented (commit `625b4b4`).** `server/src/services/account.service.ts`
> now exposes `getById` (safe projection via `users.findByIdSafe`), `findById`,
> `findByEmail`, `findByIdOrEmail` (replacing the route's `findViewedUser`), and
> `create`. `auth.routes.ts`, `user.routes.ts`, and `userProfile.routes.ts` all
> import and use it; none touch the `User` model directly. The line numbers in
> the problem statement below are from the pre-refactor code and are kept only as
> a historical record.

**Priority:** High · **Effort:** Medium · **Risk:** Low–Medium

## Problem

The `User` model is queried directly from three route files, with no single
owner of "load this user" / "create a user" logic:

- `server/src/routes/auth.routes.ts` — `User.findOne` (`:73`, `:145`, `:163`),
  `User.create` (`:79`), `User.findById` (`:108`, `:187`)
- `server/src/routes/user.routes.ts` — `User.findById` (`:50`, `:84`, `:100`, `:123`)
- `server/src/routes/userProfile.routes.ts` — `User.findById` (`:28`, `:98`, `:165`),
  `User.findOne` (`:36`)

Consequences of the scatter:

- **Inconsistent field projection.** `user.routes.ts:50` is careful to
  `.select("-passwordHash -verificationTokenHash")`, but `userProfile.routes.ts`
  and `auth.routes.ts` load the full document, so the password hash travels
  further than it needs to. A service centralizes a safe default projection.
- **Duplicated "find-or-404" boilerplate** in every handler.
- **The email-or-id lookup** (`findViewedUser`, `userProfile.routes.ts:26`) is a
  reusable account concern living in a route file.

## Proposed service

`server/src/services/account.service.ts`:

```ts
export const accountService = {
  // safe projection (no passwordHash / verificationTokenHash) by default
  getById(userId: string): Promise<UserDocument>;            // throws AppError(404) if missing
  findById(userId: string): Promise<UserDocument | null>;
  findByEmail(email: string): Promise<UserDocument | null>;  // normalizes + lowercases
  findByIdOrEmail(identifier: string): Promise<UserDocument | null>; // replaces findViewedUser
  create(input: { email: string; passwordHash: string; phone: string }): Promise<UserDocument>;
};
```

Routes then read e.g. `const user = await accountService.getById(req.userId)`
and let the thrown `AppError(404)` flow to the central error handler instead of
re-implementing the 404 each time.

## Migration steps

1. Add `account.service.ts` with the functions above; give `getById` a default
   `.select(...)` that omits secrets.
2. Replace direct `User.*` calls in `user.routes.ts` and `userProfile.routes.ts`
   first (read-only, lowest risk).
3. Move `findViewedUser` into the service as `findByIdOrEmail`.
4. Do `auth.routes.ts` last and alongside the [`AuthService`](auth-service.md)
   extraction, since they share `create`/`findByEmail`.

## Reference

Model to copy: `videoSession.service.ts` (routes never touch the model).
