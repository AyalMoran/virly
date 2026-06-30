# Virly Storybook — story plan & inventory

Storybook **v10.4.6** (`@storybook/react-vite`), colocated `*.stories.tsx`, CSF 3.

## Conventions (must match exactly)
- Title: `<FeatureArea>/<ComponentName>`, FeatureArea ∈ `Auth | Dashboard | Transfers | Transactions | AI Assistant | Layout | Shared UI`.
- Story ID: `<lowercased-title>--<lowercased-export>` (e.g. `transfers-transfercheque--error`).
- Canvas URL (static build): `iframe.html?id=<id>&viewMode=story`.

## Global setup (`.storybook/`)
- **main.ts** — stories glob `../src/**/*.stories.@(ts|tsx)`; addons `@storybook/addon-docs`, `@storybook/addon-a11y`; framework `@storybook/react-vite` (auto-loads the project `vite.config.ts`, so `@ → ./src` + Tailwind v4 resolve); `staticDirs: ['../public']` (MSW worker).
- **preview.tsx** — imports `@/index.css` + `@/styles/global.css` + `sb-deterministic.css`; global decorators `withMotion`, `withRouter`, `withCurrency`; `mswLoader`; default MSW handlers; `tags: ['autodocs']`; `layout: 'centered'`.
- **decorators.tsx** — `withMotion` (framer `reducedMotion="always"`), `withRouter` (MemoryRouter; `parameters.router.initialEntries`), `withCurrency` (CurrencyProvider w/ fixed rates, no network; `parameters.currency`), `withAuth` (real AuthProvider; per-meta; relies on MSW `/api/auth/me`).
- **sb-deterministic.css** — collapses CSS animations/transitions + hides caret for stable screenshots.
- **fixtures/** — `account`, `transactions`, `transfer`, `assistant`, `userProfile`, `personalDetails` (+ `index` barrel). All fake, fixed.
- **msw-handlers.ts** — default GET handlers (`*` prefix matches any base URL): auth/me, exchange-rates, accounts/me, personal-details, transactions, users/:id/profile, users/:id/transactions. Per-story overrides spread `...defaultHandlers` (Storybook replaces the array).

> No react-query in this app (hand-rolled `fetch` `api`), so the spec's QueryClientProvider step is N/A.

## Inventory (authored)

| Component | Path | Area | Stories | Needs |
|---|---|---|---|---|
| TransactionList | components/TransactionList.tsx | Transactions | Default, Empty, Compact, Selectable, WithPagination, ManyPages | router, currency |
| TransactionReceipt | components/TransactionReceipt.tsx | Transactions | Default, Credit, ForeignCurrency | router, currency, framer |
| TransactionDetailsDialog | components/TransactionDetailsDialog.tsx | Transactions | Default | framer (modal) |
| TransactionsPage | features/transactions/TransactionsPage.tsx | Transactions | Default, Loading, Empty, Error | msw(transactions) |
| TransferCheque | components/TransferCheque.tsx | Transfers | Default(form), AwaitingConfirmation(review), Success(confirmed), Error, LargeAmount | router, framer |
| TransferQuoteSmallPrint | features/transfer/TransferQuoteSmallPrint.tsx | Transfers | Default | — |
| TransferPage | features/transfer/TransferPage.tsx | Transfers | Default | withAuth, msw, currency · ⚠ non-det (random cheque#, `new Date()`) |
| AssistantBlocks | components/assistant/AssistantBlocks.tsx | AI Assistant | Default, AccountSummary, TransactionList, PendingTransfers, TransferQuote, Notice, Empty, ConfirmationPending, ConfirmationSending, ConfirmationConfirmed, ConfirmationDenied, Error | router |
| AssistantMarkdown | components/assistant/AssistantBlocks.tsx | AI Assistant | Default, PlainText | — |
| FloatingChatWidget | components/ui/floating-chat-widget-shadcnui.tsx | AI Assistant | Default(closed), Open(play) | withAuth · ⚠ Open emits dev-only React `act()` warnings (absent in static build) |
| ShellTopbar | components/ShellTopbar.tsx | Layout | Default, LargeBalance, UsdDisplay | router, currency, framer |
| NotFoundSlip | components/NotFoundSlip.tsx | Layout | Default | framer |
| UserProfileSidebar | components/ui/menu.tsx | Layout | Default, Collapsed | router |
| AppShell | components/AppShell.tsx | Layout | Default | withAuth, router(Outlet) |
| ShaderBackground | components/ui/shader-background.tsx | Layout | Default | WebGL (paints one static frame under reduced motion) |
| BootSplash | components/BootSplash.tsx | Layout | Default | ⚠ NON-deterministic (JS split-flap loop + random phrases) |
| DashboardPage | features/dashboard/DashboardPage.tsx | Dashboard | Default, Loading, Empty, Error | withAuth, msw, currency |
| AccountStatement | features/dashboard/AccountStatement.tsx | Dashboard | Default, Empty | currency · ⚠ Empty "as of" uses `Date.now()` |
| SettingsPage | features/settings/SettingsPage.tsx | Dashboard | Default, Loading, Empty, Error | withAuth, msw, currency |
| SignInCard2 | components/ui/sign-in-card-2.tsx | Auth | Default, Register, Error, Loading | router, framer |
| AuthLayout | features/auth/AuthLayout.tsx | Auth | Default, WithBrandVisual, BarePanel | framer |
| LoginPage | features/auth/LoginPage.tsx | Auth | Default | withAuth |
| RegisterPage | features/auth/RegisterPage.tsx | Auth | Default | withAuth |
| VerifyPage | features/auth/VerifyPage.tsx | Auth | Default(missing token), Checking, Error | withAuth, msw(verify), router |
| ResendVerificationPage | features/auth/ResendVerificationPage.tsx | Auth | Default | withAuth |
| PersonalDetailsAuthForm | features/profile/PersonalDetailsAuthForm.tsx | Auth | Default | withAuth |
| Button | components/Primitives.tsx | Shared UI | Default, Secondary, Ghost, Danger, Disabled | — |
| Field | components/Primitives.tsx | Shared UI | Default, WithHint, Error, Disabled | — |
| TextareaField | components/Primitives.tsx | Shared UI | Default, WithHint, Error | — |
| EmptyState | components/Primitives.tsx | Shared UI | Default, WithAction | — |
| Skeleton | components/Primitives.tsx | Shared UI | Default, ManyRows | — |
| ErrorBanner | components/Primitives.tsx | Shared UI | Default | — |
| SuccessBanner | components/Primitives.tsx | Shared UI | Default | — |
| PageHeader | components/Primitives.tsx | Shared UI | Default, WithActions | — |
| Card | components/Primitives.tsx | Shared UI | Default | — |
| QuickContacts | components/QuickContacts.tsx | Shared UI | Default, Empty | router |
| CurrencySelector | features/currency/CurrencySelector.tsx | Shared UI | Default, UsdContext, ControlledEur | currency |
| RelationshipSummaryCard | features/users/RelationshipSummaryCard.tsx | Shared UI | Default, NetReceived | currency |
| RecipientStatusCard | features/users/RecipientStatusCard.tsx | Shared UI | Default, NotVerified, Self | — |
| UserProfileHeader | features/users/UserProfileHeader.tsx | Shared UI | Default, Unverified, Self | — |
| EmptyRelationshipState | features/users/EmptyRelationshipState.tsx | Shared UI | Default, CannotSend | — |
| RecentRelationshipTransactions | features/users/RecentRelationshipTransactions.tsx | Shared UI | Default, WithMore | currency (no fetch on mount) |
| UserProfilePage | features/users/UserProfilePage.tsx | Shared UI | Default, Loading, Empty, NotFound, Error, Self | msw, router(:userId) |
| ButtonShadcn | components/ui/button.tsx | Shared UI | Default, Destructive, Outline, Secondary, Ghost, Disabled | — |
| Avatar | components/ui/avatar.tsx | Shared UI | Default, Fallback | — |
| Select | components/ui/select.tsx | Shared UI | Default | — (open = interaction) |
| AnimatedText | components/ui/animated-text.tsx | Shared UI | Default, Phrase | framer |
| BentoCard | components/ui/bento-card.tsx | Shared UI | Default | unused shadcn registry demo |
| OrderConfirmationCard | components/ui/order-confirmation-card.tsx | Shared UI | Default, Credit | unused shadcn registry demo |

**49 components · 128 story entries.** Confirmation-gate states (Transfers/AI Assistant) authored per ground rules: pre-confirm → awaiting → confirmed → error; the assistant never acts on its own (Confirm/Deny are user-driven, inert in stories).

## Out of scope / not isolable
- **features/video/** (`VideoSessionPage`, `AgentVideoSessionsPage`, `JitsiMeeting`) — skipped per request. **Blocker:** `JitsiMeeting` loads the external Jitsi SDK into a live DOM/iframe; cannot render in isolation.
- **components/ui/floating-chat-widget-demo.tsx** — a 1:1 demo wrapper of `FloatingChatWidget`; covered by `AI Assistant/FloatingChatWidget`.
- **Non-visual (no stories):** `lib/*`, `AuthProvider`, `CurrencyProvider` (exercised via decorators), `RouteGuards`, `app/App.tsx`, `main.tsx`.

## a11y (addon-a11y enabled; `parameters.a11y.test: 'todo'`)
Live axe results per story are in the **Accessibility** panel. Code-level observations: decorative SVGs/marks use `aria-hidden`; banners use `role="alert"`/`"status"`; the details dialog uses `role="dialog"` + `aria-modal` + focus trap; `<select>` controls have `sr-only`/`aria-label`. Watch items to review in-panel: color-contrast on tinted status badges (assistant cards, `video-status` pills), and image `alt` on generated avatars.

## Conservative / inferred values to sanity-check
- FeatureArea mapping (per user): `features/users/*` → **Shared UI**; `features/settings/*` → **Dashboard**; `features/video/*` → **skipped**. My calls: `currency/CurrencySelector` → **Shared UI**, `profile/PersonalDetailsAuthForm` → **Auth**.
- Two `Button`s disambiguated: Primitives → `Shared UI/Button`; shadcn → `Shared UI/ButtonShadcn`.
- Exchange rates fixture `{ ILS:1, USD:0.27, EUR:0.25 }` (units per 1 ILS) — plausible, not real.
- Fake data throughout (amounts like 1250.00, "maya.cohen@virly.test", "Test User", csrf/token strings).
