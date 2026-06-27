# 01 — Dependency injection for data access

**Strength: Strong.** Low risk, high leverage, and it makes every other brief
easier to test. Compatible with ADR-0004 (does **not** reopen the seam).

---

## Thesis

The repository *interface* is a deep seam (ADR-0004). But the way consumers
*reach* that seam is a **global mutable singleton**: `setRepositories()` is called
once at boot, and 92 call sites scattered across services and AI tools reach into
the global with `getRepositories()`. That singleton is the exact "global mutable
state" anti-pattern the project's own `.claude/rules/antipatterns.md` warns
against ("causes testing and concurrency issues — use dependency injection").

Replacing the global grab with **explicit injection** turns each service/tool
into a deep module whose interface *is* its test surface: you construct it with
the repositories it needs, and that's the whole contract.

## Affected modules

- `server/src/repositories/index.ts` — the singleton (`let instance`,
  `setRepositories`, `clearRepositories`, `getRepositories`).
- `server/src/services/*.ts` — all 13 services. Today they are object literals
  that call `getRepositories()` inline, e.g. `transactionQuery.service.ts`:
  ```ts
  export const transactionQueryService = {
    async listForOwner(input) {
      return getRepositories().transactions.listForOwner(input); // global grab
    },
    // ...
  };
  ```
- `server/src/ai/tools/*.ts` (the 24 v1 executors) and
  `server/src/ai/v2/tools/*.ts` — these grab `getRepositories()` directly too
  (e.g. `ai/tools/getAccountBalance.ts:8` →
  `getRepositories().users.findById(...)`). (See also brief 04, which routes
  these through a shared query module — DI is the foundation that makes that
  clean.)
- `server/src/app.ts` / boot entry — where `setRepositories(createRepositories(driver))`
  is wired today; becomes the **composition root**.

## Evidence of the friction

- `grep -rn "getRepositories()" server/src` → **92** call sites.
- `grep -rn "setRepositories(" server/src` → **31** (almost all in tests:
  every test that touches data must `setRepositories(...)` in `beforeEach` and
  `clearRepositories()` after — global setup/teardown instead of local construction).
- The singleton throws `"Repositories not initialised"` at runtime if a code path
  is exercised before boot wiring — a failure mode that only exists *because* the
  dependency is implicit.

### Deletion test

Delete `repositories/index.ts` (the singleton). Complexity does **not** vanish —
it *reappears* at every call site, which now has to obtain repositories somehow.
That means the singleton is load-bearing as a *locator*, but it is the wrong kind
of load-bearing: it hides a dependency that every consumer genuinely has. The fix
is not to delete the seam (ADR-0004 keeps it) but to make the dependency
**explicit and passed in**, so the locator disappears and the dependency becomes
part of each module's interface.

## Target shape

Each service becomes a **factory** that closes over its dependencies:

```ts
// services/transactionQuery.service.ts
export function createTransactionQueryService(repos: Repositories) {
  return {
    listForOwner: (input) => repos.transactions.listForOwner(input),
    getRelationshipStats: (input) => repos.transactions.getRelationshipStats(input),
    recentWithCounterparty: (input) => repos.transactions.recentWithCounterparty(input),
  };
}
export type TransactionQueryService = ReturnType<typeof createTransactionQueryService>;
```

A single **composition root** (called once at boot) builds the repositories and
every service from them, and hands the assembled object to the route layer:

```ts
// e.g. server/src/container.ts (new)
export function createContainer(driver: "mongo" | "postgres") {
  const repos = createRepositories(driver);           // ADR-0004 factory, unchanged
  return {
    repos,
    transactionQuery: createTransactionQueryService(repos),
    account: createAccountService(repos),
    auth: createAuthService(repos, /* clock, hasher, … */),
    // …one line per service
  };
}
export type Container = ReturnType<typeof createContainer>;
```

Routes receive their services instead of importing singletons. Two clean options
(pick one in the plan):

1. **Express locals** — `app.set("container", container)`; route handlers read
   `req.app.get("container")`. Smallest diff, keeps route files thin.
2. **Route factories** — `createAiRoutes(container)` returns the `Router`. More
   explicit, slightly larger diff, best testability.

The AI graph already threads a `ToolContext`; extend it (or its construction) to
carry the query module / repos so tools stop reaching the global (dovetails with
brief 04).

## Benefits (locality + leverage + tests)

- **The interface becomes the test surface.** A service test becomes
  `createTransactionQueryService(fakeRepos)` — construct with a stub, call, assert.
  No global `setRepositories`/`clearRepositories`, no shared mutable state between
  tests, no ordering coupling. Parallel test execution becomes safe.
- **Locality of wiring.** Every dependency is decided in *one* composition root
  instead of being implicit at 92 sites. "What does this service need?" is
  answered by its factory signature, not by reading its whole body for
  `getRepositories()` calls.
- **Concurrency-safe by construction.** No process-global mutable cell that a
  second driver/tenant/test could stomp.
- **AI-navigability.** An agent can read a factory signature and know the full
  dependency set; today it must trace global access.

## Before / After

```
BEFORE — implicit global locator
                                   ┌─────────────────────────────┐
  boot ── setRepositories(repos) ─►│  module-global `instance`    │
                                   └─────────────┬───────────────┘
                                                 │ getRepositories()  (×92)
        services ───────────────────────────────┤
        ai/tools (v1) ──────────────────────────┤   hidden dependency,
        ai/v2/tools ────────────────────────────┘   throws if unset

AFTER — explicit injection (one composition root)
  boot ─► createContainer(driver)
            ├─ repos = createRepositories(driver)      (ADR-0004, unchanged)
            ├─ createTransactionQueryService(repos)
            ├─ createAccountService(repos)
            └─ … ──► routes (req.app locals OR route factories) ──► handlers
          tools receive repos via ToolContext (see brief 04)
```

## Implementation outline (for the planning agent)

1. **Introduce factories without removing the singleton** (keep both green).
   Convert each service object literal to `createXService(deps)` and re-export a
   default instance built from `getRepositories()` so nothing breaks yet.
2. **Add the composition root** (`container.ts`) and wire it at boot.
3. **Migrate route layer** to consume the container (choose locals vs factories);
   update route tests to construct routes with a stub container.
4. **Migrate AI tools** to receive repos via `ToolContext` (coordinate with brief
   04 if doing both).
5. **Delete the singleton** (`getRepositories`/`setRepositories`/`clearRepositories`)
   once no call sites remain; update tests to local construction.
6. Keep the `no-direct-model-imports` guard test green throughout (this change
   never touches model imports — only how repositories are obtained).

Ship incrementally: one service + its routes + its tests per PR.

## Risks / constraints

- **Do not weaken ADR-0004.** The `Repositories` interface, the `mongo/` and
  `postgres/` implementations, `createRepositories(driver)`, and the
  `no-direct-model-imports` guard all stay exactly as they are. This brief only
  changes *how a consumer obtains* a `Repositories`, not its shape.
- **`TxContext` threading.** Transactional flows (transfers) already pass an
  opaque tx handle; make sure injected services still thread it (no behaviour
  change, just plumbed through the factory rather than the global).
- Large but mechanical diff; the staged approach (singleton and factories
  coexisting) keeps every step shippable and reviewable.

## Definition of done

- `grep -rn "getRepositories()" server/src` → **0** outside the composition root.
- Service/tool tests construct their subject with a stub and use **no** global
  repository setup/teardown.
- `no-direct-model-imports.test.ts` and the dual-driver contract suite still pass.

## Out of scope / related

- Brief **04** (shared assistant query core) is the natural companion: once tools
  receive repos via injection, collapsing v1/v2 query duplication is clean.
- `config` is the *other* global read directly across the server. Folding it into
  the container is a reasonable extension but is **not required** for this brief —
  keep the first cut focused on data access.
