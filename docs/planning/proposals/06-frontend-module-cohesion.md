# 06 — Frontend module cohesion

**Strength: Worth exploring.** Independent of the others; can be picked up any
time. Mostly low-risk moves + dead-code removal, with one judgment call (the
`lib/` split).

---

## Thesis

The client's shared layers are **low-cohesion grab-bags** — the dependency graph
flagged three of them by name (cohesion ≈ 0.05): "Client UI Utilities", "Client
API & Auth Layer", "Client Pages & Primitives". Concretely:

1. **`components/ui/` mixes two different things.** The shadcn convention reserves
   `ui/` for small, reusable, app-agnostic primitives. Here it holds genuine
   primitives (`button.tsx` 54 LOC, `avatar.tsx` 48, `select.tsx` 148,
   `menu.tsx` 180) **alongside** large bespoke *feature* components that were
   filed here by accident of origin: `floating-chat-widget-shadcnui.tsx` (989),
   `bento-card.tsx` (473), `sign-in-card-2.tsx` (379), `shader-background.tsx`
   (293). A reader can't tell "shared primitive" from "one feature's component."

2. **Dead vendored components.** Three large files have **zero importers**:
   `bento-card.tsx` (473 LOC), `order-confirmation-card.tsx` (122),
   `floating-chat-widget-demo.tsx` (9) — vendored/demo leftovers carrying weight
   and misleading navigation. (The graph's "600 isolated nodes" and the
   design-sync "usage-driven component scope" note point at the same thing.)

3. **`lib/` is a 10-module catch-all** spanning unrelated concerns: a transport
   seam (`api.ts`, 468 LOC), the god contract file (`types.ts`, 713 LOC, fan-in
   23 — see brief 02), pure formatters (`format.ts`, `amount-words.ts`,
   `currency.ts`), and domain helpers (`contacts.ts`, `user-avatar.ts`,
   `validation.ts`). "Where does X live?" has no principled answer.

None of these is a deep module: each is a folder/file whose *interface* (what you
import) is as sprawling as its *implementation*. The deepening is cohesive
boundaries — primitives vs feature components, transport vs types vs utils —
each a module you can hold in your head.

## Affected modules

- `client/src/components/ui/*` — separate primitives from bespoke feature
  components; remove dead ones.
- `client/src/lib/*` — split by concern.
- `client/src/features/*` — destination for relocated feature components
  (`assistant/` or `transfer/` for the chat widget; `auth/` for the sign-in card).
- `client/.ds-entry.tsx` — the **design-sync barrel** ("24 in-use components");
  must be checked/updated before deleting or moving anything (it defines the
  usage-driven component scope).

## Evidence of the friction

- `components/ui/` size spread: 989 / 473 / 379 / 293 LOC bespoke components next
  to 9–180 LOC primitives.
- Dead components (importers outside their own file): `bento-card` **0**,
  `order-confirmation-card` **0**, `floating-chat-widget-demo` **0**;
  `shader-background` **1**, `sign-in-card-2` **2**, `floating-chat-widget-shadcnui`
  **2**.
- `lib/` fan-in is bimodal: `types` 23, `api` 14, `utils` 10, `format` 8 (core)
  vs `amount-words` 1, `contacts`/`user-avatar` 3 (niche) — a sign the folder
  groups by "it's a .ts in lib" rather than by purpose.

### Deletion test

- Delete `bento-card.tsx` (473 LOC, 0 importers): complexity *vanishes* — pure
  pass-through dead weight. **Delete it** (after confirming it isn't in
  `.ds-entry.tsx`). Same for `order-confirmation-card.tsx`,
  `floating-chat-widget-demo.tsx`.
- Delete `lib/format.ts`: complexity reappears across the 8 importers (real,
  earning its keep) — but it has *nothing* to do with `lib/api.ts`'s transport
  concern. They don't belong in the same module; cohesion, not deletion, is the
  issue.

## Target shape

```
client/src/
  components/
    ui/            ← ONLY shared primitives (button, avatar, select, menu, …)
    backdrop/      ← shader-background (visual chrome, not a "ui primitive")
  features/
    assistant/     ← floating chat widget lives with the feature it serves
    auth/          ← sign-in card lives with auth
  lib/
    api/           ← transport seam: client, SSE parsing, setUnauthorizedHandler,
                     supportsAiChatStreaming  (was api.ts; auth/transport only)
    format/        ← pure formatters: money, dates, amount-words, currency glyphs
    domain/        ← contacts, user-avatar (app-specific helpers)
    contract types → from the SSOT (brief 02), not a 713-LOC lib/types.ts
  (validation.ts → folded into the shared schemas of brief 02)
```

The guiding rule: `ui/` = app-agnostic primitive you'd copy to another project;
`features/<x>/` = belongs to one feature; `lib/<concern>/` = cross-feature logic
grouped by *what it does*, not by *being in lib*.

## Benefits (locality + leverage + tests)

- **Locality.** Everything for one feature (the chat widget and its pieces) lives
  under that feature; a primitive change is obviously app-wide, a feature change
  obviously isn't.
- **Smaller, testable units.** The existing no-jsdom `renderToStaticMarkup`
  harness (see the team's client-test-harness convention) is happiest with small
  hook-light components; relocating/splitting the 989-LOC widget makes more of it
  reachable by that harness.
- **Less to read.** Removing ~600 LOC of dead components and clarifying `ui/`
  immediately improves human and AI navigation; the dependency graph's
  low-cohesion clusters break up.
- **Leverage with brief 02/05.** Once `types.ts` and `validation.ts` move to the
  contract SSOT and the block renderers move to a registry, `lib/` and `ui/` are
  left genuinely cohesive.

## Before / After

```
BEFORE
  components/ui/  [button 54] [avatar 48] … [floating-chat-widget 989]
                 [bento-card 473 DEAD] [order-confirmation 122 DEAD] [demo 9 DEAD]
                 (primitives + feature comps + dead vendored, all mixed)
  lib/  api(468) types(713) utils format currency validation contacts
        amount-words user-avatar route-transition   ← one bag, many concerns

AFTER
  components/ui/        primitives only
  components/backdrop/  shader-background
  features/assistant/   chat widget (+ split into pieces)
  features/auth/        sign-in card
  lib/api/ lib/format/ lib/domain/   cohesive, purpose-named
  (types + validation → contract SSOT; dead components deleted)
```

## Implementation outline (for the planning agent)

1. **Confirm and remove dead code first** (smallest, safest win): verify
   `bento-card`, `order-confirmation-card`, `floating-chat-widget-demo` are absent
   from `.ds-entry.tsx` and any dynamic import, then delete. Re-run the client
   build + tests.
2. **Relocate bespoke components out of `ui/`** into their owning feature (chat
   widget → `features/assistant/`, sign-in card → `features/auth/`,
   shader-background → `components/backdrop/`); update imports. Pure moves.
3. **Split `lib/`** into `api/`, `format/`, `domain/` (and let `types`/`validation`
   be handled by brief 02). Update import paths; consider a tsconfig path alias to
   keep call sites tidy.
4. **Optionally split the 989-LOC chat widget** into smaller components once it
   lives under its feature (composer, message list, status, confirmation surface)
   so more of it is unit-testable.

## Risks / constraints

- **Design-sync coupling.** `.ds-entry.tsx` defines the "24 in-use components"
  scope for the claude.ai/design sync; moving/deleting a component without
  updating the barrel could break that workflow. Treat the barrel as the source of
  truth for "is this component in scope" and update it in the same change.
- Mostly import-path churn; do it in small PRs (dead-code, then relocations, then
  `lib/` split) so reviews stay mechanical.
- Coordinate with brief 02 (types/validation) and 05 (block renderers) so you're
  not moving files those briefs are about to restructure — ideally sequence
  02/05 before the `lib/`/renderer parts of this one.

## Definition of done

- `components/ui/` contains only shared primitives; no four-figure-LOC files there.
- Zero unused component files (confirmed against `.ds-entry.tsx` + a usage scan).
- `lib/` modules are grouped by concern; "where does this belong?" has a clear
  answer.
- Client build + tests green; `.ds-entry.tsx` reflects any moves.

## Out of scope / related

- **02** — owns `types.ts` and `validation.ts` (the contract); this brief defers
  those to it.
- **05** — owns the block renderer split inside `AssistantBlocks.tsx`; this brief
  covers the *rest* of the client structure.
