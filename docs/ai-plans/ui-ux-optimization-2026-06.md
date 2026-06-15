# UI/UX Review, Fix & Optimization — June 2026

Scope: client UI/UX and React components only. No business logic, API, or
technology-stack changes. All dependencies in `client/package.json` are untouched.

Verification: `tsc -b` + `vite build` pass; client test suite unchanged
(8 pass / 1 fail — the failing `assistantStructuredResponses` e2e test fails
identically on the previous commit and is unrelated to this work).

## Major / drastic changes

### 1. Removed the BentoCard demo from the dashboard
`DashboardPage` rendered `components/ui/bento-card.tsx` — a generic "Project
Dashboard" showcase widget filled with fabricated, non-banking data (fake team
members, "94.2% Team Performance", fake file archives). On a real cash-transfer
app this is a trust and clarity problem: users see plausible-looking data that
has nothing to do with their account. The card was removed from the dashboard
side column. The component file itself is kept (unused) so nothing is deleted
from the stack; it can be repurposed later with real account data if desired.

### 2. Route-level code splitting for video pages
`/video` and `/agent/video-sessions` (the Jitsi-based pages) are now loaded via
`React.lazy` + `Suspense` with a skeleton fallback. They were previously bundled
into the main chunk that every user downloads at login, although most sessions
never open them. Build output confirms three new lazy chunks
(`VideoSessionPage`, `AgentVideoSessionsPage`, `JitsiMeeting`).

### 3. Global reduced-motion support for Framer Motion
The app is now wrapped in `<MotionConfig reducedMotion="user">`. Previously only
CSS animations respected `prefers-reduced-motion`; all Framer Motion entrance,
tilt and stagger animations ignored it (WCAG 2.3.3 / Apple HIG Reduced Motion).

### 4. Shader background lifecycle management
`shader-background.tsx` ran an unconditional 60 fps WebGL `requestAnimationFrame`
loop forever — including in hidden tabs and for reduced-motion users (battery
drain, wasted main-thread budget). It now:
- pauses the loop when the document is hidden and resumes on return;
- renders a single static frame instead of animating when
  `prefers-reduced-motion: reduce` is set (and reacts to live preference changes);
- redraws the static frame after resizes while paused.

### 5. Accessible modal behavior for transaction details
`TransactionDetailsDialog` previously had no focus management: focus stayed
behind the dialog, Tab walked the background page, body kept scrolling, and the
backdrop fade was ~1 s. It now traps Tab focus inside the dialog, moves focus in
on open, restores focus to the trigger on close, locks body scroll while open,
and fades the backdrop in 250 ms.

## Smaller fixes (logged for completeness)

- **Iconography**: text glyphs used as icons (`↓`, `↑`, `↗`, `*`, `✓`) replaced
  with Lucide SVG icons (`ArrowDownLeft`, `ArrowUpRight`, `TrendingUp`, `Inbox`,
  `Check`) in `TransactionList`, `DashboardPage`, `Primitives.EmptyState`, and
  the sign-in checkbox. Glyphs render inconsistently across platforms and can't
  be styled as design tokens. Dead letter-icon CSS (`.icon-grid::before` etc.)
  removed.
- **Motion timing**: post-login shell/dashboard entrance animations cut from
  1.15–1.45 s to 0.6–0.8 s with tighter stagger (Material/HIG guidance:
  complex transitions ≤ 400 ms, hero entrances short).
- **Tabular numerals**: all monetary figures (balances, amounts, projections)
  now use `font-variant-numeric: tabular-nums` so digits align and don't shift
  layout as values change.
- **Viewport units**: `100vh` paired with `100dvh` overrides on body, app
  shell, sidebar, auth visual — fixes mobile browser chrome jumping.
- **Touch**: `touch-action: manipulation` on all interactive elements (kills
  legacy double-tap delay); chat send button enlarged 40→44 px; press-state
  scale feedback (`:active`) added to buttons, contact rows, and selectable
  transaction rows.
- **A11y details**: chat message list is now `role="log"` + `aria-live="polite"`;
  skeleton loaders are `role="status"` + `aria-busy`; transaction pagination is a
  labelled `<nav>`; empty transactions state gained helpful guidance copy;
  chat send button got an explicit `type="submit"`.

## Known issues intentionally not addressed here

- `styles/global.css` contains a legacy desktop-first media-query block that is
  later overridden by the appended mobile-first "Responsive system overrides"
  section. Behavior is correct; consolidating ~2,900 lines of CSS is a refactor
  best done separately with visual regression checks.
- The pre-existing failing e2e test (assistant emits raw `**markdown**` in the
  transfer-limits message) is a server-side response-blocks issue, out of scope
  for a UI pass.
