# Plan: Add a User Page With Relationship-Specific Interaction Data

## 1. Feature Goal

Add a dedicated user profile page where an authenticated user can view general public/profile information about another user and private relationship-specific information between the viewer and that user.

Example:

User A opens User B’s page.

User A can see:

```txt
General User B information:
- Name
- Avatar
- Username / handle
- Account package / user type, if public
- Verification status
- Join date, if allowed
- Basic profile metadata

Relationship-specific information:
- Total amount User A sent to User B
- Total amount User A received from User B
- Net balance between them
- Number of transactions between them
- Last transaction date
- Recent transactions between them
- Whether User B is a verified recipient
- Available transfer action
```

The page must never expose User B’s private financial data unrelated to User A.

---

# 2. Product Behavior

## Page URL

Use a route like:

```txt
/users/:userId
```

or, if usernames are stable:

```txt
/u/:username
```

Recommended:

```txt
/users/:userId
```

because internal IDs are more reliable than names or emails.

Optional later enhancement:

```txt
/u/:handle
```

---

## Main Page Sections

### A. User Header

Shows general safe user information:

```txt
Avatar
Display name
Username or handle
Verified badge
Short user status, if relevant
Primary action: Send money
Secondary action: View transactions
```

Example UI:

```txt
[Avatar]  Daniel Cohen  [Verified]
          @danielc
          Recipient since: March 2026

[Send Money] [View Transactions]
```

---

### B. Relationship Summary Card

Shows transaction-level summary between the authenticated viewer and the viewed user.

Example:

```txt
Between you and Daniel

You sent: ₪1,240
You received: ₪450
Net: ₪790 sent
Transactions: 8
Last interaction: June 3, 2026
```

Important: this is not User B’s account summary. It is only the relationship between the current authenticated user and User B.

---

### C. Recent Transactions Together

Show only transactions where:

```txt
(senderId = viewerId AND receiverId = viewedUserId)
OR
(senderId = viewedUserId AND receiverId = viewerId)
```

Suggested columns/cards:

```txt
Direction
Amount
Date
Status
Reference
Description / note
```

Desktop can use a table.

Mobile should use cards:

```txt
Sent to Daniel
₪120
Completed
June 3, 2026
Reference: TRX-...
```

---

### D. Recipient / Trust State

Show whether the viewed user is available for transfer.

Possible states:

```txt
Verified recipient
Not verified yet
Blocked recipient
Cannot transfer to this user
Self profile
```

Example messages:

```txt
Daniel is a verified recipient.
You can send money to this user.
```

or:

```txt
You have not transferred with Daniel before.
Start by creating a new transfer.
```

---

### E. Transfer Entry Point

Add a “Send Money” button that opens the existing transfer flow pre-filled with the viewed user as recipient.

Possible behavior:

```txt
/users/:userId -> click Send Money
/transfers/new?recipientId=:userId
```

or open an existing transfer modal/page.

Do not execute or prepare a transfer directly just from viewing the page.

---

# 3. Authorization and Privacy Rules

This feature needs strict backend ownership checks.

## Allowed Data

The viewer may see:

```txt
Viewed user's public profile fields
Transactions involving both viewer and viewed user
Relationship totals derived only from shared transactions
Recipient verification state between viewer and viewed user
```

## Forbidden Data

The viewer must not see:

```txt
Viewed user's balance
Viewed user's account numbers
Viewed user's unrelated transactions
Viewed user's other counterparties
Viewed user's private recipient list
Viewed user's loans, limits, or package details unless public
Internal fraud/risk metadata
Private emails unless already exposed elsewhere
```

## Self-Profile Case

If User A opens their own page:

```txt
/users/me
```

or

```txt
/users/:ownUserId
```

Then show a different version:

```txt
General profile info
Account summary link
Recent own activity link
Settings/profile edit link
```

Do not show “relationship with yourself” metrics.

---

# 4. Backend Plan

## A. Add Profile DTOs

Create a safe DTO for public user profile data.

Example:

```ts
export type PublicUserProfileDto = {
  id: string;
  displayName: string;
  username?: string;
  avatarUrl?: string;
  isVerified: boolean;
  createdAt?: string;
};
```

Avoid returning raw database user objects.

---

## B. Add Relationship DTO

```ts
export type UserRelationshipSummaryDto = {
  viewedUserId: string;
  viewerUserId: string;

  totalSentToUser: number;
  totalReceivedFromUser: number;
  netAmount: number;

  transactionCount: number;
  lastTransactionAt: string | null;

  isVerifiedRecipient: boolean;
  canTransferToUser: boolean;

  relationshipStatus:
    | "no_history"
    | "has_history"
    | "verified_recipient"
    | "blocked"
    | "self";
};
```

---

## C. Add Transaction DTO

```ts
export type UserRelationshipTransactionDto = {
  id: string;
  reference: string;
  amount: number;
  currency: string;
  direction: "sent" | "received";
  status: "pending" | "completed" | "failed" | "cancelled";
  createdAt: string;
  description?: string;
  counterparty: {
    id: string;
    displayName: string;
    avatarUrl?: string;
  };
};
```

---

## D. Add API Endpoint

Recommended endpoint:

```http
GET /api/users/:userId/profile
```

Returns:

```ts
{
  user: PublicUserProfileDto;
  relationship: UserRelationshipSummaryDto;
  recentTransactions: UserRelationshipTransactionDto[];
}
```

Alternative split endpoints:

```http
GET /api/users/:userId
GET /api/users/:userId/relationship
GET /api/users/:userId/transactions
```

Recommended for this feature: one combined profile endpoint for initial page load.

Pros:

```txt
Fewer frontend requests
Simpler loading state
Single authorization boundary
Better for profile page rendering
```

Cons:

```txt
Less reusable
May grow too large later
```

A good compromise:

```http
GET /api/users/:userId/profile
GET /api/users/:userId/transactions?page=1&limit=20
```

The profile endpoint returns summary and a small recent transaction preview. The transactions endpoint handles pagination.

---

## E. Backend Query Rules

Relationship transactions query:

```ts
const sharedTransactions = await Transaction.find({
  $or: [
    { senderId: viewerUserId, receiverId: viewedUserId },
    { senderId: viewedUserId, receiverId: viewerUserId },
  ],
});
```

For SQL:

```sql
WHERE
  (sender_id = :viewerUserId AND receiver_id = :viewedUserId)
  OR
  (sender_id = :viewedUserId AND receiver_id = :viewerUserId)
```

Relationship totals:

```txt
totalSentToUser:
  sum transactions where senderId = viewerUserId and receiverId = viewedUserId

totalReceivedFromUser:
  sum transactions where senderId = viewedUserId and receiverId = viewerUserId

netAmount:
  totalSentToUser - totalReceivedFromUser
```

Only include valid statuses in totals.

Recommended:

```txt
Completed transactions only for financial totals.
Pending transactions may appear separately.
Failed/cancelled transactions should not affect totals.
```

---

# 5. Frontend Plan

## A. Add Route

Example with React Router:

```tsx
<Route path="/users/:userId" element={<UserProfilePage />} />
```

Optional:

```tsx
<Route path="/users/me" element={<OwnProfilePage />} />
```

---

## B. Page Component Structure

```txt
UserProfilePage
├── UserProfileHeader
├── RelationshipSummaryCard
├── RecipientStatusCard
├── RecentRelationshipTransactions
├── UserProfileActions
└── EmptyRelationshipState
```

---

## C. Suggested Components

### `UserProfilePage`

Responsibilities:

```txt
Read userId from route params
Fetch profile data
Handle loading, error, not found, unauthorized states
Render correct page state
```

---

### `UserProfileHeader`

Props:

```ts
type UserProfileHeaderProps = {
  user: PublicUserProfileDto;
  isSelf: boolean;
  onSendMoney?: () => void;
};
```

Shows avatar, name, handle, verification state, and actions.

---

### `RelationshipSummaryCard`

Props:

```ts
type RelationshipSummaryCardProps = {
  relationship: UserRelationshipSummaryDto;
};
```

Shows totals, transaction count, net position, and last interaction.

---

### `RecentRelationshipTransactions`

Props:

```ts
type RecentRelationshipTransactionsProps = {
  transactions: UserRelationshipTransactionDto[];
  viewedUser: PublicUserProfileDto;
};
```

Desktop: table.

Mobile: transaction cards.

---

### `RecipientStatusCard`

Props:

```ts
type RecipientStatusCardProps = {
  isVerifiedRecipient: boolean;
  canTransferToUser: boolean;
  relationshipStatus: UserRelationshipSummaryDto["relationshipStatus"];
};
```

Shows whether transfer is available.

---

# 6. UX States

## Loading State

Use skeleton cards:

```txt
Profile header skeleton
Summary card skeleton
Transactions skeleton
```

---

## User Not Found

```txt
User not found.
This profile may not exist or may no longer be available.
```

---

## Unauthorized

```txt
You cannot view this user profile.
```

Use this only if there is a real authorization restriction.

---

## No Shared History

```txt
You and Daniel have no transactions yet.

[Send Money]
```

---

## Has Shared History

Show summary and transactions.

---

## Self Profile

```txt
This is your profile.

[Account Summary]
[Settings]
[Transaction History]
```

Do not show relationship metrics with self.

---

# 7. Responsive Design

## Desktop Layout

Use a two-column layout:

```txt
Left / Main:
- Header
- Relationship summary
- Recent transactions

Right / Sidebar:
- Recipient status
- Quick actions
- Profile metadata
```

Example:

```txt
| Main content               | Sidebar          |
|----------------------------|------------------|
| User header                | Send money       |
| Relationship summary       | Recipient status |
| Recent transactions        | Metadata         |
```

---

## Mobile Layout

Use a single-column stacked layout:

```txt
User header
Primary actions
Relationship summary
Recipient status
Recent transactions
```

Rules:

```txt
No horizontal overflow
Tap targets at least 44px
Transaction table becomes cards
Summary cards use 1-column or 2-column grid depending on width
Sticky bottom action can be considered for Send Money
```

---

# 8. AI Assistant Integration

This page can later integrate with the AI assistant, but should not depend on it.

Useful future prompts:

```txt
Summarize my transactions with Daniel.
How much have I sent Daniel this month?
When was my last transfer with Daniel?
Show failed transfers with Daniel.
```

Backend tools could reuse existing relationship queries:

```txt
getTransactionsWithCounterparty
getTotalSentToCounterparty
getTotalReceivedFromCounterparty
getCounterpartySummary
counterparty_activity_timeline
```

Important rule:

The AI assistant may explain or summarize this relationship data, but it must not initiate a transfer without explicit transfer confirmation.

---

# 9. Implementation Phases

## Phase 1: Define Scope and Data Contract

Create the DTOs:

```txt
PublicUserProfileDto
UserRelationshipSummaryDto
UserRelationshipTransactionDto
UserProfileResponseDto
```

Decide which profile fields are public.

Do not expose raw user records.

---

## Phase 2: Backend Endpoint

Create:

```http
GET /api/users/:userId/profile
```

Implement:

```txt
Authentication required
Fetch viewed user
Return safe public profile DTO
Compute relationship summary
Fetch recent shared transactions
Return normalized response
```

Add error handling:

```txt
401 unauthenticated
403 forbidden, if needed
404 user not found
500 unexpected error
```

---

## Phase 3: Paginated Relationship Transactions

Create:

```http
GET /api/users/:userId/transactions?page=1&limit=20
```

Rules:

```txt
Only shared transactions
Newest first
Pagination metadata included
Direction calculated relative to viewer
Completed/pending/failed statuses preserved
```

---

## Phase 4: Frontend Page

Add:

```txt
UserProfilePage
UserProfileHeader
RelationshipSummaryCard
RecipientStatusCard
RecentRelationshipTransactions
```

Add API client functions:

```ts
getUserProfile(userId)
getUserRelationshipTransactions(userId, page, limit)
```

---

## Phase 5: Navigation Entry Points

Link to user pages from:

```txt
Transaction history counterparty names
Recipient list
Verified recipients page
Transfer confirmation page
Recent counterparties
AI assistant result cards, if applicable
```

Every counterparty display should eventually be clickable.

---

## Phase 6: Transfer Integration

Add “Send Money” behavior:

```txt
Click Send Money
Navigate to transfer page with recipient preselected
Do not submit transfer automatically
User still enters amount
User still confirms transfer
Backend still validates everything
```

Example:

```txt
/transfers/new?recipientId=abc123
```

---

## Phase 7: Responsive Polish

Verify:

```txt
Mobile profile layout
Desktop two-column layout
Transaction card rendering
Long names
Large amounts
Empty states
RTL compatibility if Hebrew UI exists
```

---

## Phase 8: Tests

Backend tests:

```txt
Cannot fetch profile without auth
Can fetch public profile with auth
Does not expose private fields
Relationship summary only includes shared transactions
Totals are calculated correctly
Failed/cancelled transactions do not affect completed totals
Self-profile handled correctly
Unknown user returns 404
```

Frontend tests:

```txt
Renders loading state
Renders user profile
Renders no-history state
Renders relationship summary
Renders recent transactions
Send Money button routes correctly
Mobile layout does not depend on table-only rendering
```

---

# 10. Recommended API Response Shape

```ts
export type UserProfileResponseDto = {
  user: {
    id: string;
    displayName: string;
    username?: string;
    avatarUrl?: string;
    isVerified: boolean;
    createdAt?: string;
  };

  relationship: {
    viewedUserId: string;
    viewerUserId: string;
    totalSentToUser: number;
    totalReceivedFromUser: number;
    netAmount: number;
    transactionCount: number;
    lastTransactionAt: string | null;
    isVerifiedRecipient: boolean;
    canTransferToUser: boolean;
    relationshipStatus:
      | "no_history"
      | "has_history"
      | "verified_recipient"
      | "blocked"
      | "self";
  };

  recentTransactions: Array<{
    id: string;
    reference: string;
    amount: number;
    currency: string;
    direction: "sent" | "received";
    status: "pending" | "completed" | "failed" | "cancelled";
    createdAt: string;
    description?: string;
  }>;
};
```

---

# 11. Important Design Decision

Do not design this as “User B’s financial profile.”

Design it as:

```txt
User B’s public profile
+
User A’s private relationship with User B
```

That distinction keeps the feature useful without violating account boundaries.

---

# 12. Codex Implementation Prompt

```md
# Goal

Add a user profile page to the web application where an authenticated user can view another user’s safe public profile information and relationship-specific interaction data between the viewer and the viewed user.

The agent must inspect the existing frontend, backend, routing, auth, user, transaction, recipient, and transfer code before making changes. Preserve existing product behavior, API contracts, authentication, authorization, transfer confirmation rules, validation, tests, and business logic.

## Required behavior

Create a page where User A can open User B’s profile and see:

- Safe public information about User B
- Transaction summary between User A and User B only
- Recent shared transactions between User A and User B
- Whether User B is a verified or available recipient
- A safe “Send Money” action that starts the existing transfer flow with User B preselected, without executing or confirming a transfer automatically

The page must not expose User B’s private financial data, balances, unrelated transactions, account numbers, other counterparties, private recipient list, loans, limits, or internal metadata.

## Backend requirements

Create safe DTOs instead of returning raw user or transaction records.

Add an authenticated profile endpoint such as:

GET /api/users/:userId/profile

It should return:

- user: safe public profile fields
- relationship: summary between viewer and viewed user
- recentTransactions: recent shared transactions only

The relationship summary should include:

- totalSentToUser
- totalReceivedFromUser
- netAmount
- transactionCount
- lastTransactionAt
- isVerifiedRecipient
- canTransferToUser
- relationshipStatus

Only include transactions where:

(senderId = viewerId AND receiverId = viewedUserId)
OR
(senderId = viewedUserId AND receiverId = viewerId)

Calculate direction relative to the authenticated viewer. Completed totals should be based on completed transactions only. Pending, failed, or cancelled transactions may appear in lists but must not affect completed totals.

Also add a paginated endpoint if needed:

GET /api/users/:userId/transactions?page=1&limit=20

It must return only shared transactions, newest first, with pagination metadata.

Handle:

- 401 unauthenticated
- 403 forbidden, if relevant
- 404 viewed user not found
- self-profile case
- empty relationship history

## Frontend requirements

Add a route such as:

/users/:userId

Create responsive React components such as:

- UserProfilePage
- UserProfileHeader
- RelationshipSummaryCard
- RecipientStatusCard
- RecentRelationshipTransactions
- EmptyRelationshipState

The page should show loading, error, unauthorized, not-found, no-history, self-profile, and normal relationship states.

Desktop should use available space well, preferably with a main content area and sidebar. Mobile should use a single-column layout with card-based transaction rendering instead of a cramped table.

Add navigation links to this page from relevant places, such as transaction counterparties, recipient lists, verified recipients, transfer screens, and recent counterparty displays.

The “Send Money” button should navigate to the existing transfer flow with the viewed user preselected, for example:

/transfers/new?recipientId=:userId

It must not create, approve, or execute a transfer by itself.

## Privacy and authorization rules

The authenticated viewer may only see:

- public profile fields of the viewed user
- transactions shared between viewer and viewed user
- relationship totals derived only from shared transactions
- recipient/transfer availability for this viewer-viewed-user relationship

Never expose unrelated data about the viewed user.

## Verification

Run available backend and frontend checks, including typecheck, lint, build, and tests if present. Add or update tests for:

- unauthenticated access
- user not found
- private fields not exposed
- shared transaction filtering
- relationship totals
- transaction direction relative to viewer
- self-profile behavior
- empty state
- send-money navigation

Document the endpoints, DTOs, components, route, privacy boundaries, and any remaining limitations.
