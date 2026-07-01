# Mobile Responsive Audit Fixes Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Fix all 8 findings from `docs/reviews/2026-07-01-mobile-responsive-audit.md` so the Virly web client passes WCAG AA contrast on its faint labels, stops truncating the bottom-nav "Transactions" label, gives secondary controls a 44px hit area, removes two narrow-viewport layout bleeds, and gives the tablet breakpoint a real layout.

**Architecture:** These are CSS and one small markup change only, concentrated in `client/src/styles/global.css` (plain CSS class names that map 1:1 to component classes) plus one component file (`floating-chat-widget-shadcnui.tsx`). There is no client CSS/layout test harness (client Jest runs in `node` via `renderToStaticMarkup` with no jsdom and no layout engine), so every fix is verified the same way the audit was produced: by measuring computed styles, geometry, and contrast in a real browser at the audited viewports. Each task reproduces the finding by measurement first, applies the fix, then re-measures to confirm.

**Tech Stack:** React 19, Vite, Tailwind v4 (`@theme` in `client/src/index.css`), plain CSS in `client/src/styles/global.css`, Radix, framer-motion, shadcn/ui primitives. Verification uses the preview browser MCP tools (`preview_start`, `preview_resize`, `preview_eval`, `preview_inspect`, `preview_screenshot`).

## Global Constraints

- Never use the em dash "-". Use a plain dash instead. (Applies to any copy or comment you add.)
- Never use emojis in code, comments, commit messages, or docs.
- The brand ink is `#173d42` = `rgb(23, 61, 66)`, defined as `--color-text` in `client/src/styles/global.css:9`. Low-alpha tints of it are the root cause of the two contrast failures: `--color-muted: rgba(23, 61, 66, 0.66)` (`global.css:12`) and `--color-subtle: rgba(23, 61, 66, 0.42)` (`global.css:13`).
- `--color-subtle` and `--color-muted` are global tokens used across many components on many backgrounds. Do NOT change the token definitions. Scope every contrast fix to the specific failing selectors so unrelated screens are untouched.
- WCAG 2.1 AA target for the text in scope: contrast ratio >= 4.5:1 (all in-scope labels are below 18.66px, so the large-text 3:1 exception does not apply).
- Apple HIG comfort tap target: >= 44px x 44px. WCAG 2.5.8 hard minimum is 24px; the audit findings are about the 44px comfort target.
- CI is exactly: server typecheck, server unit tests, client unit tests (`.github/workflows/ci.yml`). There is no lint step and no CSS test. Do not break the existing client Jest suite.
- Multiple tasks edit `client/src/styles/global.css` but each owns a distinct, non-overlapping selector block; edits will not collide.

---

## Verification environment (shared by every task)

The audit could not use the preview harness's default port because the backend CORS allowlist (`VIRLY_CLIENT_URL`) is pinned to the single origin `http://localhost:5173`, and the preview launch config binds to `5174`, so API calls from 5174 fail with `net::ERR_FAILED`. Drive verification against `http://localhost:5173`.

**Bring the app up (two terminals, from repo root):**

```bash
npm run dev:server   # Express + Socket.IO on http://localhost:3000
npm run dev:client   # Vite on http://localhost:5173 (CORS-allowed origin)
```

**Point the preview browser at the running client and log in:**

- `preview_start` (or navigate the preview browser) to `http://localhost:5173/`.
- Log in as `admin@admin.com` (the audit account; sample data with a visible balance and statement).
- If the preview harness forces port 5174 and login fails with `net::ERR_FAILED`, fall back to the Docker frontend on 5173 (`virly-frontend-1`) exactly as the audit did; the measurement snippets below run identically against either origin.

**Viewports (set with `preview_resize`):** 360x800 (Android, the tightest), 390x844 (iPhone), 768x1024 (tablet). Device pixel ratio 2.

**Install the contrast helper once per browser session (run via `preview_eval`).** It composites the text color's alpha over the nearest opaque ancestor background and returns the WCAG ratio, matching the audit method:

```js
window.__contrast = (selector) => {
  const el = document.querySelector(selector);
  if (!el) return { error: "not found: " + selector };
  const parse = (s) => {
    const n = (s.match(/[-\d.]+/g) || []).map(Number);
    return { r: n[0] || 0, g: n[1] || 0, b: n[2] || 0, a: n[3] === undefined ? 1 : n[3] };
  };
  const opaqueBg = (node) => {
    let cur = node;
    while (cur) {
      const c = parse(getComputedStyle(cur).backgroundColor);
      if (c.a === 1) return c;
      cur = cur.parentElement;
    }
    return { r: 255, g: 255, b: 255, a: 1 };
  };
  const bg = opaqueBg(el);
  const raw = parse(getComputedStyle(el).color);
  const fg = {
    r: raw.r * raw.a + bg.r * (1 - raw.a),
    g: raw.g * raw.a + bg.g * (1 - raw.a),
    b: raw.b * raw.a + bg.b * (1 - raw.a),
  };
  const toLin = (c) => {
    c /= 255;
    return c <= 0.03928 ? c / 12.92 : Math.pow((c + 0.055) / 1.055, 2.4);
  };
  const lum = (c) => 0.2126 * toLin(c.r) + 0.7152 * toLin(c.g) + 0.0722 * toLin(c.b);
  const L1 = lum(fg), L2 = lum(bg);
  const ratio = (Math.max(L1, L2) + 0.05) / (Math.min(L1, L2) + 0.05);
  return {
    ratio: Math.round(ratio * 100) / 100,
    fontSizePx: getComputedStyle(el).fontSize,
    color: getComputedStyle(el).color,
  };
};
```

**Size helper (run via `preview_eval`)** returns an element's rendered box:

```js
window.__box = (selector) => {
  const el = document.querySelector(selector);
  if (!el) return { error: "not found: " + selector };
  const r = el.getBoundingClientRect();
  return {
    w: Math.round(r.width), h: Math.round(r.height),
    left: Math.round(r.left), right: Math.round(r.right),
    viewport: window.innerWidth,
  };
};
```

A `preview_eval` returning `{ error: "not found" }` means the target is not mounted on the current screen; navigate to the screen named in the task first.

---

## File structure

| File | Responsibility | Findings touched |
|---|---|---|
| `client/src/styles/global.css` | All plain-CSS class styling: statement labels, mobile-nav (label color + two-line wrap), tap targets, boot-splash flap, login link, tablet media query | 1, 2, 3, 4, 5, 6, 7, 8 |
| `client/src/components/ui/floating-chat-widget-shadcnui.tsx` | AI chat header-close button size | 3 |

Two files, no new files, no changes to the Tailwind `@theme` block or design-token definitions. (Finding 2 is now a CSS two-line wrap - the product owner chose to keep the "Transactions" label rather than rename it, so `AppShell.tsx` is untouched.)

---

## Task 1: Statement muted-label contrast (Finding 1)

Raise the faint statement labels from ~2.2:1 (and the "as of" caption from ~3.9:1) to >= 4.5:1 by darkening the four statement-label selectors from the low-alpha tokens to a solid `rgba(23, 61, 66, 0.78)` tint (computed ~5.5:1 on the `#e9efdc` statement paper).

**Files:**
- Modify: `client/src/styles/global.css` (selectors `.statement-microlabel`, `.statement-ledger-head > span`, `.statement-figures span`, `.statement-asof`)

**Interfaces:**
- Owns selectors: `.statement-microlabel`, `.statement-ledger-head > span`, `.statement-figures span`, `.statement-asof`. No other task edits these.

- [ ] **Step 1: Reproduce the failure by measurement**

Navigate to `/dashboard` at 360x800. Install the contrast helper (see Verification environment). Run via `preview_eval`:

```js
[ window.__contrast('.statement-microlabel'),
  window.__contrast('.statement-ledger-head > span'),
  window.__contrast('.statement-figures span'),
  window.__contrast('.statement-asof') ]
```

Expected (reproduces Finding 1): `.statement-microlabel` and `.statement-ledger-head > span` return `ratio` ~2.2, `.statement-figures span` and `.statement-asof` return `ratio` ~3.9 - all below 4.5.

- [ ] **Step 2: Apply the fix**

In `client/src/styles/global.css`, `.statement-microlabel` currently ends with:

```css
.statement-microlabel {
  font-family: ui-monospace, "SFMono-Regular", Menlo, Consolas, monospace;
  font-size: 0.62rem;
  font-weight: 700;
  letter-spacing: 0.18em;
  text-transform: uppercase;
  color: var(--color-subtle);
}
```

Change its last declaration to:

```css
  color: rgba(23, 61, 66, 0.78); /* was var(--color-subtle) 0.42 -> ~2.2:1; now ~5.5:1 for WCAG AA */
```

In `.statement-ledger-head > span` change `color: var(--color-subtle);` to `color: rgba(23, 61, 66, 0.78);`.

In `.statement-figures span` change `color: var(--color-muted);` to `color: rgba(23, 61, 66, 0.78);`.

In `.statement-asof` change `color: var(--color-muted);` to `color: rgba(23, 61, 66, 0.78);`.

- [ ] **Step 3: Re-measure to confirm the fix**

Reload `/dashboard` at 360x800 (Vite HMR should apply the CSS automatically; if not, `preview_eval` `window.location.reload()`). Re-run the Step 1 `preview_eval`.
Expected: all four `ratio` values >= 4.5 (approximately 5.5).

- [ ] **Step 4: Confirm no visual regression**

Run `preview_screenshot` of the dashboard statement at 390x844. Confirm the labels are still clearly the secondary tier (darker than before, but not as heavy as the balance figures) and the paper card is unchanged.

- [ ] **Step 5: Guard the existing suite**

```bash
npm run test:client -- AccountStatement
npx tsc -p client/tsconfig.json --noEmit
```

Expected: PASS (no client test asserts these colors; this confirms nothing else broke). If there is no `AccountStatement` test file, run `npm run test:client` and expect PASS.

- [ ] **Step 6: Commit**

```bash
git add client/src/styles/global.css
git commit -m "fix(client): raise statement muted labels to WCAG AA contrast"
```

---

## Task 2: Inactive bottom-nav label contrast (Finding 4)

The inactive mobile-nav labels render at `rgba(23, 61, 66, 0.66)` (~3.9:1 on the `rgb(230, 238, 201)` nav). Darken the mobile-nav label to `rgba(23, 61, 66, 0.78)` (computed ~5.4:1). Scope it to `.mobile-nav-item` only so the desktop sidebar `.nav-item` (which shares the base color rule) is untouched; the `.mobile-nav-item.active` rule keeps its higher specificity and still wins for the active tab.

**Files:**
- Modify: `client/src/styles/global.css` (the mobile-layout `.mobile-nav-item` block near line 3417)

**Interfaces:**
- Owns: the `color` declaration on the mobile-layout `.mobile-nav-item` block. Does not touch the shared `.nav-item, .mobile-nav-item` base rule (near line 396) or the `.active` rule.
- Coordinates with Task 3 (same component, different property); the two edits are in different rule blocks.

- [ ] **Step 1: Reproduce the failure by measurement**

At 360x800 on any screen (the nav is global), install the contrast helper and run `preview_eval`:

```js
window.__contrast('.mobile-nav-item:not(.active) span:last-child')
```

Expected: `ratio` ~3.9 (below 4.5), reproducing Finding 4.

- [ ] **Step 2: Apply the fix**

In `client/src/styles/global.css`, the mobile-layout `.mobile-nav-item` block currently reads:

```css
.mobile-nav-item {
  flex-direction: column;
  justify-content: center;
  gap: 3px;
  min-width: 0;
  min-height: 54px;
  border-radius: 14px;
  padding: 5px 3px;
  font-size: clamp(0.62rem, 2.4vw, 0.74rem);
  line-height: 1.05;
  text-align: center;
}
```

Add one declaration inside that block:

```css
  color: rgba(23, 61, 66, 0.78); /* was var(--color-muted) 0.66 -> ~3.9:1; now ~5.4:1 for WCAG AA */
```

- [ ] **Step 3: Re-measure to confirm the fix**

Reload at 360x800. Re-run the Step 1 `preview_eval`.
Expected: `ratio` >= 4.5 (approximately 5.4).

- [ ] **Step 4: Confirm the active tab is still distinct**

Run `preview_eval`:

```js
[ getComputedStyle(document.querySelector('.mobile-nav-item.active')).color,
  getComputedStyle(document.querySelector('.mobile-nav-item:not(.active)')).color ]
```

Expected: the active color is the teal `--color-primary-deep` (`rgb(31, 95, 103)`), distinct from the new inactive `rgba(23, 61, 66, 0.78)`. The active state must not have regressed to the inactive color.

- [ ] **Step 5: Commit**

```bash
git add client/src/styles/global.css
git commit -m "fix(client): raise inactive mobile-nav labels to WCAG AA contrast"
```

---

## Task 3: 44px hit areas for secondary controls (Finding 3)

Three controls sit below the 44px comfort target: the transaction-receipt modal close (`.tr-close`, 30x30), the AI chat header-close button (`min-h-10 min-w-10` = 40x40), and the transfer currency `<select>` (`.cheque-currency select`, 38 tall). Give each a 44px minimum. The chat send button is already `h-11 w-11` (44x44) and needs no change; verify it in Step 5 and leave it.

**Files:**
- Modify: `client/src/styles/global.css` (`.tr-close` near line 4205; `.cheque-currency select` near line 4844)
- Modify: `client/src/components/ui/floating-chat-widget-shadcnui.tsx` (the header-close `<Button>`, around line 763-771)

**Interfaces:**
- Owns selectors `.tr-close` and `.cheque-currency select` in `global.css`, and the header-close button className in the chat widget. No overlap with Task 2's `.mobile-nav-item` color edit.

- [ ] **Step 1: Reproduce the three undersized controls by measurement**

- Transaction-receipt close: navigate to `/transactions`, open any transaction to show its receipt modal, then `preview_eval` `window.__box('.tr-close')`. Expected: `w: 30, h: 30`.
- Transfer currency select: navigate to `/transfer` (form step), `preview_eval` `window.__box('#transfer-currency')`. Expected: `h: 38`.
- Chat header-close: open the floating chat, `preview_eval` `window.__box('[aria-label="Close chat"]')`. Expected: `h: 40, w: 40` (the `min-h-10 min-w-10` button; the 56x56 element is the separate FAB toggle, which is fine and out of scope).

- [ ] **Step 2: Fix the modal close button**

In `client/src/styles/global.css`, `.tr-close` currently declares `width: 30px;` and `height: 30px;`. Change both to `44px`:

```css
  width: 44px;  /* was 30px; 44px comfort tap target */
  height: 44px; /* was 30px */
```

Leave the border, radius, background, and centered `place-items: center` as-is; the glyph stays centered in the larger circle.

- [ ] **Step 3: Fix the transfer currency select**

In `client/src/styles/global.css`, `.cheque-currency select` currently declares `min-height: 38px;`. Change it:

```css
  min-height: 44px; /* was 38px; 44px comfort tap target */
```

- [ ] **Step 4: Fix the chat header-close button**

In `client/src/components/ui/floating-chat-widget-shadcnui.tsx`, the header-close button currently reads:

```tsx
<Button
  variant="ghost"
  size="icon"
  className="min-h-10 min-w-10 shrink-0 rounded-full hover:bg-background/50"
  onClick={() => setIsOpen(false)}
  aria-label="Close chat"
>
  <X className="h-4 w-4" />
</Button>
```

Change `min-h-10 min-w-10` to `min-h-11 min-w-11` (40px -> 44px):

```tsx
  className="min-h-11 min-w-11 shrink-0 rounded-full hover:bg-background/50"
```

- [ ] **Step 5: Re-measure all four controls to confirm**

Repeat the Step 1 measurements plus the send button. Run each `window.__box(...)` on its screen:

```js
// receipt modal open:        window.__box('.tr-close')                 -> h >= 44, w >= 44
// transfer form:             window.__box('#transfer-currency')        -> h >= 44
// chat open:                 window.__box('[aria-label="Close chat"]') -> h >= 44, w >= 44
// chat open (send button):   window.__box('[aria-label="Send message"]') -> h: 44, w: 44 (already compliant, unchanged)
```

Expected: the first three now report >= 44 in both dimensions; the send button confirms 44 (documents that no change was needed).

- [ ] **Step 6: Confirm no visual regression and guard the suite**

`preview_screenshot` the receipt modal and the transfer form; confirm the enlarged close button and select look intentional and aligned. Then:

```bash
npm run test:client -- floating-chat
npx tsc -p client/tsconfig.json --noEmit
```

Expected: PASS. If no matching test file, run `npm run test:client` and expect PASS.

- [ ] **Step 7: Commit**

```bash
git add client/src/styles/global.css client/src/components/ui/floating-chat-widget-shadcnui.tsx
git commit -m "fix(client): give modal close, chat close, and currency select 44px hit areas"
```

---

## Task 4: Stop the bottom-nav "Transactions" label truncating (Finding 2)

At 360 and 390 the 12-character "Transactions" label overflows its tab cell and renders as "Transacti...". Decision (confirmed with the product owner): keep the word "Transactions" so the label mirrors the `/transactions` route and the page heading, and fix the fit by letting the label wrap to two lines via CSS instead of renaming. The `.mobile-nav-item` already has `min-height: 54px`, which accommodates an icon plus two label lines, and all tab cells share it, so the tabs stay aligned (the bar grows ~12px taller only on the narrowest phones). No `AppShell.tsx` or route change.

**Files:**
- Modify: `client/src/styles/global.css` (the `.mobile-nav-item > span:last-child` rule, near line 3438)

**Interfaces:**
- Owns the `.mobile-nav-item > span:last-child` rule. Distinct from Task 2's `.mobile-nav-item` color edit, so the two do not collide.

- [ ] **Step 1: Reproduce the truncation by measurement**

At 360x800, `preview_eval`:

```js
(() => {
  const el = [...document.querySelectorAll('.mobile-nav-item span:last-child')]
    .find(n => n.textContent.trim().startsWith('Transac'));
  return el ? { text: el.textContent, scrollWidth: el.scrollWidth, clientWidth: el.clientWidth } : 'not found';
})()
```

Expected: `scrollWidth` (~56) `> clientWidth` (~48), confirming the label is clipped by the ellipsis. Repeat at 390x844 (scrollWidth ~56 > clientWidth ~53).

- [ ] **Step 2: Apply the fix**

In `client/src/styles/global.css`, the `.mobile-nav-item > span:last-child` rule currently reads:

```css
.mobile-nav-item > span:last-child {
  max-width: 100%;
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}
```

Replace the single-line ellipsis with a two-line clamp:

```css
.mobile-nav-item > span:last-child {
  max-width: 100%;
  overflow: hidden;
  display: -webkit-box;
  -webkit-line-clamp: 2;
  -webkit-box-orient: vertical;
  white-space: normal;
  line-height: 1.05;
}
```

- [ ] **Step 3: Confirm the full word now shows on two lines**

Reload at 360x800 and `preview_eval`:

```js
(() => {
  const el = [...document.querySelectorAll('.mobile-nav-item span:last-child')]
    .find(n => n.textContent.trim().startsWith('Transac'));
  return el ? { text: el.textContent, scrollWidth: el.scrollWidth, clientWidth: el.clientWidth, lines: Math.round(el.scrollHeight / parseFloat(getComputedStyle(el).lineHeight)) } : 'not found';
})()
```

Expected: `text` is the full "Transactions" (no ellipsis), `scrollWidth <= clientWidth` (no horizontal clip), and `lines` is 2. Repeat at 390x844.

- [ ] **Step 4: Confirm the tab bar stays aligned and there is no page scroll**

`preview_eval` to check all tab cells share a height and the page did not gain horizontal scroll:

```js
({
  heights: [...document.querySelectorAll('.mobile-nav-item')].map(n => Math.round(n.getBoundingClientRect().height)),
  noPageScroll: document.documentElement.scrollWidth === document.documentElement.clientWidth,
})
```

Expected: every value in `heights` is equal (tabs aligned), and `noPageScroll: true`. `preview_screenshot` the bottom nav at 360 to confirm the two-line "Transactions" reads cleanly and the other tabs are vertically centered. Then:

```bash
npm run test:client -- AppShell
npx tsc -p client/tsconfig.json --noEmit
```

Expected: PASS (no test asserts the nav label; the route and page heading are untouched). If there is no AppShell test file, run `npm run test:client` and expect PASS.

- [ ] **Step 5: Commit**

```bash
git add client/src/styles/global.css
git commit -m "fix(client): wrap bottom-nav labels to two lines so Transactions stops truncating"
```

---

## Task 5: Remove the statement right-edge bleed at 360px (Finding 5)

At 360px the statement card box extends ~5px past the right viewport edge (clipped by `overflow-x: hidden`, so no data loss or page scroll). The statement card itself has no `width` set; the bleed comes from the layout around it. This task reproduces the exact overflow first (per the house rule of reproducing before fixing), then applies grid-child overflow guards, then confirms zero bleed.

**Files:**
- Modify: `client/src/styles/global.css` (`.statement` near line 5069; `.dashboard-main-column, .dashboard-side-column` near line 683)

**Interfaces:**
- Owns the `max-width`/`min-width` guards it adds to `.statement` and the dashboard column selectors. Does not change the statement paper styling, padding, or the `--page-gutter` token.

- [ ] **Step 1: Reproduce and locate the overflowing box**

Navigate to `/dashboard` at 360x800. `preview_eval` to walk the statement's ancestor chain and find which element's right edge exceeds the viewport:

```js
(() => {
  let el = document.querySelector('.statement');
  const chain = [];
  while (el && el !== document.body) {
    const r = el.getBoundingClientRect();
    chain.push({ cls: el.className.toString().slice(0, 40), right: Math.round(r.right), width: Math.round(r.width) });
    el = el.parentElement;
  }
  return { viewport: window.innerWidth, chain };
})()
```

Expected: `.statement` reports `right` ~365 on a 360 viewport (the ~5px bleed). Note which ancestor first exceeds `viewport` - that is the element to constrain.

- [ ] **Step 2: Apply grid-child overflow guards**

Grid and flex children default to `min-width: auto`, which lets a child refuse to shrink below its content and push past the track. Add explicit guards.

In `client/src/styles/global.css`, the `.dashboard-main-column, .dashboard-side-column` rule currently reads:

```css
.dashboard-main-column,
.dashboard-side-column {
  display: grid;
  gap: 24px;
}
```

Add `min-width: 0;`:

```css
.dashboard-main-column,
.dashboard-side-column {
  display: grid;
  gap: 24px;
  min-width: 0; /* allow grid children (statement) to shrink to the track, no right-edge bleed */
}
```

Then in the `.statement` rule add a `max-width` guard as the first declaration after `position: relative;`:

```css
  max-width: 100%; /* never exceed the content column; fixes ~5px right-edge bleed at 360px */
```

- [ ] **Step 3: Re-measure to confirm zero bleed**

Reload `/dashboard` at 360x800. Re-run the Step 1 `preview_eval`.
Expected: `.statement` `right` <= 360 and every ancestor `right` <= `viewport`. Also `preview_eval` `document.documentElement.scrollWidth === document.documentElement.clientWidth` returns `true` (still no horizontal page scroll).

If the statement `right` still exceeds 360 after this, the culprit named in Step 1's chain is elsewhere (for example the `.page-frame` gutter); constrain that specific element to `max-width: 100%` / symmetric `padding-inline` and re-measure. Do not move on until `right <= 360`.

- [ ] **Step 4: Confirm at 390 and 768 and screenshot**

Re-run Step 3's measurement at 390x844 and 768x1024; expect no regression (statement still within viewport, no page scroll). `preview_screenshot` the dashboard at 360 to confirm the card gutter now looks symmetric.

- [ ] **Step 5: Guard the suite and commit**

```bash
npm run test:client -- Dashboard
npx tsc -p client/tsconfig.json --noEmit
git add client/src/styles/global.css
git commit -m "fix(client): remove statement right-edge bleed at narrow viewports"
```

Expected: tests PASS (or run full `npm run test:client` if no Dashboard test file).

---

## Task 6: Clamp the boot-splash split-flap board at 360px (Finding 6)

During load, the 16-cell split-flap board plus panel padding reaches past the 360px edge, clipping the rightmost one or two character cells. It is transient and causes no page scroll, but it looks broken on the smallest phones. Shrink the cell floor, tighten the gap and panel padding, and cap the board so all 16 cells fit inside 360px with margin to spare. Target math at 360px: 16 cells x 14.4px (`4vw`) + 15 gaps x 2px = ~260px board; panel content padding 16px each side -> ~292px < 360px.

**Files:**
- Modify: `client/src/styles/global.css` (`.boot-splash-panel` near line 5502; `.boot-flap-board` near line 5528; `.boot-flap-cell` near line 5534; `.boot-flap-char` near line 5565)

**Interfaces:**
- Owns the `.boot-splash-panel` horizontal padding and the three `.boot-flap-*` sizing declarations. No other task touches boot-splash.

- [ ] **Step 1: Reproduce the clip by measurement**

The boot-splash shows only during load. Trigger it by `preview_eval` `window.location.reload()` on `/dashboard`, then immediately (within the load window) `preview_eval`:

```js
(() => {
  const board = document.querySelector('.boot-flap-board');
  if (!board) return 'splash not visible (load finished) - reload and retry sooner';
  const cells = board.querySelectorAll('.boot-flap-cell');
  const last = cells[cells.length - 1].getBoundingClientRect();
  return { viewport: window.innerWidth, cellCount: cells.length, lastCellRight: Math.round(last.right), boardWidth: Math.round(board.getBoundingClientRect().width) };
})()
```

Expected at 360x800: `lastCellRight` > 360 (the rightmost cells are cut off). If load finishes before you can measure, throttle or reload and retry; the audit observed the board reaching a right edge of ~386 on a 360 viewport.

- [ ] **Step 2: Apply the clamp fixes**

In `client/src/styles/global.css`:

`.boot-splash-panel` currently has `padding: 26px clamp(24px, 6vw, 36px);`. Reduce the horizontal clamp:

```css
  padding: 26px clamp(16px, 5vw, 36px); /* narrower side padding so the flap board fits 360px */
```

`.boot-flap-board` currently has `gap: 3px;`. Add a max-width guard and tighten the gap:

```css
.boot-flap-board {
  display: flex;
  gap: 2px;         /* was 3px */
  max-width: 100%;  /* never exceed the panel */
  perspective: 520px;
}
```

`.boot-flap-cell` currently has `width: clamp(17px, 4.6vw, 26px);` and `height: clamp(28px, 7vw, 38px);`. Lower the width floor so 16 cells fit at 360px:

```css
  width: clamp(14px, 4vw, 24px);  /* was clamp(17px, 4.6vw, 26px); fits 16 cells at 360px */
  height: clamp(26px, 6.4vw, 38px); /* was clamp(28px, 7vw, 38px); keep flap aspect */
```

`.boot-flap-char` currently has `font-size: clamp(14px, 3.4vw, 20px);`. Lower the floor to match the smaller cell:

```css
  font-size: clamp(12px, 3.2vw, 20px); /* was clamp(14px, 3.4vw, 20px); fit the narrower cell */
```

- [ ] **Step 3: Re-measure to confirm it fits**

Reload `/dashboard` at 360x800 and re-run the Step 1 `preview_eval` during the load window.
Expected: `lastCellRight` <= 360 and `boardWidth` roughly 260-265. `preview_eval` `document.documentElement.scrollWidth === document.documentElement.clientWidth` returns `true`.

- [ ] **Step 4: Confirm wider viewports are unchanged in spirit**

At 768x1024, reload and measure: the board should be comfortably centered and legible (cells at the 24px max). `preview_screenshot` during load if the animation permits; otherwise rely on the measurement (the audit noted screenshots on this animated screen can time out, so measurement is authoritative).

- [ ] **Step 5: Guard the suite and commit**

```bash
npm run test:client -- BootSplash
npx tsc -p client/tsconfig.json --noEmit
git add client/src/styles/global.css
git commit -m "fix(client): clamp boot-splash flap board so it fits narrow viewports"
```

Expected: PASS (or full `npm run test:client` if no BootSplash test file).

---

## Task 7: Give the "Create account" link a 44px hit area (Finding 8)

The login "Create account" link is 95x17 (13.44px font, no vertical padding). Add block padding so its tappable height is ~44px.

**Files:**
- Modify: `client/src/styles/global.css` (`.signin-signup a` near line 2276)

**Interfaces:**
- Owns the `.signin-signup a` rule. No overlap with other tasks.

- [ ] **Step 1: Reproduce the small hit area by measurement**

Log out to reach the login page. `preview_eval` `window.__box('.signin-signup a')`.
Expected: `h` ~17 (the line box, no padding), reproducing Finding 8.

- [ ] **Step 2: Apply the fix**

In `client/src/styles/global.css`, `.signin-signup a` currently reads:

```css
.signin-signup a {
  color: #f9ffe8;
  font-weight: 900;
}
```

Add `display: inline-block;` and block padding so the hit area is ~44px tall (13.44px line box + 2 x 14px = ~44px):

```css
.signin-signup a {
  display: inline-block;
  padding-block: 14px;
  color: #f9ffe8;
  font-weight: 900;
}
```

- [ ] **Step 3: Re-measure to confirm**

Reload the login page. `preview_eval` `window.__box('.signin-signup a')`.
Expected: `h` >= 44.

- [ ] **Step 4: Confirm the login layout still looks right**

`preview_screenshot` the login card at 390x844; confirm the link sits under the Sign In button with comfortable spacing and nothing overlaps. Then:

```bash
npm run test:client -- sign-in
npx tsc -p client/tsconfig.json --noEmit
```

Expected: PASS (or full `npm run test:client` if no matching test file).

- [ ] **Step 5: Commit**

```bash
git add client/src/styles/global.css
git commit -m "fix(client): give login Create account link a 44px hit area"
```

---

## Task 8: Cap and center content on tablet at 768px (Finding 7)

This was the audit's single "optional" finding; the product owner chose to include it. At 768px the app stretches the mobile single-column layout with no dedicated breakpoint, so the tablet is an enlarged phone. The lowest-risk improvement the audit endorses is to cap and center the content width in the 768-1079px band (below the existing 1080px desktop sidebar breakpoint), giving a comfortable measure instead of a full-width stretch. The richer two-column dashboard alternative was deliberately not chosen for this pass (noted below).

**Files:**
- Modify: `client/src/styles/global.css` (add one media query; `.page-frame` already has `width: min(1180px, 100%); margin: 0 auto;` so capping its `max-width` centers it via the existing auto margins)

**Interfaces:**
- Owns the new `@media (min-width: 768px) and (max-width: 899px)` block it adds. Does not alter the base `.page-frame` rule or the >=1080px desktop rules.

- [ ] **Step 1: Reproduce the stretched tablet by measurement**

Navigate to `/dashboard` at 768x1024. `preview_eval` `window.__box('.dashboard-main-column')` and `window.__box('.page-frame')`.
Expected: a single content column roughly 697px wide filling most of the 768 width with no cap, matching the audit.

- [ ] **Step 2: Apply the cap-and-center media query**

In `client/src/styles/global.css`, add a new rule (place it near the other `@media (min-width: ...)` blocks, for example just before the `@media (min-width: 1080px)` block). The band stops at 899px, deliberately below the 900px breakpoint where the transfer and settings pages (`.responsive-grid-sidebar`) switch to a two-column layout inside `.page-frame` - capping those at 680px would cramp them, so the cap applies only to the single-column band:

```css
/* Tablet: cap and center single-column content below the 900px two-column breakpoint so it is not an enlarged phone (audit finding 7). */
@media (min-width: 768px) and (max-width: 899px) {
  .page-frame {
    max-width: 680px;
  }
}
```

`.page-frame` already centers via `margin: 0 auto`, so capping its `max-width` yields symmetric side gutters.

- [ ] **Step 3: Re-measure to confirm the cap**

Reload `/dashboard` at 800x1024. `preview_eval` `window.__box('.page-frame')`.
Expected: `w` ~680 and roughly symmetric left/right gutters. At 767 or narrower the cap must not apply (measure at 760x1024: `.page-frame` returns to full width). At 900+ the cap must not apply either (measure at 960x1024: `.page-frame` returns to full width, and the transfer/settings two-column layout keeps a comfortable measure). At 1080+ the desktop layout must be unchanged.

- [ ] **Step 4: Screenshot the bands**

`preview_screenshot` at 760, 800, 960, and 1280 to confirm: phone layout unchanged below 768, capped-and-centered at 768-899, full width again at 900-1079 (two-column transfer/settings comfortable), desktop two-column at 1080+.

- [ ] **Step 5: Guard the suite and commit**

```bash
npm run test:client
npx tsc -p client/tsconfig.json --noEmit
git add client/src/styles/global.css
git commit -m "fix(client): cap and center content width on tablet breakpoint"
```

Expected: PASS.

> Richer alternative (not implemented here): introduce a real two-column dashboard or a side rail at 768px. That is a larger layout change (Effort M+) touching `.figma-dashboard-grid` and the sidebar visibility rules; defer to a dedicated feature plan if desired.

---

## Task 9: Full regression and before/after proof

Confirm the whole suite is green and capture proof of the fixed screens.

**Files:** none (verification only).

- [ ] **Step 1: Run the full client suite and typecheck**

```bash
npm run test:client
npx tsc -p client/tsconfig.json --noEmit
```

Expected: PASS. (Server tests are unaffected by client CSS, but if you want the CI-equivalent, also run `npx tsc -p server/tsconfig.json --noEmit`.)

- [ ] **Step 2: Re-run the audit's key measurements in one pass**

At 360x800 on `/dashboard`, with both helpers installed, `preview_eval`:

```js
({
  microlabel: window.__contrast('.statement-microlabel').ratio,
  ledgerHead: window.__contrast('.statement-ledger-head > span').ratio,
  navInactive: window.__contrast('.mobile-nav-item:not(.active) span:last-child').ratio,
  noPageScroll: document.documentElement.scrollWidth === document.documentElement.clientWidth,
})
```

Expected: all `ratio` values >= 4.5 and `noPageScroll: true`.

- [ ] **Step 3: Capture before/after screenshots**

`preview_screenshot` the dashboard (statement + bottom nav), the transfer form (currency select), the open chat (close button), and the login page (Create account link), each at 390x844. Attach them to the PR so the reviewer sees the fixes without re-running the harness.

- [ ] **Step 4: Finish the branch**

Use the superpowers:finishing-a-development-branch skill to open the PR (branch `fix/mobile-responsive-audit`). Reference `docs/reviews/2026-07-01-mobile-responsive-audit.md` and list which finding each commit closes.

---

## Self-review

**1. Spec coverage.** Every finding maps to a task:

| Finding | Severity | Task |
|---|---|---|
| 1 - statement muted-label contrast | MEDIUM | Task 1 |
| 2 - bottom-nav "Transactions" truncation | MEDIUM | Task 4 |
| 3 - sub-44px tap targets | MEDIUM | Task 3 |
| 4 - inactive nav-label contrast | MEDIUM | Task 2 |
| 5 - statement right-edge bleed | LOW | Task 5 |
| 6 - boot-splash flap clip | LOW | Task 6 |
| 7 - tablet 768px is an enlarged phone | LOW (optional) | Task 8 |
| 8 - "Create account" link hit area | LOW | Task 7 |

The contrast appendix's "balance caption at risk" note is covered by Task 1 (the caption is `.statement-asof`, included in the fix). No finding is unaddressed.

**2. Placeholder scan.** Every code step shows exact current CSS and exact replacement text with the target selector and value. The one genuinely browser-dependent finding (5) is written as reproduce-measure-fix with a concrete guard plus an explicit "if it still overflows, constrain the ancestor named in Step 1" branch, not a vague TODO.

**3. Type/selector consistency.** Selector names are quoted from the live files: `.statement-microlabel`, `.statement-ledger-head > span`, `.statement-figures span`, `.statement-asof`, `.mobile-nav-item`, `.tr-close`, `.cheque-currency select`, `#transfer-currency`, `.boot-flap-board`, `.boot-flap-cell`, `.boot-flap-char`, `.boot-splash-panel`, `.signin-signup a`, `.dashboard-main-column`, `.page-frame`, `.mobile-nav-item > span:last-child`. The chat header-close is matched by `aria-label="Close chat"` and the send button by `aria-label="Send message"`, both verified present. Finding 2 is a CSS two-line wrap on `.mobile-nav-item > span:last-child` (distinct from Task 2's `.mobile-nav-item` color edit); the chat button edit is in `floating-chat-widget-shadcnui.tsx`. The two contrast tints both resolve to `rgba(23, 61, 66, 0.78)`, computed >= 4.5:1 on their respective backgrounds.

---

## Execution handoff

Plan complete and saved to `docs/superpowers/plans/2026-07-01-mobile-responsive-audit-fixes.md`. Two execution options:

1. **Subagent-Driven (recommended)** - I dispatch a fresh subagent per task, review between tasks, fast iteration.
2. **Inline Execution** - Execute tasks in this session using executing-plans, batch execution with checkpoints.

Which approach?
