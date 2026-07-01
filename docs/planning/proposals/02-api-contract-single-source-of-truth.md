# 02 — Single source of truth for the API contract

**Strength: Strong.** The contract is currently *triplicated* and kept in sync by
hand plus a test; collapsing it to one source removes a whole class of drift bugs.

---

## Thesis

The HTTP contract between server and client exists, today, in at least **three
hand-maintained copies**:

1. **Server runtime + types** — zod schemas in `server/src/routes/*.ts`
   (~38 schema expressions) and the TypeScript types in `server/src/ai/*` etc.
2. **`openapi.yaml`** — a 70 KB spec, currently used **only** to render docs
   (`package.json` → `docs:api` runs `@redocly/cli build-docs`). Nothing
   generates code from it and nothing checks it against the runtime.
3. **Client mirror** — `client/src/lib/types.ts` (713 LOC) re-declares the
   response/request shapes (e.g. `AssistantResponseBlock`,
   `AssistantResponseBlockType`, `responseBlocks?`), and `client/src/lib/validation.ts`
   re-declares the field rules (email/password/phone/amount/reason/DOB) that the
   server already enforces in zod.

The only thing keeping these from drifting is `server/src/ai/tests/aiSafety.test.ts`
(the "client … union stays in sync with state contracts" tests) — i.e. a test
polices a copy-paste invariant that a single source of truth would make
*impossible to violate*.

This is a **shallow seam**: the "interface" (the wire contract) is duplicated, so
every contract change is an N-place edit instead of a one-place edit. The
deepening is one authoritative definition that the other representations are
*generated* from.

## Affected modules

- `openapi.yaml` (root) — candidate source of truth, or a generated artifact.
- `server/src/routes/*.ts` — zod request/response schemas.
- `client/src/lib/types.ts` (713 LOC) — hand-mirrored types.
- `client/src/lib/validation.ts` — hand-mirrored field rules.
- `client/src/lib/api.ts` (468 LOC) — the `api` object; one method per endpoint,
  hand-typed.
- `server/src/ai/tests/aiSafety.test.ts` — the sync-policing tests (some become
  unnecessary once generation removes the duplication).

## Evidence of the friction

- No codegen dependency present: `grep openapi-typescript|openapi-generator|swagger`
  across the manifests → only the Redocly **docs** command.
- No shared workspace package: `client/` imports nothing from `server/`
  (`workspaces: ["server","client"]`, no shared `packages/*`).
- The architecture doc states the contract is "kept in sync by `aiSafety.test.ts`"
  and "the identical contract is mirrored on the client" — duplication is
  documented, not eliminated.

### Deletion test

Delete `client/src/lib/types.ts`. The complexity doesn't vanish — the client
stops compiling, because those shapes are genuinely needed. But they are **not
new information**: every one is a restatement of a server shape. That is the
signature of a copy that should be *generated*, not authored.

## Decision to make (the plan should pick one)

| Approach | Source of truth | How client gets types | Trade-off |
|---|---|---|---|
| **A. OpenAPI-first codegen** | `openapi.yaml` | `openapi-typescript` generates `client/src/lib/api-types.d.ts`; optionally `openapi-fetch` for the client | Keeps the existing 70 KB spec central; must verify the spec matches runtime (add a contract test that validates zod ↔ OpenAPI). Best if the spec is treated as canonical. |
| **B. Code-first, shared package** | zod schemas in a new `packages/contract` (or `server` export) | `z.infer` types imported by the client; `zod-to-openapi` *generates* `openapi.yaml`; client validation reuses the same zod | One source (zod), runtime-validated by construction, docs+types+validation all derived. Requires a shared workspace package the client can import. Recommended. |

Approach **B** is recommended: it makes the runtime validator and the type the
*same artifact*, so they cannot drift, and it also retires the duplicated
`validation.ts` rules. Approach A is lighter if introducing a shared package is
undesirable.

## Target shape (Approach B sketch)

```
packages/contract/                 (new workspace package)
  auth.ts        export const loginSchema = z.object({...});      // ← single def
  transfer.ts    export const transferSchema = z.object({...});
  blocks.ts      export const assistantResponseBlock = z.union([...]);
  index.ts       export type Login = z.infer<typeof loginSchema>; …

server/  imports schemas from @virly/contract for request parsing (unchanged behaviour)
client/  imports z.infer types from @virly/contract  ← deletes most of lib/types.ts
         reuses field schemas in forms              ← deletes lib/validation.ts dup
build:   `zod-to-openapi` emits openapi.yaml         ← docs stay, now generated
```

## Benefits (locality + leverage + tests)

- **One edit per contract change.** Add a field → edit one schema → server
  validation, client type, client validation, and OpenAPI docs all update.
- **Drift becomes impossible**, so the sync-policing tests in `aiSafety.test.ts`
  can shrink to behavioural assertions (the real safety invariants) instead of
  "did someone forget to copy a union member."
- **Validation parity for free.** The client and server enforce the *same* rules
  because they import the *same* schema — no more "client says max 8, server says
  max 12."
- **Leverage for every future endpoint/block/tool**: brief 03, 04, and 05 all add
  to the contract; with an SSOT each becomes a one-place change.

## Before / After

```
BEFORE — triplicated, hand-synced
  server zod  ──┐
  openapi.yaml ─┼─ three independent restatements, kept aligned by aiSafety.test.ts
  client types ─┘   (+ client validation.ts re-implements the field rules)

AFTER (Approach B) — one definition, everything derived
            @virly/contract (zod schemas)
            ├─ server: request validation         (import)
            ├─ client: types via z.infer          (import → lib/types.ts shrinks)
            ├─ client: form validation            (import → lib/validation.ts dup removed)
            └─ openapi.yaml                        (generated by zod-to-openapi)
```

## Implementation outline (for the planning agent)

1. **Pick A or B** and record it (an ADR is warranted — this is a load-bearing
   decision). If B, scaffold `packages/contract` and add it to root `workspaces`.
2. **Migrate one slice end-to-end first** (e.g. auth): move its schemas to the
   source of truth, switch server + client to import them, delete the client
   copies, regenerate OpenAPI, confirm `aiSafety`/contract tests still pass.
3. **Migrate the assistant block/tool unions** (the largest and most drift-prone
   surface — coordinate with brief 05).
4. **Roll the rest** endpoint by endpoint.
5. **Add a CI check** that the generated artifact (OpenAPI for B, or types for A)
   is up to date (`--check`/diff), so the SSOT can't silently rot.
6. **Prune** the now-redundant sync tests in `aiSafety.test.ts`, keeping the
   genuine safety assertions.

## Risks / constraints

- **The assistant safety tests are doing two jobs** — policing contract sync *and*
  asserting real safety invariants (no money tool, refusal behaviour, etc.).
  Only remove the *sync-policing* parts; keep the safety parts.
- A shared package (B) means the client build now depends on a workspace package;
  verify Vite/tsconfig path resolution and the deploy (Vercel) build picks it up.
- Generation must run in CI as a gate, or the SSOT degrades back into "yet another
  copy that happens to be generated once."

## Definition of done

- `client/src/lib/types.ts` no longer hand-declares shapes that exist server-side;
  client field validation imports shared rules.
- A single command regenerates the derived artifacts; CI fails if they're stale.
- Adding a field or block type is demonstrably a one-file change.

## Out of scope / related

- Brief **05** (block registry) is the highest-value consumer of this SSOT; do
  them together if possible (the block union is the worst current duplication).
- This does not change *transport* (still REST + SSE) or auth (ADR-0005).
