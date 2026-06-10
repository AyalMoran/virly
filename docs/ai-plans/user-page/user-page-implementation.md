# User Profile Page — Implementation Reference

Implemented June 2026 per `user-page-plan.md` (see `user-page-plan.log` for the
step-by-step record and plan deviations).

## Data model context

Transactions in this app are **per-owner ledger entries**
(`ownerId`, `counterpartyEmail`, `amount`, `type: "credit" | "debit"`), written
in pairs inside a Mongo transaction by `transfer.service.ts`. There is no
sender/receiver row and no status column: every stored entry is a completed
transfer. The plan's `(sender=viewer AND receiver=viewed) OR (sender=viewed AND
receiver=viewer)` rule therefore maps to:

```ts
Transaction.find({ ownerId: viewerId, counterpartyEmail: viewedUser.email })
```

which is privacy-safe by construction — only the viewer's own ledger is ever
read. Direction relative to the viewer: `debit` → `sent`, `credit` → `received`.
Totals are completed-only by construction (no pending/failed entries exist).

## Backend

### Endpoints (both `requireAuth`; mounted at `/api/users`, additive — no
existing contract changed)

- `GET /api/users/:userId/profile` →
  `{ user: PublicUserProfileDto, relationship: UserRelationshipSummaryDto, recentTransactions: UserRelationshipTransactionDto[] }`
  (recent list capped at 5, newest first)
- `GET /api/users/:userId/transactions?page=1&limit=20` →
  `{ transactions: UserRelationshipTransactionDto[], pagination: { page, limit, total, totalPages } }`
  (shared transactions only, newest first; limit clamped to 50 by the shared
  pagination parser)

`:userId` accepts a Mongo ObjectId **or** an email address (the product's
user-facing identifier); disambiguated by ObjectId regex — an email can never
match it.

Error handling: `401` unauthenticated (cookie middleware) or token user no
longer exists; `404` unknown user / non-id non-email identifier; `500` via the
shared error handler. `403` is not applicable: any authenticated user may view
any profile's *safe* fields, the same visibility the transfer flow already
grants. Self-profile returns `relationshipStatus: "self"`, zeroed totals,
`canTransferToUser: false`, and an empty transaction list.

### DTOs (`server/src/utils/user-profile-dto.ts`)

- `PublicUserProfileDto`: `id`, `email`, `displayName`, `isVerified`,
  `memberSince` (account `createdAt`). Display name uses PersonalDetails
  first/last name when status is `provided` (names only — DOB and address are
  never read into the response), else is derived from the email local part.
- `UserRelationshipSummaryDto`: `viewerUserId`, `viewedUserId`,
  `totalSentToUser`, `totalReceivedFromUser`, `netAmount` (sent − received,
  2-decimal rounded), `transactionCount`, `lastTransactionAt`,
  `isVerifiedRecipient` (viewed user's email verification),
  `canTransferToUser` (`!self`; mirrors `transfer.service` rules),
  `relationshipStatus`: `self | no_history | has_history | verified_recipient`.
- `UserRelationshipTransactionDto`: `id`, `amount` (positive), `direction`
  (`sent | received`, viewer-relative), `status` (always `"completed"`),
  `createdAt`, `description` (the transfer reason).

## Frontend

- Route: `/users/:userId` (id or URL-encoded email), inside the protected
  `AppShell`; lazy-loaded with a skeleton fallback (own build chunk).
- Components (`client/src/features/users/`):
  - `UserProfilePage` — fetch, state machine (loading / 404 / error+retry /
    self / empty / normal), Send Money handoff.
  - `UserProfileHeader` — avatar, name, verified badge, email, member-since.
  - `RelationshipSummaryCard` — you-sent / you-received / net, count, last
    interaction (tabular numerals).
  - `RecipientStatusCard` — verified / not-verified / self messaging + Send
    Money when transfers are possible.
  - `RecentRelationshipTransactions` — card-based rows (no table) with
    viewer-relative direction; "View all" switches to the paginated endpoint.
  - `EmptyRelationshipState` — no-history CTA.
- API client: `api.userProfile`, `api.userRelationshipTransactions`.
- Send Money: writes the existing `virly-prefill-recipient` sessionStorage key
  and navigates to `/transfer` — recipient preselected only; the user still
  enters the amount, reviews, and confirms; the backend still validates
  everything. No transfer is created by viewing or by the button itself.
- Entry points: counterparty names in `TransactionList` rows (row activation
  ignores clicks/Enter on the inner link), per-contact profile buttons in
  `QuickContacts` (dashboard Quick Send), recipient line on the Transfer
  review step.
- Responsive: desktop two-column (main + 340px sidebar via the existing
  `responsive-grid-sidebar`); mobile single column, 44px+ targets, wrap-safe
  long emails/amounts.

## Privacy boundaries

Exposed for the viewed user: `id`, `email` (already the public account
identifier across transfers/history), `displayName`, `isVerified`,
`memberSince` — plus relationship data derived **only** from the viewer's own
ledger. Never exposed: balance, phone, role, password/verification hashes,
personal details (DOB/address), unrelated transactions, other counterparties,
or any internal metadata. Backend tests assert the exact `user` key set and
the absence of private values in the full response payload.

Known, accepted boundary: an authenticated user can learn whether an email is
registered (404 vs 200) — identical to the existing transfer flow's
"Recipient email does not exist" behavior.

## Tests

- `server/src/userProfile.routes.test.ts` (6): unauthenticated 401; unknown
  user + invalid identifier 404; safe-field whitelist + private-field absence;
  totals/net/lastTransactionAt + viewer-relative direction; no_history empty
  relationship; self profile; shared-ledger-only filter + pagination metadata.
- `client/tests/userProfileComponents.test.tsx` (6): header identity/badge/
  action, summary totals, direction labels + debit/credit classes, verified
  recipient status, self status hides transfer action, empty state CTA.

## Verification results

- Server: `tsc --noEmit` clean; tests 208/209 (the 1 failure is the
  pre-existing `videoSession` Jitsi RS256 key test, fails on clean HEAD too).
- Client: `tsc -b` clean; `vite build` ok; tests 14/15 (the 1 failure is the
  pre-existing assistant transfer-limits markdown e2e).

## Remaining limitations

- No dedicated `/users/me` self route; visiting your own id/email shows the
  self state with links to dashboard/transactions/settings.
- "Blocked recipient" status from the plan is not modeled — the product has no
  block list; the enum omits `blocked` until such a concept exists.
- Send-money navigation isn't covered by an automated test (the static-markup
  test runner can't simulate clicks); covered by the shared sessionStorage
  handoff already used in production by QuickContacts.
- The transactions page's counterparty filter isn't URL-driven, so the profile
  page links to `/transactions` generally rather than pre-filtered.
