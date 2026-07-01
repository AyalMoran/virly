# Mobile Responsive Audit - Virly Web Client

> **Audience:** Frontend contributors, reviewers, anyone touching the client UI or design tokens.
> **Purpose:** Record every finding from the mobile-responsiveness audit of the web client, with the concrete evidence behind each one, so fixes can be actioned without re-running the audit.
> **Date:** 2026-07-01.
> **Scope:** Login and splash, dashboard, transfer, transactions, settings, AI Assistant.

---

## Table of contents

1. [Summary and verdict](#1-summary-and-verdict)
2. [Methodology and environment](#2-methodology-and-environment)
3. [Findings, sorted by severity](#3-findings-sorted-by-severity)
4. [Contrast appendix, computed ratios](#4-contrast-appendix-computed-ratios)
5. [Quick wins](#5-quick-wins)
6. [What is working well, verified](#6-what-is-working-well-verified)
7. [Not verified and needs follow-up](#7-not-verified-and-needs-follow-up)
8. [Skeptical fresh-eyes pass, what changed](#8-skeptical-fresh-eyes-pass-what-changed)

---

## 1. Summary and verdict

Virly is a genuinely well-built, mobile-first app.
The viewport meta is correct, there is zero horizontal overflow on any audited screen at any tested viewport, every input is 16px or larger with the correct type and keyboard, and the settings personal-details form has textbook `autocomplete` hints.
There are no blockers and no HIGH-severity breakages.
Every finding below is polish-level or accessibility-level.

Top three to fix first:

1. Faint account-statement labels fail WCAG AA contrast at roughly 2.2:1 (finding 1).
2. The bottom-nav "Transactions" label truncates to "Transacti..." at every mobile width (finding 2).
3. Several secondary tap targets sit below the 44px comfort target: modal close 30px, chat send and close 42px, currency select 38px tall (finding 3).

Severity scale used in this document:

- BLOCKER: breaks a core task on mobile (flow cannot complete or content is unreachable).
- HIGH: significant friction or clearly broken appearance that most users would notice.
- MEDIUM: a noticeable rough edge that hurts polish or affects a subset of users.
- LOW: a nitpick, refinement, or nice-to-have.

Result: 0 BLOCKER, 0 HIGH, 4 MEDIUM, 4 LOW.

---

## 2. Methodology and environment

**Target.**
`http://localhost:5173/`, the running Docker frontend (`virly-frontend-1`), wired to the local backend on `:3000` (`virly-app-1`), with local Mongo and Postgres.
Logged in as `admin@admin.com` (role admin, balance shown as the sample data throughout).

**Viewports tested.**
360x800 (Android), 390x844 (iPhone), 768x1024 (tablet).
Device pixel ratio 2 (mobile emulation confirmed via `window.devicePixelRatio`).

**Tools used.**
DOM and computed-style inspection, element bounding-box measurement, console capture, network capture, and live interaction (fill, click, send).

**Two environment notes that shaped the method:**

- The preview browser is normally bound to the launch config on port 5174, but the backend CORS allowlist (`VIRLY_CLIENT_URL`) is pinned to the single origin `http://localhost:5173`, so API calls from 5174 fail with `net::ERR_FAILED`.
  The audit was therefore driven against the real Docker origin on 5173, which is CORS-allowed, and login succeeded there.
  This CORS single-origin pin is a dev-config observation, not a responsive finding, but it is worth noting for anyone else running the preview harness against this backend.
- Screenshots were only partly usable.
  The WebGL shader background plus continuous framer-motion animations on the cheque, transactions, and chat screens made `preview_screenshot` either time out after 30s or return a 2x zoomed crop.
  On those screens the audit relied on measured computed styles and geometry, which are authoritative for layout, overflow, tap-size, font-size, and contrast.
  Page state was independently confirmed with `visualViewport.scale === 1` and `documentElement.scrollWidth === innerWidth`, so the layout is correct even where a clean picture could not be captured.

**Foundational mechanics, verified once and true across the audit:**

- Viewport meta is `width=device-width, initial-scale=1.0`.
  There is no `viewport-fit=cover`.
- No horizontal overflow at 360, 390, or 768 on any audited screen (`documentElement.scrollWidth === documentElement.clientWidth` on each).

---

## 3. Findings, sorted by severity

### Finding 1 - MEDIUM - Contrast - account-statement muted labels

- **Dimension:** Typography and readability (WCAG AA contrast).
- **Location:** `section.statement` on the dashboard; labels such as "CLOSING BALANCE", "BROUGHT FORWARD", "as of Jun 13, 2026", and the column headers.
- **Observed (fact):** the muted label style is `color: rgba(23, 61, 66, 0.42)` at 9.92px, painted over the statement background `rgb(233, 239, 220)`.
  The blended text color works out to about `rgb(145, 164, 155)`, which gives a contrast ratio of roughly 2.2:1 against that background.
  WCAG 2.1 AA requires 4.5:1 for text this size.
- **Likely cause (inference):** the muted token applies a low alpha (0.42) on top of an already light paper background, so the effective luminance is high.
- **Recommended fix:** raise the muted token to at least AA.

```css
/* Fix: statement muted labels are ~2.2:1, below WCAG AA 4.5:1 */
.statement .muted, .statement__label { color: rgba(23, 61, 66, 0.78); } /* ~4.6:1 */
```

- **Effort:** S.

### Finding 2 - MEDIUM - Navigation - bottom-nav label truncation

- **Dimension:** Navigation and chrome, typography.
- **Location:** `nav.mobile-nav`, the fixed bottom tab bar.
- **Observed (fact):** tab labels render at 9.92px with `text-overflow: ellipsis; white-space: nowrap`.
  The "Transactions" label overflows its cell at both mobile widths: `scrollWidth 56 > clientWidth 48` at 360px, and `scrollWidth 56 > clientWidth 53` at 390px.
  It therefore renders as "Transacti..." on both Android and iPhone widths.
  The other five labels fit ("Dashboard" is borderline at `scrollWidth 49` vs `clientWidth 48-49`).
- **Likely cause (inference):** six fixed-width tab cells plus a twelve-character label at a 10px font leave no room for "Transactions".
- **Recommended fix:** shorten the label (for example "Activity"), reduce per-item horizontal padding so twelve characters fit, or drop to a five-item bar since Transactions is also reachable from the dashboard statement.
- **Effort:** S.

### Finding 3 - MEDIUM - Tap targets - secondary controls below 44px

- **Dimension:** Tap targets and interaction.
- **Location:** transaction-receipt modal close button; AI chat send and header-close buttons; transfer currency select.
- **Observed (fact):**
  - Transaction-receipt modal close "x" is 30x30.
  - Chat send button and chat header close button are each 42x42.
  - Transfer currency `<select>` is 90 wide by 38 tall.
  - All of these clear the WCAG 2.5.8 minimum of 24px, but fall under the 44px Apple HIG comfort target, and they sit on a scrolling modal or a compact form where a confident thumb tap matters.
- **Likely cause (inference):** icon buttons and the select are sized to their glyph or line-height rather than to a 44px hit area.
- **Recommended fix:** give icon buttons and the select a 44px minimum hit area.

```css
.modal__close,
.floating-chat button[aria-label] { min-width: 44px; min-height: 44px; }
/* transfer currency select */
select[name="currency"] { min-height: 44px; }
```

- **Effort:** S.

### Finding 4 - MEDIUM (low end) - Contrast - inactive bottom-nav labels

- **Dimension:** Typography and readability (WCAG AA contrast).
- **Location:** `nav.mobile-nav`, inactive tab labels.
- **Observed (fact):** inactive tab label color is `rgba(23, 61, 66, 0.66)` at 9.92px over the nav background `rgb(230, 238, 201)`.
  That is a contrast ratio of about 3.9:1, just below the 4.5:1 AA bar for text this size.
  Each label sits under an icon, which mitigates the readability impact.
- **Likely cause (inference):** the inactive alpha (0.66) plus a small font size lands just under AA.
- **Recommended fix:** raise the inactive alpha to about 0.8, or enlarge the label to at least 12px, which also eases finding 2.
- **Effort:** S.

### Finding 5 - LOW - Layout - account-statement right-edge bleed at 360px

- **Dimension:** Layout and overflow.
- **Location:** `section.statement` on the dashboard at 360px.
- **Observed (fact):** the section renders at `left: 14, right: 365` on a 360px viewport, a fixed width of 351px, so its box extends 5px past the viewport edge.
  It is clipped by `overflow-x: hidden`, so no content is lost (internal `scrollWidth === clientWidth === 349`, and the rightmost value "-₪47,016.17" ends at `right: 342`) and there is no page scroll.
  The gutter is asymmetric: 14px on the left versus about 9px effective on the right.
- **Likely cause (inference):** the section uses a fixed 351px width instead of a fluid width with symmetric horizontal margins.
- **Recommended fix:** use symmetric gutters.

```css
/* Fix: 5px right-edge bleed from a fixed-width statement card */
.statement { width: auto; margin-inline: 14px; } /* or width: calc(100% - 28px) */
```

- **Effort:** S.

### Finding 6 - LOW - Media and loading - boot-splash split-flap clips at 360px

- **Dimension:** Media and assets, layout.
- **Location:** the boot-splash loading animation (`.boot-splash-panel`, `.boot-flap-board`, `.boot-flap-cell`) shown while transactions and the dashboard statement load.
- **Observed (fact):** during the load animation the flap board is 337px wide at `left: 49`, and with the panel padding the rightmost flap cells reach `right` of about 386, past the 360px edge, so one or two character cells are cut off on the right on the smallest phones.
  This is transient (only during load) and does not cause page scroll.
- **Likely cause (inference):** the flap board and cell sizes are fixed rather than scaled to the viewport.
- **Recommended fix:** clamp the board width and cell size on narrow viewports.

```css
.boot-flap-board { max-width: 100%; }
.boot-flap-cell { width: clamp(14px, 7vw, 20px); }
```

- **Effort:** S.

### Finding 7 - LOW - Responsive mechanics - tablet at 768px is an enlarged phone

- **Dimension:** Responsive mechanics (breakpoint gaps).
- **Location:** whole app at 768px, dashboard measured specifically.
- **Observed (fact):** at 768px the app keeps the fixed mobile bottom-nav (720px wide) and renders a single content column (`figma-dashboard-grid` / `dashboard-main-column`) that is 697px wide at `x: 31` to `right: 727`, with roughly 31px and 41px side margins.
  It is functional, the statement table reads well, and there is no overflow (`scrollWidth 758` at a 768 viewport).
  The extra width is unused: there is no sidebar nav and no multi-column layout, so the tablet is effectively a large phone.
- **Likely cause (inference):** there is no dedicated breakpoint at or above 768px; the mobile layout simply stretches.
- **Recommended fix (optional):** add a layout at 768px and up, for example cap and center the content width, or introduce a side rail or a two-column dashboard.
- **Effort:** M.

### Finding 8 - LOW - Tap target - "Create account" link on login

- **Dimension:** Tap targets and interaction.
- **Location:** login page, the "Create account" link under the Sign In button.
- **Observed (fact):** the standalone call-to-action link is 95px wide by 17px tall (13.44px font).
  It likely passes WCAG 2.5.8 via the spacing exception because it is isolated, but the tappable height is small for a primary secondary-action on a touch screen.
- **Likely cause (inference):** the link has no vertical padding, so its hit area equals its line box.
- **Recommended fix:** add vertical padding so the hit area is about 44px tall.

```css
.auth a.create-account { display: inline-block; padding-block: 12px; }
```

- **Effort:** S.

---

## 4. Contrast appendix, computed ratios

All colors below were read from `getComputedStyle` on the live page; backgrounds were found by walking up to the first element with an opaque background.
Ratios are computed with the standard WCAG relative-luminance formula.

| Element | Text color | Background | Font size | Contrast | AA (4.5:1) |
|---|---|---|---|---|---|
| Statement muted label ("Closing balance") | `rgba(23,61,66,0.42)` -> `rgb(145,164,155)` | `rgb(233,239,220)` | 9.92px | ~2.2:1 | Fails |
| Inactive bottom-nav label ("Transfer") | `rgba(23,61,66,0.66)` -> `rgb(93,121,112)` | `rgb(230,238,201)` | 9.92px | ~3.9:1 | Fails (marginal) |
| Balance caption ("as of Jun 13, 2026") | `rgba(23,61,66,0.66)` | statement paper `rgb(233,239,220)` | 11.84px | not individually computed | at risk, see note |

Note: the balance caption uses the same 0.66 alpha as the nav label but at a slightly larger font over the lighter statement paper; it was not individually computed but is in the same at-risk band and should be checked when fixing finding 1.
The base brand ink is `rgb(23, 61, 66)`, a dark teal; the light-on-light palette means any alpha below roughly 0.75 on these backgrounds risks failing AA at small sizes.

---

## 5. Quick wins

High impact, low effort, ready to action:

- Bump the `.statement` muted-label alpha from 0.42 to about 0.78; this fixes the one clear AA failure (finding 1).
- Shorten or re-fit the "Transactions" tab label so it stops truncating (finding 2).
- Add a 44x44 minimum hit area to the modal-close, chat send and close, and currency select controls (findings 3 and 4).
- Make the statement gutters symmetric with `margin-inline` instead of a fixed width, removing the 5px right bleed (finding 5).
- Raise the inactive nav-label alpha to about 0.8, which also lifts contrast (finding 4).

---

## 6. What is working well, verified

These were measured and confirmed good; keep them.

**Responsive mechanics.**

- Correct `<meta name="viewport" content="width=device-width, initial-scale=1.0">`.
- No horizontal overflow at 360, 390, or 768 on login, dashboard, transfer, transactions, settings, or chat.

**Forms and input, no iOS zoom-on-focus anywhere (every input measured at 16px or larger):**

- Login: email input `type=email` with `autocomplete=email`, 16px, 281x48; password `type=password` with `autocomplete=current-password`, 16px, 281x48; show-password button 44x44; Sign In 283x48.
- Transfer: recipient `type=email`, 16.64px, 289x48; amount `type=number` with `inputmode=decimal`, 25.6px, 245x48 (numeric keyboard); memo text input, 16px, 289x48.
- Transactions: counterparty filter `type=email`, 16px, 293x52.
- Settings personal-details form: ten fields, each 16px and 293x52, all with precise `autocomplete` hints - `given-name`, `family-name`, `bday` (with `type=date` for a native date picker), `country-name`, `address-level1`, `address-level2`, `postal-code`, `address-line1`, `address-line2`.
- Currency selection is a native `<select>` (76x48 on the top bar), giving a proper mobile picker.

**Primary actions and touch.**

- Primary calls-to-action are 48 to 50px tall and full width: dashboard Transfer 331x48, transfer quick-contact rows 331x50, Review cheque 331x48, review-step Sign & send 171x48 and Edit 150x48, transactions Filter and Reset 293x48 each, settings Edit 293x48 and Sign out 99x48.
- The floating chat FAB is 56x56 at `y: 654` and clears the bottom nav at `y: 732`, so it does not overlap.
- Transaction rows are roomy at 293x137.
- The transaction-receipt modal is 336px wide (`x: 12` to `right: 348`), 776px tall, and scrolls internally via `overflow-y: auto` with no internal horizontal clip.

**AI Assistant.**

- The chat window is sized `w-[calc(100vw-2rem)]` (about 323 to 340px on a 360 screen) with a max-width cap.
- When expanded with content it stays inside the viewport (`top: 54`, `bottom: 710` of an 800px viewport).
- The message textarea is 16px (no zoom), 249x49.
- The message scroll area grew from 209px to 405px as content arrived, with `scrollWidth === clientWidth` (no horizontal clip).
- A live message "What is my current balance?" returned a response containing a rich "Virly account / Available balance" block that reflowed with no overflow.

**Dashboard at 768px.**

- Content is a single ~697px column with roughly centered 31/41px margins, no overflow, and a readable statement table.

---

## 7. Not verified and needs follow-up

- **Screenshots on animated screens.**
  `preview_screenshot` timed out or returned a 2x zoomed crop on the transfer cheque, transactions, and chat screens due to the WebGL shader plus requestAnimationFrame animations.
  Layout was verified by measurement (`visualViewport.scale === 1`, `scrollWidth === innerWidth`), so structure is confirmed; only pixel-level visual confirmation of those three screens is missing.
- **Full contrast sweep.**
  Ratios were computed for the two faint elements above from measured colors, but an automated pass over every text style (placeholder text, receipt fine-print, disabled states) was not run.
  Recommend an axe or Lighthouse pass.
- **Landscape orientation.**
  Not tested.
- **Real-device notch and safe area.**
  The fixed bottom nav does not use `env(safe-area-inset-*)` (measured `padding-bottom: 4px`, no `env()` in the computed padding), but because the viewport meta has no `viewport-fit=cover`, the browser reserves the home-indicator area automatically, so the nav is not obscured on current config.
  This becomes a real issue only if `viewport-fit=cover` is later added; it should be re-checked on hardware then.

---

## 8. Skeptical fresh-eyes pass, what changed

After drafting, a skeptical review tried to refute each finding.

- "Content is pinned to the left at 768px" was dropped: measurement showed the column is roughly centered with 31/41px margins, not left-pinned.
- "The fixed bottom nav will be obscured by the notch or home indicator" was dropped: there is no `viewport-fit=cover`, so the browser reserves the safe areas and the nav is not obscured on current config.
- The boot-splash clip (finding 6) and the statement right bleed (finding 5) were kept but rated LOW, because neither causes page scroll or data loss.
- The two contrast findings and the nav truncation were kept: they are computed from measured values and were reproduced across viewports (the truncation at both 360 and 390, the contrast from directly measured colors and backgrounds), so they survive scrutiny.
