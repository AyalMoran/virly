# Responsive UI Notes

## Scope

This pass covers the React client shell, auth screens, dashboard, transfer flow,
transactions list and details dialog, settings/profile forms, customer video
page, agent video queue, assistant chat widget, and shared UI primitives.

## Shared Components

- `PageStack` centralizes vertical page spacing.
- `ResponsiveGrid` centralizes one-column mobile layouts that expand into
  sidebar or split layouts at larger widths.
- `PageHeader` now exposes a title wrapper so long headings can wrap safely.
- Shared button sizing now starts at 44px+ touch targets for Tailwind UI
  buttons, while legacy `.button` controls use 48px minimum height.

## Breakpoints

- Base: mobile-first, single-column layouts, compact gutters, bottom navigation,
  readable card padding, wrapping forms/lists, and viewport-aware modals.
- `520px`: pagination returns to inline controls when space allows.
- `640px`: page headers and common two-column form groups expand.
- `760px`: definition lists use label/value columns.
- `900px`: transfer and settings side panels return.
- `960px`: auth pages return to split visual/card composition.
- `1080px`: the protected app shell returns to the sidebar layout and hides
  bottom navigation.
- `1180px`: dashboard returns to its main/sidebar composition.
- `1280px`: full desktop sidebar width returns.

## Main Changes

- Replaced fixed desktop assumptions with responsive grids, `clamp()`, viewport
  units, `minmax()`, and flexible gutters.
- Made the mobile bottom nav icon-led and compact, with safe-area offsets and
  text truncation for narrow widths.
- Moved the floating assistant above mobile navigation and made its window
  viewport-aware, scrollable, and usable on narrow screens.
- Improved transaction rows, quick contacts, contact pickers, profile lists,
  review lists, pagination, and modal details so long emails/IDs wrap instead
  of causing horizontal overflow.
- Made auth cards, personal-details forms, transfer forms, settings forms,
  video layouts, Jitsi containers, and agent queue rows adapt from mobile to
  desktop.
- Added responsive hooks for the dashboard bento card so decorative preview
  offsets scale inside narrow cards.

## Verification

- `npm run build --workspace client` passes.
- `git diff --check` passes.
- `npm run test:client` could not run in this sandbox because `tsx` failed to
  create `/tmp/tsx-1000/*.pipe` with `EPERM`. The requested outside-sandbox rerun
  was rejected by the approval system due to session usage limits.
- Live viewport screenshots at 320px, 375px, 768px, 1024px, and 1440px could not
  be completed in this session because both the Vite dev server and a temporary
  local mock API failed to bind localhost with `EPERM`, and the required
  outside-sandbox run was rejected by the approval system.

## Follow-Up

- Run the app locally with the real API and check the requested viewports in a
  browser: 320px, 375px, 768px, 1024px, and 1440px.
- Re-run `npm run test:client` in an environment where `tsx` can create its IPC
  socket.
- Consider code-splitting the assistant/video surfaces later; the production
  build still warns that one JavaScript chunk is larger than 500 kB.
