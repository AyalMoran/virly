# Virly Frontend — Component Inventory

This table is the source of truth for the component reference. It drives the
per-area files in `areas/`, the placeholder image set in `images/`, and the
appendices in `index.md`. Re-running the documentation pass overwrites the
per-area files cleanly; this inventory is what each pass reads first.

- **Frontend root:** `client/`
- **Framework:** Vite 5 + React 18 + TypeScript (`client/package.json`,
  `client/vite.config.ts`).
- **Routing:** `react-router-dom` v6 (`client/src/app/App.tsx`).
- **Styling:** Tailwind CSS v4 (`@import "tailwindcss"` + `@theme inline` in
  `client/src/index.css`) for the shadcn-style `components/ui/*` set and the AI
  assistant cards, **plus** a large hand-written CSS design system in
  `client/src/styles/global.css` (BEM-ish class names like `.cheque`,
  `.statement`, `.signin-*`) used by the bespoke "paper/ledger" surfaces.
- **State:** React context (`AuthProvider`, `CurrencyProvider`) + local
  component state. No external state library.
- **Backend contract:** all data flows through `client/src/lib/api.ts` (the
  `api` object) against the Node/Express backend (MongoDB by default; PostgreSQL
  selectable at boot behind a repository seam). The backend is authoritative for
  every balance and ledger mutation.

## Category legend

`page` · `layout` · `feature` · `form` · `modal/overlay` · `primitive/ui` ·
`provider/context` · `hook-bound container`

## Tier legend

- **Lite** — `primitive/ui` and simple `layout` components.
- **Full** — pages, features, forms, modals, providers, and containers.
- Transfer and AI Assistant components are **always Full** and carry a mandatory
  **Architecture constraints** callout.

## Catalog (visual components)

| Name | Path | Category | Area | Tier |
|------|------|----------|------|------|
| AuthLayout | client/src/features/auth/AuthLayout.tsx | layout | Auth | Lite |
| AuthProvider | client/src/features/auth/AuthProvider.tsx | provider/context | Auth | Full |
| LoginPage | client/src/features/auth/LoginPage.tsx | page | Auth | Full |
| PersonalDetailsAuthForm | client/src/features/profile/PersonalDetailsAuthForm.tsx | form | Auth | Full |
| RegisterPage | client/src/features/auth/RegisterPage.tsx | page | Auth | Full |
| ResendVerificationPage | client/src/features/auth/ResendVerificationPage.tsx | page | Auth | Full |
| SignInCard2 | client/src/components/ui/sign-in-card-2.tsx | form | Auth | Full |
| VerifyPage | client/src/features/auth/VerifyPage.tsx | page | Auth | Full |
| AccountStatement | client/src/features/dashboard/AccountStatement.tsx | feature | Dashboard / Balance | Full |
| DashboardPage | client/src/features/dashboard/DashboardPage.tsx | page | Dashboard / Balance | Full |
| QuickContacts | client/src/components/QuickContacts.tsx | feature | Dashboard / Balance | Full |
| EmptyRelationshipState | client/src/features/users/EmptyRelationshipState.tsx | feature | Transfers | Full* |
| RecipientStatusCard | client/src/features/users/RecipientStatusCard.tsx | feature | Transfers | Full* |
| RelationshipSummaryCard | client/src/features/users/RelationshipSummaryCard.tsx | feature | Transfers | Full* |
| TransferCheque | client/src/components/TransferCheque.tsx | form | Transfers | Full* |
| TransferPage | client/src/features/transfer/TransferPage.tsx | page | Transfers | Full* |
| TransferQuoteSmallPrint | client/src/features/transfer/TransferQuoteSmallPrint.tsx | feature | Transfers | Full* |
| UserProfileHeader | client/src/features/users/UserProfileHeader.tsx | feature | Transfers | Full* |
| UserProfilePage | client/src/features/users/UserProfilePage.tsx | page | Transfers | Full* |
| RecentRelationshipTransactions | client/src/features/users/RecentRelationshipTransactions.tsx | hook-bound container | Transactions / History | Full |
| TransactionDetailsDialog | client/src/components/TransactionDetailsDialog.tsx | modal/overlay | Transactions / History | Full |
| TransactionList | client/src/components/TransactionList.tsx | feature | Transactions / History | Full |
| TransactionReceipt | client/src/components/TransactionReceipt.tsx | feature | Transactions / History | Full |
| TransactionsPage | client/src/features/transactions/TransactionsPage.tsx | page | Transactions / History | Full |
| AssistantBlocks | client/src/components/assistant/AssistantBlocks.tsx | feature | AI Assistant | Full* |
| ChatWidgetDemo | client/src/components/ui/floating-chat-widget-demo.tsx | page (demo harness) | AI Assistant | Full* |
| FloatingChatWidget | client/src/components/ui/floating-chat-widget-shadcnui.tsx | hook-bound container | AI Assistant | Full* |
| App | client/src/app/App.tsx | layout (router) | Layout / Navigation | Full |
| AppShell | client/src/components/AppShell.tsx | layout | Layout / Navigation | Full |
| BootSplash | client/src/components/BootSplash.tsx | modal/overlay | Layout / Navigation | Lite |
| NotFoundPage | client/src/features/not-found/NotFoundPage.tsx | page | Layout / Navigation | Full |
| NotFoundSlip | client/src/components/NotFoundSlip.tsx | feature | Layout / Navigation | Full |
| RouteGuards | client/src/components/RouteGuards.tsx | provider/container | Layout / Navigation | Full |
| ShellTopbar | client/src/components/ShellTopbar.tsx | layout | Layout / Navigation | Full |
| UserProfileSidebar | client/src/components/ui/menu.tsx | layout | Layout / Navigation | Full |
| AnimatedText | client/src/components/ui/animated-text.tsx | primitive/ui | Shared UI | Lite |
| Avatar | client/src/components/ui/avatar.tsx | primitive/ui | Shared UI | Lite |
| BentoCard | client/src/components/ui/bento-card.tsx | primitive/ui | Shared UI | Lite |
| Button (shadcn/ui) | client/src/components/ui/button.tsx | primitive/ui | Shared UI | Lite |
| CurrencyProvider | client/src/features/currency/CurrencyProvider.tsx | provider/context | Shared UI | Full |
| CurrencySelector | client/src/features/currency/CurrencySelector.tsx | primitive/ui | Shared UI | Lite |
| OrderConfirmationCard | client/src/components/ui/order-confirmation-card.tsx | primitive/ui | Shared UI | Lite |
| Primitives (UI toolkit) | client/src/components/Primitives.tsx | primitive/ui | Shared UI | Lite |
| Select (shadcn/ui) | client/src/components/ui/select.tsx | primitive/ui | Shared UI | Lite |
| ShaderBackground | client/src/components/ui/shader-background.tsx | primitive/ui | Shared UI | Lite |
| SettingsPage | client/src/features/settings/SettingsPage.tsx | page | Shared UI (fits none) | Full |
| VideoSessionPage | client/src/features/video/VideoSessionPage.tsx | page | Shared UI (fits none) | Full |
| AgentVideoSessionsPage | client/src/features/video/AgentVideoSessionsPage.tsx | page | Shared UI (fits none) | Full |
| JitsiMeeting | client/src/features/video/JitsiMeeting.tsx | feature | Shared UI (fits none) | Full |

`*` carries the mandatory **Architecture constraints** callout.

### Area placement notes (for human review)

- **`features/users/*` → Transfers.** The user-profile cluster is the
  recipient-preparation surface: it shows verification/eligibility and offers a
  "Transfer" CTA that prefills the recipient into the transfer flow. It is
  grouped under Transfers for cohesion. The one exception is
  `RecentRelationshipTransactions`, which is a transaction-list container and is
  documented under **Transactions / History**.
- **`SettingsPage`, `features/video/*` → Shared UI (fits none).** These are
  standalone feature pages with no matching fixed area, so per the documentation
  rules they live in Shared UI with an explicit note. Video sessions are
  human-agent (Jitsi) calls — distinct from the AI Assistant — and the AI
  Assistant's `video_session_cta` block only links into them.

## Non-visual files (excluded from the visual catalog; see index.md Appendix B)

| File | Role |
|------|------|
| client/src/main.tsx | App entry; mounts `BrowserRouter` → `AuthProvider` → `App`. |
| client/tests/bootSplash.test.tsx | `node:test` + `renderToStaticMarkup` tests for `BootSplashView`; covers ARIA, board structure, cell count, and the `exiting` phase class. |
| client/src/lib/api.ts | Typed API client (`api`), `ApiError`, CSRF + SSE handling. |
| client/src/lib/types.ts | All shared TypeScript types (DTOs, AI block union). |
| client/src/lib/format.ts | `formatMoneyILS`, `formatCurrency`, `formatDate`, `formatRelativeDate`, `getInitials`. |
| client/src/lib/currency.ts | Display-currency helpers, ILS conversion, storage. |
| client/src/lib/validation.ts | Field validators (email, password, phone, amount, reason, DOB). |
| client/src/lib/contacts.ts | `getQuickContacts` — dedupes recent counterparties. |
| client/src/lib/amount-words.ts | `amountInWords` — cheque-style spelled amounts. |
| client/src/lib/route-transition.ts | Auth → app transition flag (session storage). |
| client/src/lib/user-avatar.ts | Display name + generated initial-avatar SVG data URI. |
| client/src/lib/utils.ts | `cn` (clsx + tailwind-merge). |

## Theme / token files (see index.md Appendix C)

| File | Role |
|------|------|
| client/src/index.css | Tailwind v4 import + `@theme inline` HSL tokens (shadcn-style). |
| client/src/styles/global.css | Hand-written design system: color/spacing/typography tokens + bespoke surface styles. |
