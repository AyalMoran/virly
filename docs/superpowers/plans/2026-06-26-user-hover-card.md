# User Hover Card Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** When a counterparty email is shown as a link (already routes to
`/users/:email`), hovering or keyboard-focusing it pops a small card summarizing the
relationship — display name, net balance, you-sent / you-received, transaction count,
last interaction — fetched lazily and cached, with a "View full profile" link.

**Architecture:** A `CounterpartyLink` component wraps the existing `<Link>` in a Radix
`HoverCard` (already the popover toolkit in this repo — `@radix-ui/react-*` are
installed). On open it lazily fetches `GET /api/users/:email/profile` (the SAME endpoint
the full profile page uses — no backend change) through a memoized cache so repeat hovers
don't refetch. The card body is a **pure, hook-free** `UserHoverCardContent` component
(so it's unit-testable in the repo's `renderToStaticMarkup` harness), driven by a pure
`summarizeRelationship` helper. `TransactionList` (and `QuickContacts`) swap their inline
counterparty links for `CounterpartyLink`.

**Tech Stack:** React 19 + TypeScript, `@radix-ui/react-hover-card`, `react-router-dom`
`Link`, Vite. Client tests: `tsx --test` + `renderToStaticMarkup` (no jsdom). Storybook
for the interactive piece.

## Global Constraints

- Client unit tests run via `npm run test:client`
  (`tsx --tsconfig client/tsconfig.json --test "client/tests/**/*.test.tsx"`), using
  `renderToStaticMarkup` — **no jsdom, no hooks exercised at runtime in tests**. So:
  pure/presentational pieces are unit-tested; the hook-driven hover/fetch wrapper is
  covered by Storybook + a type-check/build, not the node harness.
- Wrap any rendered `<Link>` in `<MemoryRouter>` in tests (router context required).
- No backend change — reuse `api.userProfile(email)`.
- Accessible: the card opens on hover AND keyboard focus; Escape dismisses; the trigger
  link still navigates on click/Enter. Radix HoverCard provides focus/dismiss semantics.
- Money is formatted via the existing `useCurrency().formatAmount` (no raw numbers).
- TDD for the pure pieces.

## Approach & rationale

Counterparty emails are already `<Link>`s to the profile page; this plan adds the
*preview*, not the navigation. Options for the popover:

1. **Radix HoverCard (chosen).** Already the repo's primitive family; correct
   hover-intent delay, positioning, focus management, and dismissal out of the box; tiny
   addition. Keeps the presentational body pure for the test harness.
2. **Hand-rolled CSS popover + manual hover/focus/escape handling.** No new dep but
   re-implements a11y and positioning Radix already gives us. Rejected.
3. **Title attribute / native tooltip.** Trivial but can't render a rich card. Rejected.

Lazy + cached fetch keeps lists cheap: nothing loads until the user shows intent, and the
module cache dedupes repeat hovers of the same person across a session.

## File Structure

| File | Responsibility |
|---|---|
| `client/package.json` (modify) | Add `@radix-ui/react-hover-card`. |
| `client/src/features/users/relationship-summary.ts` (create) | Pure `summarizeRelationship(profile)` → display fields. |
| `client/src/lib/user-profile-cache.ts` (create) | `fetchUserProfileCached(email)` memoized over `api.userProfile`. |
| `client/src/components/UserHoverCardContent.tsx` (create) | Pure, hook-free card body (loading / error / loaded). |
| `client/src/components/CounterpartyLink.tsx` (create) | Radix HoverCard wrapper around `<Link>`; lazy fetch on open. |
| `client/src/components/CounterpartyLink.stories.tsx` (create) | Storybook story (loaded / loading / error / no-history). |
| `client/src/components/TransactionList.tsx` (modify) | Use `CounterpartyLink` for the counterparty. |
| `client/src/components/QuickContacts.tsx` (modify) | Use `CounterpartyLink` for the profile link (optional). |
| `client/src/styles/global.css` (modify) | `.user-hover-card` styles. |
| `client/tests/userHoverCard.test.tsx` (create) | Unit tests for the helper + pure content component. |

---

## Task 1: `summarizeRelationship` pure helper

**Files:**
- Create: `client/src/features/users/relationship-summary.ts`
- Test: `client/tests/userHoverCard.test.tsx`

**Interfaces:**
- Consumes: `UserProfileResponse`, `UserRelationshipSummary` (`client/src/lib/types`).
- Produces:
  - `type RelationshipDisplay = { name: string; netLabel: "Net sent" | "Net received" | "Even"; netAmount: number; totalSent: number; totalReceived: number; transactionCount: number; lastInteraction: string | null; verified: boolean }`
  - `function summarizeRelationship(profile: UserProfileResponse): RelationshipDisplay`

- [ ] **Step 1: Write the failing test**

```tsx
// client/tests/userHoverCard.test.tsx
import assert from "node:assert/strict";
import test from "node:test";
import { summarizeRelationship } from "../src/features/users/relationship-summary";
import type { UserProfileResponse } from "../src/lib/types";

function profile(over: Partial<UserProfileResponse["relationship"]> = {}): UserProfileResponse {
  return {
    user: { id: "1", email: "dan@example.com", displayName: "Dan", isVerified: true },
    relationship: {
      viewerUserId: "v",
      viewedUserId: "1",
      totalSentToUser: 300,
      totalReceivedFromUser: 100,
      netAmount: 200,
      transactionCount: 4,
      lastTransactionAt: "2026-06-20T10:00:00Z",
      isVerifiedRecipient: true,
      canTransferToUser: true,
      relationshipStatus: "has_history",
      ...over
    },
    recentTransactions: []
  };
}

test("net positive is labelled 'Net sent'", () => {
  const d = summarizeRelationship(profile());
  assert.equal(d.name, "Dan");
  assert.equal(d.netLabel, "Net sent");
  assert.equal(d.netAmount, 200);
  assert.equal(d.transactionCount, 4);
});

test("net negative is labelled 'Net received'", () => {
  const d = summarizeRelationship(profile({ netAmount: -50 }));
  assert.equal(d.netLabel, "Net received");
});

test("zero net is 'Even'", () => {
  const d = summarizeRelationship(profile({ netAmount: 0 }));
  assert.equal(d.netLabel, "Even");
});

test("falls back to email when displayName is empty", () => {
  const p = profile();
  p.user.displayName = "";
  assert.equal(summarizeRelationship(p).name, "dan@example.com");
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npm run test:client`
Expected: FAIL — module not found.

- [ ] **Step 3: Implement the helper**

```ts
// client/src/features/users/relationship-summary.ts
import type { UserProfileResponse } from "../../lib/types";

export type RelationshipDisplay = {
  name: string;
  netLabel: "Net sent" | "Net received" | "Even";
  netAmount: number;
  totalSent: number;
  totalReceived: number;
  transactionCount: number;
  lastInteraction: string | null;
  verified: boolean;
};

export function summarizeRelationship(profile: UserProfileResponse): RelationshipDisplay {
  const r = profile.relationship;
  const netLabel = r.netAmount > 0 ? "Net sent" : r.netAmount < 0 ? "Net received" : "Even";
  return {
    name: profile.user.displayName?.trim() || profile.user.email,
    netLabel,
    netAmount: Math.abs(r.netAmount),
    totalSent: r.totalSentToUser,
    totalReceived: r.totalReceivedFromUser,
    transactionCount: r.transactionCount,
    lastInteraction: r.lastTransactionAt,
    verified: r.isVerifiedRecipient
  };
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `npm run test:client`
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add client/src/features/users/relationship-summary.ts client/tests/userHoverCard.test.tsx
git commit -m "feat(users): pure summarizeRelationship helper for the hover card"
```

---

## Task 2: Pure `UserHoverCardContent` component

**Files:**
- Create: `client/src/components/UserHoverCardContent.tsx`
- Test: `client/tests/userHoverCard.test.tsx` (extend)

**Interfaces:**
- Consumes: `RelationshipDisplay` (Task 1), `react-router-dom` `Link`.
- Produces: `function UserHoverCardContent(props: { email: string; state: "loading" | "error" | "loaded"; summary?: RelationshipDisplay; formatAmount: (n: number) => string }): JSX.Element`.

> The component takes `formatAmount` as a prop (not the `useCurrency` hook) so it stays
> hook-free and rendly in the static harness; the wrapper passes the real one.

- [ ] **Step 1: Write the failing test**

Add to `client/tests/userHoverCard.test.tsx`:

```tsx
import { renderToStaticMarkup } from "react-dom/server";
import { MemoryRouter } from "react-router-dom";
import { createElement as h } from "react";
import { UserHoverCardContent } from "../src/components/UserHoverCardContent";

const fmt = (n: number) => `₪${n}`;

test("loaded card shows name, net label, totals, and a profile link", () => {
  const html = renderToStaticMarkup(
    h(MemoryRouter, null,
      h(UserHoverCardContent, {
        email: "dan@example.com",
        state: "loaded",
        formatAmount: fmt,
        summary: {
          name: "Dan",
          netLabel: "Net sent",
          netAmount: 200,
          totalSent: 300,
          totalReceived: 100,
          transactionCount: 4,
          lastInteraction: "2026-06-20T10:00:00Z",
          verified: true
        }
      })
    )
  );
  assert.match(html, /Dan/);
  assert.match(html, /Net sent/);
  assert.match(html, /₪200/);
  assert.match(html, /\/users\/dan%40example\.com|\/users\/dan@example\.com/);
  assert.match(html, /View full profile/i);
});

test("loading state renders a loading affordance", () => {
  const html = renderToStaticMarkup(
    h(MemoryRouter, null,
      h(UserHoverCardContent, { email: "x@y.com", state: "loading", formatAmount: fmt })
    )
  );
  assert.match(html, /loading|…/i);
});

test("error state renders a fallback", () => {
  const html = renderToStaticMarkup(
    h(MemoryRouter, null,
      h(UserHoverCardContent, { email: "x@y.com", state: "error", formatAmount: fmt })
    )
  );
  assert.match(html, /couldn.?t|unavailable|try/i);
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npm run test:client`
Expected: FAIL — module not found.

- [ ] **Step 3: Implement the pure content component**

```tsx
// client/src/components/UserHoverCardContent.tsx
import { Link } from "react-router-dom";
import { BadgeCheck } from "lucide-react";
import type { RelationshipDisplay } from "../features/users/relationship-summary";

export function UserHoverCardContent({
  email,
  state,
  summary,
  formatAmount
}: {
  email: string;
  state: "loading" | "error" | "loaded";
  summary?: RelationshipDisplay;
  formatAmount: (n: number) => string;
}) {
  if (state === "loading") {
    return <div className="user-hover-card loading">Loading…</div>;
  }
  if (state === "error" || !summary) {
    return <div className="user-hover-card error">Summary unavailable — try the full profile.</div>;
  }
  return (
    <div className="user-hover-card">
      <div className="user-hover-card-head">
        <strong>{summary.name}</strong>
        {summary.verified ? <BadgeCheck aria-label="Verified recipient" /> : null}
      </div>
      <dl className="user-hover-card-stats">
        <div>
          <dt>You sent</dt>
          <dd>{formatAmount(summary.totalSent)}</dd>
        </div>
        <div>
          <dt>You received</dt>
          <dd>{formatAmount(summary.totalReceived)}</dd>
        </div>
        <div>
          <dt>{summary.netLabel}</dt>
          <dd>{formatAmount(summary.netAmount)}</dd>
        </div>
        <div>
          <dt>Transactions</dt>
          <dd>{summary.transactionCount}</dd>
        </div>
      </dl>
      <Link className="user-hover-card-link" to={`/users/${encodeURIComponent(email)}`}>
        View full profile
      </Link>
    </div>
  );
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `npm run test:client`
Expected: PASS.

- [ ] **Step 5: Add styles**

In `client/src/styles/global.css`, add `.user-hover-card` (and `.loading`/`.error`,
`.user-hover-card-stats`, `.user-hover-card-link`) — a small padded card, grid stats,
matching the existing `.card`/`.relationship-stat` look.

- [ ] **Step 6: Commit**

```bash
git add client/src/components/UserHoverCardContent.tsx client/src/styles/global.css client/tests/userHoverCard.test.tsx
git commit -m "feat(users): pure UserHoverCardContent presentational component"
```

---

## Task 3: Memoized profile fetch

**Files:**
- Create: `client/src/lib/user-profile-cache.ts`
- Test: `client/tests/userHoverCard.test.tsx` (extend)

**Interfaces:**
- Consumes: `api.userProfile` (`client/src/lib/api`).
- Produces:
  - `function fetchUserProfileCached(email: string): Promise<UserProfileResponse>` (dedup per email)
  - `function __resetUserProfileCache(): void` (test hook)
  - `function __setProfileFetcher(fn: (email: string) => Promise<UserProfileResponse>): void` (test injection)

- [ ] **Step 1: Write the failing test**

```tsx
import {
  fetchUserProfileCached,
  __resetUserProfileCache,
  __setProfileFetcher
} from "../src/lib/user-profile-cache";

test("dedupes repeat fetches for the same email", async () => {
  __resetUserProfileCache();
  let calls = 0;
  __setProfileFetcher(async (email) => {
    calls += 1;
    return {
      user: { id: "1", email, displayName: "Dan", isVerified: false },
      relationship: {
        viewerUserId: "v", viewedUserId: "1", totalSentToUser: 0, totalReceivedFromUser: 0,
        netAmount: 0, transactionCount: 0, lastTransactionAt: null, isVerifiedRecipient: false,
        canTransferToUser: false, relationshipStatus: "no_history"
      },
      recentTransactions: []
    };
  });
  await fetchUserProfileCached("dan@example.com");
  await fetchUserProfileCached("dan@example.com");
  assert.equal(calls, 1);
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npm run test:client`
Expected: FAIL — module not found.

- [ ] **Step 3: Implement the cache**

```ts
// client/src/lib/user-profile-cache.ts
import { api } from "./api";
import type { UserProfileResponse } from "./types";

let fetcher: (email: string) => Promise<UserProfileResponse> = (email) =>
  api.userProfile(email);

const cache = new Map<string, Promise<UserProfileResponse>>();

export function fetchUserProfileCached(email: string): Promise<UserProfileResponse> {
  const key = email.toLowerCase();
  const existing = cache.get(key);
  if (existing) {
    return existing;
  }
  const promise = fetcher(email).catch((error) => {
    cache.delete(key); // don't cache failures
    throw error;
  });
  cache.set(key, promise);
  return promise;
}

/** Test hooks. */
export function __resetUserProfileCache(): void {
  cache.clear();
}
export function __setProfileFetcher(fn: (email: string) => Promise<UserProfileResponse>): void {
  fetcher = fn;
}
```

> Confirm `api.userProfile` is exported as a member of an `api` object (it is — see
> `client/src/lib/api.ts:313`). Adjust the import if the export shape differs.

- [ ] **Step 4: Run test to verify it passes**

Run: `npm run test:client`
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add client/src/lib/user-profile-cache.ts client/tests/userHoverCard.test.tsx
git commit -m "feat(users): memoized user-profile fetch for hover cards"
```

---

## Task 4: `CounterpartyLink` (Radix HoverCard wrapper) + story

**Files:**
- Modify: `client/package.json` (add `@radix-ui/react-hover-card`)
- Create: `client/src/components/CounterpartyLink.tsx`
- Create: `client/src/components/CounterpartyLink.stories.tsx`

**Interfaces:**
- Consumes: `UserHoverCardContent` (Task 2), `summarizeRelationship` (Task 1),
  `fetchUserProfileCached` (Task 3), `useCurrency` (`features/currency/CurrencyProvider`),
  `Link` (react-router-dom).
- Produces: `function CounterpartyLink(props: { email: string; className?: string; children?: React.ReactNode }): JSX.Element`.

- [ ] **Step 1: Install the dependency**

```bash
cd client && npm install @radix-ui/react-hover-card
```

- [ ] **Step 2: Implement the wrapper**

```tsx
// client/src/components/CounterpartyLink.tsx
import { useState } from "react";
import * as HoverCard from "@radix-ui/react-hover-card";
import { Link } from "react-router-dom";
import { useCurrency } from "../features/currency/CurrencyProvider";
import { fetchUserProfileCached } from "../lib/user-profile-cache";
import { summarizeRelationship, type RelationshipDisplay } from "../features/users/relationship-summary";
import { UserHoverCardContent } from "./UserHoverCardContent";

export function CounterpartyLink({
  email,
  className,
  children
}: {
  email: string;
  className?: string;
  children?: React.ReactNode;
}) {
  const { formatAmount } = useCurrency();
  const [state, setState] = useState<"idle" | "loading" | "error" | "loaded">("idle");
  const [summary, setSummary] = useState<RelationshipDisplay | undefined>();

  function load() {
    if (state === "loaded" || state === "loading") {
      return;
    }
    setState("loading");
    fetchUserProfileCached(email)
      .then((profile) => {
        setSummary(summarizeRelationship(profile));
        setState("loaded");
      })
      .catch(() => setState("error"));
  }

  return (
    <HoverCard.Root openDelay={200} closeDelay={100} onOpenChange={(open) => open && load()}>
      <HoverCard.Trigger asChild>
        <Link
          className={className ?? "counterparty-link"}
          to={`/users/${encodeURIComponent(email)}`}
          aria-label={`View ${email}'s profile`}
          onFocus={load}
        >
          {children ?? email}
        </Link>
      </HoverCard.Trigger>
      <HoverCard.Portal>
        <HoverCard.Content className="user-hover-card-popover" sideOffset={6} collisionPadding={8}>
          <UserHoverCardContent
            email={email}
            state={state === "idle" ? "loading" : state}
            summary={summary}
            formatAmount={formatAmount}
          />
          <HoverCard.Arrow className="user-hover-card-arrow" />
        </HoverCard.Content>
      </HoverCard.Portal>
    </HoverCard.Root>
  );
}
```

- [ ] **Step 3: Add a Storybook story (covers the interactive states)**

```tsx
// client/src/components/CounterpartyLink.stories.tsx
import type { Meta, StoryObj } from "@storybook/react";
import { MemoryRouter } from "react-router-dom";
import { __setProfileFetcher } from "../lib/user-profile-cache";
import { CounterpartyLink } from "./CounterpartyLink";
// NOTE: wrap in MemoryRouter + the app's CurrencyProvider in a decorator; inject a
// fake fetcher via __setProfileFetcher so the story is offline/deterministic.

const meta: Meta<typeof CounterpartyLink> = {
  title: "Users/CounterpartyLink",
  component: CounterpartyLink,
  decorators: [(Story) => <MemoryRouter><Story /></MemoryRouter>]
};
export default meta;

export const WithHistory: StoryObj<typeof CounterpartyLink> = {
  render: () => {
    __setProfileFetcher(async (email) => ({
      user: { id: "1", email, displayName: "Dan", isVerified: true },
      relationship: {
        viewerUserId: "v", viewedUserId: "1", totalSentToUser: 300, totalReceivedFromUser: 100,
        netAmount: 200, transactionCount: 4, lastTransactionAt: "2026-06-20T10:00:00Z",
        isVerifiedRecipient: true, canTransferToUser: true, relationshipStatus: "has_history"
      },
      recentTransactions: []
    }));
    return <CounterpartyLink email="dan@example.com" />;
  }
};
```

> Match the story format to the existing stories (`TransferCheque.stories.tsx`,
> `AssistantMarkdown.stories.tsx`) — including how they provide `CurrencyProvider`.

- [ ] **Step 4: Type-check / build the client**

Run: `cd client && npx tsc -b`
Expected: no type errors.

- [ ] **Step 5: Commit**

```bash
git add client/package.json client/package-lock.json package-lock.json client/src/components/CounterpartyLink.tsx client/src/components/CounterpartyLink.stories.tsx
git commit -m "feat(users): CounterpartyLink hover card via Radix HoverCard"
```

---

## Task 5: Adopt `CounterpartyLink` in the lists

**Files:**
- Modify: `client/src/components/TransactionList.tsx`
- Modify: `client/src/components/QuickContacts.tsx`
- Modify: `client/tests/transactionList.test.tsx` (keep green)

**Interfaces:**
- Consumes: `CounterpartyLink` (Task 4).

- [ ] **Step 1: Replace the inline counterparty link in `TransactionList`**

In `client/src/components/TransactionList.tsx`, swap the inline `<Link className="counterparty-link" …>` (lines ~252–258) for:

```tsx
import { CounterpartyLink } from "./CounterpartyLink";
// ...
<strong>
  <CounterpartyLink email={transaction.counterpartyEmail} />
</strong>
```

The existing `onClick`/`onKeyDown` row handlers already early-return when the event
target is inside an `<a>` (`closest("a")`), so the hover-card trigger link won't fire
row selection. Keep that logic.

- [ ] **Step 2: Run the transaction-list test**

Run: `npm run test:client`
Expected: PASS — the rendered markup still contains the counterparty email inside an
anchor to `/users/:email`. Update the test's selector only if it asserted the exact old
class structure.

- [ ] **Step 3: (Optional) Adopt in `QuickContacts`**

Replace the profile `<Link>` in `QuickContacts.tsx` with `<CounterpartyLink email=...>`
wrapping the `UserRound` icon (pass it as `children`), so the contacts list also previews.

- [ ] **Step 4: Run the full client suite + build**

Run: `npm run test:client && cd client && npx tsc -b`
Expected: PASS, no type errors.

- [ ] **Step 5: Commit**

```bash
git add client/src/components/TransactionList.tsx client/src/components/QuickContacts.tsx client/tests/transactionList.test.tsx
git commit -m "feat(users): show hover cards for counterparties in lists"
```

---

## Self-Review

- **Spec coverage:** clickable users already existed; this adds the hover balloon/user
  card — pure helper (T1), pure content (T2), cached fetch (T3), Radix wrapper + story
  (T4), adoption in lists (T5). Covers "make users clickable with hover baloon with
  summary or user card."
- **Placeholder scan:** none — the two "match existing patterns" notes (Storybook
  decorator shape, test selector) point at concrete in-repo references.
- **Type consistency:** `RelationshipDisplay`, `UserProfileResponse`, and the
  `summarizeRelationship`/`fetchUserProfileCached`/`UserHoverCardContent` signatures are
  used consistently across helper, component, cache, wrapper, and story.

## Open questions (answer later)

1. **Card contents** — net + sent/received + count + verified (this plan), or also show
   the last 1–2 recent transactions (the endpoint already returns `recentTransactions`)?
2. **Where else** — only TransactionList + QuickContacts, or also the AI assistant's
   transaction blocks (`AssistantBlocks.tsx`) and the dashboard statement?
3. **Mobile/touch** — HoverCard is hover/focus oriented; on touch the link just
   navigates. Is a tap-to-preview affordance wanted, or is navigation fine on touch?
