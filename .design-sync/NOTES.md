# design-sync notes — Virly (`virly-client`)

Repo-specific gotchas for future syncs. The component set is **usage-driven**
(see Scope below), spanning `client/src/components/Primitives.tsx`,
`client/src/components/` (domain), and `client/src/components/ui/` (distinctive
pieces). Shape = **package**, run via `--entry` barrel (this repo is an app, not a
published library — there is no `dist/` entry or `.d.ts` tree).

## Build invariants
- **Barrel entry**: `client/.ds-entry.tsx` re-exports the 24 in-use components,
  renaming `ShaderBackground`'s default export to named so it lands on
  `window.Virly`. `export * from` would silently drop defaults. Committed input.
- **`--node-modules` = repo-root `node_modules`** (npm workspaces hoist; there is
  no `client/node_modules`). `PKG_DIR` resolves to `client/` via the entry walk-up.
- **No `.d.ts`** → the dts loader only parses `.d.ts`, never `.tsx`, so automatic
  prop extraction returns empty bodies. Every prop-taking component therefore has
  a hand-written `cfg.dtsPropsFor.<Name>`. `BentoCard` and `ShaderBackground` take
  no props (no entry). Keep `dtsPropsFor` in sync with source when props change.
- **`SignInCard2`** declares its props type as `SignInCardProps` (not
  `SignInCard2Props`) — auto-match would miss it; `dtsPropsFor` covers it.

## Styling surface (Tailwind v4 + hand-written global.css)
- The real styles come from TWO files both loaded in `client/src/main.tsx`:
  `src/index.css` (Tailwind v4 `@theme` + shadcn HSL tokens) and
  `src/styles/global.css` (~5k lines: brand tokens `--font-display`/`--font-body`,
  and the custom classes the composites use — `.signin-*`, `.profile-sidebar-*`,
  `.animated-text-*`, `.order-confirmation-card`, etc.). Both MUST ship.
- `cfg.cssEntry` = `client/.ds-styles.css` = Google-Fonts `@import` (line 1) +
  the app's compiled Tailwind output. **Rebuild it whenever component source
  changes** so newly-used utility classes are present:
  `npm run build --workspace client` then
  `{ printf '@import url("…fraunces…hanken…");\n'; cat client/dist/assets/index-*.css; } > client/.ds-styles.css`
  (the exact @import URL is on line 1 of the current file). Gitignored (regenerated).
- Fonts (**Fraunces** display, **Hanken Grotesk** body) load at runtime from Google
  Fonts — same as the app (index.html `<link>`). `cfg.runtimeFontPrefixes` suppresses
  `[FONT_MISSING]`; the `@import` in `.ds-styles.css` actually loads them.
- Authored previews should reuse component-internal classes or inline styles for
  layout — novel Tailwind utilities only compile if they already appear in
  `client/src/**`. Rebuild the CSS if you introduce new ones.

## Verify-loop fixes (baked into config + previews — keep them)
These were discovered the hard way on the first sync; do not regress them.
- **`package-capture` does not wait for animations** (only fonts + image decode).
  Any framer-motion component that mounts at `opacity: 0` (entrance animations)
  captures BLANK. Fix: `extraEntries` includes `"framer-motion"` so its
  `MotionGlobalConfig` is on `window.Virly` (the SAME instance the bundled
  components use), and each affected preview sets
  `MotionGlobalConfig.skipAnimations = true` at module scope → components mount in
  their final state. Affected previews: AnimatedText, OrderConfirmationCard,
  SignInCard2, UserProfileSidebar. (`reducedMotion` is NOT enough — it keeps opacity.)
- **Router sharing**: `react-router-dom` is in `extraEntries` so `MemoryRouter` is on
  `window.Virly` and shares the bundle's RouterContext. Previews import `MemoryRouter`
  from `"virly-client"` (NOT from `react-router-dom` directly — a second instance's
  context would not reach the components' `Link`/`NavLink`).
- Net effect: `window.Virly` carries ~481 exports (the 9 components + react-router-dom
  + framer-motion). Harmless — the agent works from the 9 cards/.d.ts/.prompt.md, and
  the README lists only the components.

## Per-component render notes
- **SignInCard2**, **UserProfileSidebar** need a router → wrapped in `<MemoryRouter>`
  (from `"virly-client"`). SignInCard2 is a controlled form: previews pass static
  values + noop handlers.
- **ShaderBackground** is a fullscreen `position: fixed` WebGL canvas. WebGL IS
  available in headless Chrome, but `h-full` collapsed the fixed canvas to 0 height
  in the preview harness. Fix: the preview wraps it in a `transform: translateZ(0)`
  div with explicit height (a transform establishes the containing block) +
  `cfg.overrides.ShaderBackground.cardMode = "single"`. Renders the teal plasma grid.
- **UserProfileSidebar** collapse is gated by `@media (min-width: 1080px)` AND an
  ANCESTOR `.sidebar-collapsed` class (global.css), not the component's own
  `collapsed` class. The Collapsed preview adds a `.sidebar-collapsed` wrapper and
  `cfg.overrides.UserProfileSidebar.viewport = "1200x640"` so the media query matches.
- **AnimatedText** renders its settled state thanks to `skipAnimations`; text is kept
  short ("Welcome to Virly") so it fits the card.

## Scope — usage-driven (22 components)
The set was re-derived from ACTUAL app usage (a first pass mistakenly shipped the
whole `ui/` folder including unused demos). Run the audit again on re-sync if the
component surface changed: `grep -rl` each candidate across `client/src`, excluding
its own file + tests; zero importers = drop it.
- **Primitives (`Primitives.tsx`, the real shared layer):** Button, Card, Field,
  TextareaField, PageHeader, EmptyState, ErrorBanner, SuccessBanner, ResponsiveGrid,
  PageStack, Skeleton — all heavily used (`.button`/`.card`/`.field`/… global.css classes).
- **Domain (`components/`):** TransferCheque, NotFoundSlip, TransactionList,
  TransactionReceipt, TransactionDetailsDialog, QuickContacts, ShellTopbar.
- **`TransferCheque` and `NotFoundSlip` were EXTRACTED** (not pre-existing) — both were
  inline page markup, lifted verbatim into props-driven components, with the pages
  refactored to render them. Real app code changes, committed with the sync; re-extract
  if a future page edit re-inlines them.
  - `TransferCheque` ← `features/transfer/TransferPage.tsx` (props: `mode`
    form/review/success + controlled values/handlers; the cheque-only
    `CURRENCY_WORD`/`CURRENCY_GLYPH`/`signatureName` + words/figure derivations moved in).
  - `NotFoundSlip` ← `features/not-found/NotFoundPage.tsx` (props: `requested`,
    `printedAt`, `reference`; the `paper`/`line`/`stamp` variants, `LedgerRow`, and the
    deterministic barcode moved in. Page keeps the screen layout + nav actions and
    computes the metadata). Presentational-only — no router needed; framer entrance →
    `skipAnimations` in the preview.
- **Distinctive ui (`components/ui/`):** Avatar, Select, AnimatedText, SignInCard2,
  UserProfileSidebar, ShaderBackground.
- **Two `Button`s**: the app's real Button is `Primitives.Button` (16 importers,
  `variant: primary|secondary|ghost|danger`), NOT shadcn `ui/button` (2 importers).
  The barrel exports `Primitives.Button` as `Button`; shadcn `ui/button` is NOT synced.
- **Dropped as unused** (zero importers): `BentoCard`, `OrderConfirmationCard`.
- **Excluded** (backend-wired): `FloatingChatWidget` + `Demo` — `useAuth` + `@/lib/api`
  + streaming, drag the api/auth/types/assistant graph (and `import.meta.env`) into the
  bundle, render only a closed FAB statically. To include later: add to
  `componentSrcMap` + barrel, set `cfg.provider` to a stub AuthProvider, expect floor cards.
- **AssistantBlocks sub-exports** (AssistantCard, StatusBadge, MoneyValue, …) are used
  0× outside `AssistantBlocks.tsx` — internal pieces, not standalone DS components.

## Domain-component render notes
- All domain components use `<Link>`/`useCurrency()`. **`CurrencyProvider` is NOT
  needed** — its default context (`defaultValue.formatAmount`) formats in ILS, so
  amounts render as ₪ without a wrapper. Previews still wrap in `<MemoryRouter>` (Link).
- **TransactionReceipt / TransactionDetailsDialog / ShellTopbar** use framer-motion
  entrance animations → `MotionGlobalConfig.skipAnimations = true` in their previews.
- **TransactionDetailsDialog** is a `position: fixed` full-screen overlay (renders
  nothing when `transaction` is null) → preview passes a transaction, wraps in a
  `transform: translateZ(0)` box, and `cfg.overrides` sets `cardMode: single` +
  a 900x720 viewport (same fixed-canvas containing-block fix as ShaderBackground).
- Domain components compose `Primitives` (Button/EmptyState) + lucide icons — all bundled.

## Re-sync risks (what can silently go stale)
- `client/.ds-styles.css` is a **snapshot** of the app's compiled CSS. If components
  gain new utility classes and the CSS isn't rebuilt, those previews/designs render
  unstyled for the new classes. Always rebuild the client + regenerate `.ds-styles.css`
  before a re-sync when `client/src` changed.
- `dtsPropsFor` bodies are hand-maintained copies of the source prop types — they do
  NOT auto-update. Re-check against source when a component's props change.
- Google Fonts are fetched at runtime; an offline render falls back to serif/sans.
- All 9 components currently share one flat group `general` (no doc categories yet) —
  a future polish could split Primitives / Blocks / Effects via `cfg.docsMap` stubs.
