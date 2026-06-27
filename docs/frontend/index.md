---
title: Virly Frontend Component Reference
---

# Virly Frontend Component Reference

Virly is a cash-transfer web application: a React + Vite + TypeScript frontend
(this document), a Node/Express backend (MongoDB by default, with PostgreSQL
selectable at boot behind a repository seam), and a LangGraph/OpenAI assistant
layer behind that backend. This reference catalogues the frontend's
visual components — what they render, the props they accept, the state and
endpoints they touch, and the user flows they belong to. Read it area-by-area
(Auth → Dashboard → Transfers → Transactions → AI Assistant → Layout/Navigation
→ Shared UI); each area is one Markdown file under `areas/`, and the consolidated
PDF stitches them in that order.

> **Backend contract:** the server side of every endpoint touched below is
> catalogued in the [Backend reference](../backend/index.md) (and per-endpoint
> shapes in the [API reference](../api/README.md)).

Three architectural facts shape almost every component and recur in the
**Architecture constraints** callouts:

1. **The backend is authoritative for all state.** The UI prepares and initiates
   actions; it never moves money or mutates a balance client-side. Balances shown
   in the shell come from the server and are refreshed only from server responses.
2. **Transfers require explicit confirmation.** A transfer executes only when the
   user confirms and the client calls an execution endpoint — `POST /api/transactions`
   for the manual cheque flow, or `POST /api/ai/confirmations/:id` (`action:
   "confirm"`) for an assistant-prepared transfer. Everything before that point is
   preparation.
3. **The AI assistant cannot act on its own.** Its frontend is a read-only /
   preparation surface: it renders the server's structured output and surfaces
   prepared actions for the user to confirm. It cannot select tools or approve a
   transfer.

> **Screenshots are placeholders.** Storybook capture is in progress separately.
> Every image reference already uses the final convention
> `images/<Component>--<state>.png`, and a matching placeholder PNG exists for
> each, so real captures drop in with zero Markdown changes. See
> [`images/TODO.md`](images/TODO.md) and [`capture/capture-screenshots.ts`](capture/capture-screenshots.ts).

## Conventions

- **Frontend root:** `client/` (Vite 5 + React 18 + TypeScript, `react-router-dom`
  v6).
- **Styling:** Tailwind CSS v4 (`@theme inline` in `client/src/index.css`) for the
  shadcn-style `components/ui/*` set and the AI cards, plus a hand-written CSS
  design system in `client/src/styles/global.css` (BEM-ish classes like `.cheque`,
  `.statement`, `.signin-*`) for the bespoke "paper/ledger" surfaces.
- **Image naming:** `images/<ComponentName>--<state>.png` (e.g.
  `TransferCheque--error.png`). One image per meaningful state.
- **State vocabulary:** `default`, `loading`, `empty`, `error`, `success`,
  `disabled` (plus a few flow-specific states like `review` for the cheque).
  Components only document the states their source actually supports.
- **Props tables:** `Prop | Type | Required | Default | Description`. Types are
  taken verbatim from the source interfaces; "N/A" marks a field that does not
  apply rather than omitting it. Inferred details are labelled "(inferred)".
- **Tiers:** **Lite** for primitives and simple layout (summary, screenshot,
  props, states, usage); **Full** for pages, features, forms, modals, providers,
  and containers (adds purpose, anatomy, state/data, interactions, dependencies,
  accessibility, related, gotchas).
- **Architecture constraints callout:** a blockquote on every Transfer and AI
  Assistant component restating the three facts above as they apply to that
  component — where the confirmation gate is, and that the component does not move
  money or let the assistant act unilaterally.

## Table of contents

### [Auth](areas/auth.md)

- [AuthLayout](areas/auth.md#authlayout)
- [AuthProvider](areas/auth.md#authprovider)
- [LoginPage](areas/auth.md#loginpage)
- [PersonalDetailsAuthForm](areas/auth.md#personaldetailsauthform)
- [RegisterPage](areas/auth.md#registerpage)
- [ResendVerificationPage](areas/auth.md#resendverificationpage)
- [SignInCard2](areas/auth.md#signincard2)
- [VerifyPage](areas/auth.md#verifypage)

### [Dashboard / Balance](areas/dashboard.md)

- [AccountStatement](areas/dashboard.md#accountstatement)
- [DashboardPage](areas/dashboard.md#dashboardpage)
- [QuickContacts](areas/dashboard.md#quickcontacts)

### [Transfers](areas/transfers.md)

- [EmptyRelationshipState](areas/transfers.md#emptyrelationshipstate)
- [RecipientStatusCard](areas/transfers.md#recipientstatuscard)
- [RelationshipSummaryCard](areas/transfers.md#relationshipsummarycard)
- [TransferCheque](areas/transfers.md#transfercheque)
- [TransferPage](areas/transfers.md#transferpage)
- [TransferQuoteSmallPrint](areas/transfers.md#transferquotesmallprint)
- [UserProfileHeader](areas/transfers.md#userprofileheader)
- [UserProfilePage](areas/transfers.md#userprofilepage)

### [Transactions / History](areas/transactions.md)

- [RecentRelationshipTransactions](areas/transactions.md#recentrelationshiptransactions)
- [TransactionDetailsDialog](areas/transactions.md#transactiondetailsdialog)
- [TransactionList](areas/transactions.md#transactionlist)
- [TransactionReceipt](areas/transactions.md#transactionreceipt)
- [TransactionsPage](areas/transactions.md#transactionspage)

### [AI Assistant](areas/ai-assistant.md)

- [AssistantBlocks](areas/ai-assistant.md#assistantblocks)
- [ChatWidgetDemo](areas/ai-assistant.md#chatwidgetdemo)
- [FloatingChatWidget](areas/ai-assistant.md#floatingchatwidget)

### [Layout / Navigation](areas/layout-nav.md)

- [App](areas/layout-nav.md#app)
- [AppShell](areas/layout-nav.md#appshell)
- [BootSplash](areas/layout-nav.md#bootsplash)
- [NotFoundPage](areas/layout-nav.md#notfoundpage)
- [NotFoundSlip](areas/layout-nav.md#notfoundslip)
- [RouteGuards](areas/layout-nav.md#routeguards)
- [ShellTopbar](areas/layout-nav.md#shelltopbar)
- [UserProfileSidebar](areas/layout-nav.md#userprofilesidebar)

### [Shared UI](areas/shared-ui.md)

- [AgentVideoSessionsPage](areas/shared-ui.md#agentvideosessionspage) *(fits none — video)*
- [AnimatedText](areas/shared-ui.md#animatedtext)
- [Avatar](areas/shared-ui.md#avatar)
- [BentoCard](areas/shared-ui.md#bentocard)
- [Button (shadcn/ui)](areas/shared-ui.md#button-shadcnui)
- [CurrencyProvider](areas/shared-ui.md#currencyprovider)
- [CurrencySelector](areas/shared-ui.md#currencyselector)
- [JitsiMeeting](areas/shared-ui.md#jitsimeeting) *(fits none — video)*
- [OrderConfirmationCard](areas/shared-ui.md#orderconfirmationcard)
- [Primitives (UI toolkit)](areas/shared-ui.md#primitives-ui-toolkit)
- [Select (shadcn/ui)](areas/shared-ui.md#select-shadcnui)
- [SettingsPage](areas/shared-ui.md#settingspage) *(fits none)*
- [ShaderBackground](areas/shared-ui.md#shaderbackground)
- [VideoSessionPage](areas/shared-ui.md#videosessionpage) *(fits none — video)*

## Appendix A — Component index

| Name | Path | Category | Area | Tier | Link |
|------|------|----------|------|------|------|
| AuthLayout | client/src/features/auth/AuthLayout.tsx | layout | Auth | Lite | [↗](areas/auth.md#authlayout) |
| AuthProvider | client/src/features/auth/AuthProvider.tsx | provider/context | Auth | Full | [↗](areas/auth.md#authprovider) |
| LoginPage | client/src/features/auth/LoginPage.tsx | page | Auth | Full | [↗](areas/auth.md#loginpage) |
| PersonalDetailsAuthForm | client/src/features/profile/PersonalDetailsAuthForm.tsx | form | Auth | Full | [↗](areas/auth.md#personaldetailsauthform) |
| RegisterPage | client/src/features/auth/RegisterPage.tsx | page | Auth | Full | [↗](areas/auth.md#registerpage) |
| ResendVerificationPage | client/src/features/auth/ResendVerificationPage.tsx | page | Auth | Full | [↗](areas/auth.md#resendverificationpage) |
| SignInCard2 | client/src/components/ui/sign-in-card-2.tsx | form | Auth | Full | [↗](areas/auth.md#signincard2) |
| VerifyPage | client/src/features/auth/VerifyPage.tsx | page | Auth | Full | [↗](areas/auth.md#verifypage) |
| AccountStatement | client/src/features/dashboard/AccountStatement.tsx | feature | Dashboard / Balance | Full | [↗](areas/dashboard.md#accountstatement) |
| DashboardPage | client/src/features/dashboard/DashboardPage.tsx | page | Dashboard / Balance | Full | [↗](areas/dashboard.md#dashboardpage) |
| QuickContacts | client/src/components/QuickContacts.tsx | feature | Dashboard / Balance | Full | [↗](areas/dashboard.md#quickcontacts) |
| EmptyRelationshipState | client/src/features/users/EmptyRelationshipState.tsx | feature | Transfers | Full | [↗](areas/transfers.md#emptyrelationshipstate) |
| RecipientStatusCard | client/src/features/users/RecipientStatusCard.tsx | feature | Transfers | Full | [↗](areas/transfers.md#recipientstatuscard) |
| RelationshipSummaryCard | client/src/features/users/RelationshipSummaryCard.tsx | feature | Transfers | Full | [↗](areas/transfers.md#relationshipsummarycard) |
| TransferCheque | client/src/components/TransferCheque.tsx | form | Transfers | Full | [↗](areas/transfers.md#transfercheque) |
| TransferPage | client/src/features/transfer/TransferPage.tsx | page | Transfers | Full | [↗](areas/transfers.md#transferpage) |
| TransferQuoteSmallPrint | client/src/features/transfer/TransferQuoteSmallPrint.tsx | feature | Transfers | Full | [↗](areas/transfers.md#transferquotesmallprint) |
| UserProfileHeader | client/src/features/users/UserProfileHeader.tsx | feature | Transfers | Full | [↗](areas/transfers.md#userprofileheader) |
| UserProfilePage | client/src/features/users/UserProfilePage.tsx | page | Transfers | Full | [↗](areas/transfers.md#userprofilepage) |
| RecentRelationshipTransactions | client/src/features/users/RecentRelationshipTransactions.tsx | hook-bound container | Transactions / History | Full | [↗](areas/transactions.md#recentrelationshiptransactions) |
| TransactionDetailsDialog | client/src/components/TransactionDetailsDialog.tsx | modal/overlay | Transactions / History | Full | [↗](areas/transactions.md#transactiondetailsdialog) |
| TransactionList | client/src/components/TransactionList.tsx | feature | Transactions / History | Full | [↗](areas/transactions.md#transactionlist) |
| TransactionReceipt | client/src/components/TransactionReceipt.tsx | feature | Transactions / History | Full | [↗](areas/transactions.md#transactionreceipt) |
| TransactionsPage | client/src/features/transactions/TransactionsPage.tsx | page | Transactions / History | Full | [↗](areas/transactions.md#transactionspage) |
| AssistantBlocks | client/src/components/assistant/AssistantBlocks.tsx | feature | AI Assistant | Full | [↗](areas/ai-assistant.md#assistantblocks) |
| ChatWidgetDemo | client/src/components/ui/floating-chat-widget-demo.tsx | page (demo harness) | AI Assistant | Full | [↗](areas/ai-assistant.md#chatwidgetdemo) |
| FloatingChatWidget | client/src/components/ui/floating-chat-widget-shadcnui.tsx | hook-bound container | AI Assistant | Full | [↗](areas/ai-assistant.md#floatingchatwidget) |
| App | client/src/app/App.tsx | layout (router) | Layout / Navigation | Full | [↗](areas/layout-nav.md#app) |
| AppShell | client/src/components/AppShell.tsx | layout | Layout / Navigation | Full | [↗](areas/layout-nav.md#appshell) |
| BootSplash | client/src/components/BootSplash.tsx | modal/overlay | Layout / Navigation | Lite | [↗](areas/layout-nav.md#bootsplash) |
| NotFoundPage | client/src/features/not-found/NotFoundPage.tsx | page | Layout / Navigation | Full | [↗](areas/layout-nav.md#notfoundpage) |
| NotFoundSlip | client/src/components/NotFoundSlip.tsx | feature | Layout / Navigation | Full | [↗](areas/layout-nav.md#notfoundslip) |
| RouteGuards | client/src/components/RouteGuards.tsx | provider/container | Layout / Navigation | Full | [↗](areas/layout-nav.md#routeguards) |
| ShellTopbar | client/src/components/ShellTopbar.tsx | layout | Layout / Navigation | Full | [↗](areas/layout-nav.md#shelltopbar) |
| UserProfileSidebar | client/src/components/ui/menu.tsx | layout | Layout / Navigation | Full | [↗](areas/layout-nav.md#userprofilesidebar) |
| AgentVideoSessionsPage | client/src/features/video/AgentVideoSessionsPage.tsx | page | Shared UI (fits none) | Full | [↗](areas/shared-ui.md#agentvideosessionspage) |
| AnimatedText | client/src/components/ui/animated-text.tsx | primitive/ui | Shared UI | Lite | [↗](areas/shared-ui.md#animatedtext) |
| Avatar | client/src/components/ui/avatar.tsx | primitive/ui | Shared UI | Lite | [↗](areas/shared-ui.md#avatar) |
| BentoCard | client/src/components/ui/bento-card.tsx | primitive/ui | Shared UI | Lite | [↗](areas/shared-ui.md#bentocard) |
| Button (shadcn/ui) | client/src/components/ui/button.tsx | primitive/ui | Shared UI | Lite | [↗](areas/shared-ui.md#button-shadcnui) |
| CurrencyProvider | client/src/features/currency/CurrencyProvider.tsx | provider/context | Shared UI | Full | [↗](areas/shared-ui.md#currencyprovider) |
| CurrencySelector | client/src/features/currency/CurrencySelector.tsx | primitive/ui | Shared UI | Lite | [↗](areas/shared-ui.md#currencyselector) |
| JitsiMeeting | client/src/features/video/JitsiMeeting.tsx | feature | Shared UI (fits none) | Full | [↗](areas/shared-ui.md#jitsimeeting) |
| OrderConfirmationCard | client/src/components/ui/order-confirmation-card.tsx | primitive/ui | Shared UI | Lite | [↗](areas/shared-ui.md#orderconfirmationcard) |
| Primitives (UI toolkit) | client/src/components/Primitives.tsx | primitive/ui | Shared UI | Lite | [↗](areas/shared-ui.md#primitives-ui-toolkit) |
| Select (shadcn/ui) | client/src/components/ui/select.tsx | primitive/ui | Shared UI | Lite | [↗](areas/shared-ui.md#select-shadcnui) |
| SettingsPage | client/src/features/settings/SettingsPage.tsx | page | Shared UI (fits none) | Full | [↗](areas/shared-ui.md#settingspage) |
| ShaderBackground | client/src/components/ui/shader-background.tsx | primitive/ui | Shared UI | Lite | [↗](areas/shared-ui.md#shaderbackground) |
| VideoSessionPage | client/src/features/video/VideoSessionPage.tsx | page | Shared UI (fits none) | Full | [↗](areas/shared-ui.md#videosessionpage) |

## Appendix B — Shared hooks, contexts, providers, and utilities

Non-visual modules the components depend on. They are excluded from the visual
catalog but are essential context for it.

### Contexts / providers

| Module | Hook | Provides | Key endpoints |
|--------|------|----------|---------------|
| `client/src/features/auth/AuthProvider.tsx` | `useAuth()` | Session `user`, `isAuthenticated`, `login`/`register`/`verify`/`logout`, `setSession`, `updateBalance`. | `GET /api/auth/me`, `POST /api/auth/{login,register,logout,resend-verification}`, `GET /api/auth/verify`. |
| `client/src/features/currency/CurrencyProvider.tsx` | `useCurrency()` | Display `currency`, `rates`, `conversionAvailable`, `formatAmount(amountIls)`. | `GET /api/exchange-rates/current`. |

### API client and types

| Module | Role |
|--------|------|
| `client/src/lib/api.ts` | The `api` object — every backend call (auth, accounts, transactions, transfer + quote, users, exchange rates, AI chat/stream/confirmation, video sessions). Adds CSRF headers on unsafe methods, parses SSE for streaming chat, and exposes `ApiError` (status + field `issues` + `details`) and `setUnauthorizedHandler` (401 → clear session). |
| `client/src/lib/types.ts` | All shared types: DTOs (`User`, `AccountSummary`, `Transaction`, `TransferQuote`, …), the AI `AssistantResponseBlock` discriminated union, and `AiTransferConfirmation` (with `confirmAction`/`denyAction`). |

### Utilities

| Module | Exports |
|--------|---------|
| `client/src/lib/format.ts` | `formatMoneyILS`, `formatCurrency`, `formatDate`, `formatRelativeDate`, `getInitials`. |
| `client/src/lib/currency.ts` | `SUPPORTED_DISPLAY_CURRENCIES`, `CURRENCY_LABELS`, `isDisplayCurrency`, `read/storeCurrency`, `convertIlsForDisplay`, `formatIlsAmount`. |
| `client/src/lib/validation.ts` | `validateEmail`, `validatePassword`, `validatePhone`, `validateAmount`, `validateReason`, `validateRequiredText`, `validateDateOfBirth`. |
| `client/src/lib/contacts.ts` | `getQuickContacts` — dedupes recent counterparties into `{ email, avatar }`. |
| `client/src/lib/amount-words.ts` | `amountInWords` — cheque-style spelled amounts. |
| `client/src/lib/route-transition.ts` | `markAuthTransition`, `hasAuthTransition`, `clearAuthTransition`, `authTransitionState` — the auth→app entrance flag. |
| `client/src/lib/user-avatar.ts` | `getDisplayName`, `getInitial`, `createInitialAvatar`, `getUserAvatarUrl`. |
| `client/src/lib/utils.ts` | `cn` — `clsx` + `tailwind-merge`. |
| `client/src/main.tsx` | App entry: mounts `BrowserRouter` → `AuthProvider` → `App`. |

## Appendix C — Design tokens / theme

Virly runs **two coexisting token systems**:

### 1. Tailwind v4 `@theme inline` (`client/src/index.css`)

shadcn-style HSL tokens consumed by `components/ui/*` and the AI assistant cards
(via Tailwind utilities like `bg-primary`, `text-muted-foreground`).

| Token | Value (HSL) | Approx. |
|-------|-------------|---------|
| `--background` | `40 33% 98%` | warm off-white |
| `--foreground` | `222 31% 12%` | near-black ink |
| `--card` / `--card-foreground` | `0 0% 100%` / `222 31% 12%` | white / ink |
| `--primary` / `--primary-foreground` | `168 76% 34%` / `0 0% 100%` | teal / white |
| `--destructive` / `--destructive-foreground` | `5 27% 42%` / `0 0% 100%` | muted red / white |
| `--muted` / `--muted-foreground` | `180 14% 91%` / `218 12% 45%` | pale teal / grey |
| `--border` | `180 14% 86%` | pale teal border |
| `--radius-xl` | `0.75rem` | — |

### 2. Hand-written design system (`client/src/styles/global.css`)

Tokens used by the bespoke "paper/ledger" surfaces (`.cheque`, `.statement`,
`.signin-*`, etc.).

| Token | Value | Role |
|-------|-------|------|
| `--color-bg` / `--color-bg-soft` | `#e6eec9` / `#dce7bd` | page background |
| `--color-surface` / `--color-surface-raised` | translucent `#e6eec9` | cards / panels |
| `--color-text` / `--color-muted` / `--color-subtle` | `#173d42` / `rgba(23,61,66,.66)` / `rgba(23,61,66,.42)` | text |
| `--color-primary` / `--color-primary-deep` / `--color-primary-soft` | `#35858e` / `#1f5f67` / `#c2d099` | brand teal |
| `--color-credit` / `--color-debit` | `rgb(9,145,32)` / `rgba(190,9,9,.88)` | money in / out |
| `--color-success` / `--color-warning` / `--color-danger` | `#35858e` / `#7da78c` / `#7f5a55` | status |
| `--font-body` / `--font-display` | "Hanken Grotesk" … / "Fraunces" … | typography |
| `--radius-card` / `--radius-control` | `18px` / `14px` | corner radii |
| `--ease-spring` | `cubic-bezier(0.16, 1, 0.3, 1)` | shared motion easing |
| layout vars | `--page-max-width: 1180px`, `--page-gutter`, `--section-gap`, `--mobile-nav-offset` | layout rhythm |

> Note: `--color-border` is defined in **both** files with different values
> (Tailwind: `hsl(180 14% 86%)`; global.css: `rgba(53,133,142,0.2)`); which one
> applies depends on whether an element is styled by Tailwind utilities or the
> hand-written classes.
