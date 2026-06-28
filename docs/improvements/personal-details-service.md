# Consolidate `PersonalDetails` access into a service

> **✅ Implemented.** `server/src/services/personalDetails.service.ts` now owns
> `ensureForUser` (an idempotent upsert via the repository, fixing the
> write-on-read race), `getForUser`, `getDisplayName` (replacing the route's
> `getViewedUserDisplayName`), and `markSkipped`. The old side-effecting
> `ensurePersonalDetails`/`user.save()` in `utils/personal-details.ts` is gone,
> and `user.routes.ts`/`userProfile.routes.ts` go through the service. The
> `PersonalDetails.findOne` direct query in the route has been removed.

**Priority:** Medium · **Effort:** Small–Medium · **Risk:** Low

## Problem

`PersonalDetails` access is split across two styles:

- `server/src/utils/personal-details.ts` — `ensurePersonalDetails(user)` lazily
  creates the doc **and writes** (`user.save()`) on read paths. It is called from
  `GET /auth/me`, `GET /users/me`, and `GET /users/personal-details`, so plain
  GET requests perform writes and can race (the project review flagged this as a
  side-effecting read).
- `server/src/routes/userProfile.routes.ts:40` — a separate, direct
  `PersonalDetails.findOne({ userId })` in `getViewedUserDisplayName`.

So the same entity is reached two different ways, and the lazy-backfill mutates
state during reads.

## Proposed service

`server/src/services/personalDetails.service.ts`:

```ts
export const personalDetailsService = {
  // idempotent: upsert on (userId), only patches user.personalDetails when null
  ensureForUser(user: UserDocument): Promise<PersonalDetailsDocument>;
  getForUser(userId: string): Promise<PersonalDetailsDocument | null>;
  getDisplayName(userId: string): Promise<{ firstName; lastName } | null>; // "provided" only
  update(userId: string, input: PersonalDetailsInput): Promise<PersonalDetailsDocument>;
  markSkipped(userId: string): Promise<PersonalDetailsDocument>;
};
```

`ensureForUser` should use `findOneAndUpdate(..., { upsert: true })` keyed on
`userId` so it is idempotent and not a write-on-read (fixes the side-effect +
race). `getDisplayName` replaces `getViewedUserDisplayName` in the route.

## Migration steps

1. Move `ensurePersonalDetails` / `toPersonalDetailsDto` logic into the service
   (the DTO mapper can stay in `utils/personal-details.ts` and be re-exported).
2. Make the lazy backfill idempotent via upsert.
3. Replace the direct `PersonalDetails.findOne` in `userProfile.routes.ts` with
   `personalDetailsService.getDisplayName`.
4. Point `user.routes.ts` (`PUT` / `POST /skip`) at `update` / `markSkipped`.

## Reference

This pairs naturally with the [`AccountService`](account-service.md) extraction,
since both are loaded together on the `/me`-style endpoints.
