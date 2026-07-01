# Jest Migration & Repo-Wide Unit Coverage Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking. The bulk conversion/authoring phases (B and C) are explicitly designed to fan out across **parallel subagents** (superpowers:dispatching-parallel-agents).

**Goal:** Stand up Jest as the single test runner for the repo, convert all ~95 existing `node:test` suites to Jest, and author new Jest unit tests for every logic-bearing source file that lacks coverage (~200 files), placing each test in a `__tests__/` directory one level deeper than the file it tests.

**Architecture:** Two Jest configs (one per npm workspace: `server`, `client`), both running in **native-ESM mode** (`NODE_OPTIONS=--experimental-vm-modules` + `extensionsToTreatAsEsm`) so the codebase's `import.meta.url` / `import.meta.dirname` / `import.meta.env?.` keep working with no source changes. Transform via **@swc/jest** (no type-checking at test time; CI keeps a separate `tsc --noEmit` gate). Tests use **injected Jest globals** (`describe`/`it`/`expect`) — the conversion just drops the `node:test`/`node:assert` imports and rewrites assertions. The client stays on `renderToStaticMarkup` under `testEnvironment: "node"` (no jsdom). `tsx --test` is removed entirely.

**Tech Stack:** Node 22, TypeScript 5.6 (ESM / NodeNext server, Vite/Bundler client), Jest 29, @swc/jest + @swc/core, React 18 (`renderToStaticMarkup`), npm workspaces.

## Global Constraints

- **No emojis** anywhere (code, comments, commit messages, PR text) — project rule (`.claude/CLAUDE.md`).
- **Branch first:** commits on `main` are blocked. All work happens on a single feature branch `test/jest-migration-and-coverage`.
- **Test location convention:** every test lives in a `__tests__/` directory one level deeper than the file/module it tests (already the repo norm). Name: `<sourceBasename>.test.ts` / `.test.tsx`. Contract tests stay under `server/tests/contract/`.
- **Native ESM only:** never down-level modules to CommonJS in the swc transform (`module.type: "es6"`) — `import.meta` must survive.
- **No `jest.mock()` of local ESM modules** in new tests where avoidable: prefer the repo's existing dependency-injection seams (`setRepositories(...)`, explicit stub args). ESM module mocking under `--experimental-vm-modules` is unreliable; the existing suites already use hand-rolled stubs.
- **Coverage scope:** author tests for every file containing executable logic. Skip pure type-only files (`export type`/`interface` only) and pure barrel/re-export `index.ts` files. Composition-root/entry files (`server/src/index.ts`, `client/src/main.tsx`, `server/src/app.ts`'s wiring) get a minimal smoke test only if they expose a testable unit; otherwise skip with a one-line note.
- **Determinism:** no real network, DB, or filesystem writes in unit tests. Contract tests (Postgres-backed) remain serial and self-skip without their `CONTRACT_*` env vars.

---

## File Structure

New/modified infrastructure files:

- Create: `server/jest.config.mjs` — unit test config (roots: `src`).
- Create: `server/jest.contract.config.mjs` — Postgres contract config (roots: `tests/contract`, serial).
- Create: `client/jest.config.mjs` — client config (node env, `@/*` alias, tsx).
- Modify: `server/package.json` — devDeps + `test` / `test:contract` scripts.
- Modify: `client/package.json` — devDeps + `test` script.
- Modify: `package.json` (root) — `test:client` / `test:server` scripts delegate to workspaces.
- Modify: `server/tsconfig.json` — add `"jest"` to `compilerOptions.types` so `tsc --noEmit` accepts Jest globals in `src/**/__tests__`.
- Modify: `client/tsconfig.json` — already excludes `src/**/__tests__`; add `@types/jest` for editor support (no tsconfig include change required).
- Modify: `.github/workflows/ci.yml` — run Jest instead of `tsx --test`; add client tests to CI.
- Create (temp, dev-only): `scripts/test-inventory.mjs` — regenerates the untested-file inventory for Phase C.

Test files: ~95 converted in place; ~200 new files added under the existing `__tests__/` convention.

---

## Phase A — Jest Infrastructure (must be exact; validated by a pilot)

### Task A1: Create the branch

- [ ] **Step 1: Create and switch to the feature branch**

```bash
git checkout main
git pull --ff-only
git checkout -b test/jest-migration-and-coverage
```

- [ ] **Step 2: Confirm clean tree on the new branch**

Run: `git status --short`
Expected: no output (clean), branch is `test/jest-migration-and-coverage`.

---

### Task A2: Install Jest toolchain (server + client)

**Files:**
- Modify: `server/package.json` (devDependencies)
- Modify: `client/package.json` (devDependencies)

- [ ] **Step 1: Add server devDependencies**

```bash
npm install --workspace server --save-dev \
  jest@^29.7.0 @swc/jest@^0.2.37 @swc/core@^1.10.0 @types/jest@^29.5.14
```

- [ ] **Step 2: Add client devDependencies**

```bash
npm install --workspace client --save-dev \
  jest@^29.7.0 @swc/jest@^0.2.37 @swc/core@^1.10.0 @types/jest@^29.5.14
```

- [ ] **Step 3: Verify the jest binary resolves**

Run: `npx --workspace server jest --version`
Expected: prints `29.x`.

- [ ] **Step 4: Commit**

```bash
git add server/package.json client/package.json package-lock.json
git commit -m "build: add jest + @swc/jest toolchain to server and client"
```

---

### Task A3: Write the server unit Jest config

**Files:**
- Create: `server/jest.config.mjs`

**Interfaces:**
- Produces: a config consumed by `npm test --workspace server`; matches `src/**/__tests__/**/*.test.ts`.

- [ ] **Step 1: Create `server/jest.config.mjs`**

```js
// Native-ESM Jest for the server workspace. Run with
// NODE_OPTIONS=--experimental-vm-modules (set in package.json scripts).
/** @type {import('jest').Config} */
export default {
  testEnvironment: "node",
  roots: ["<rootDir>/src"],
  testMatch: ["**/__tests__/**/*.test.ts"],
  // Source imports use NodeNext ".js" specifiers; map them back to TS source.
  moduleNameMapper: {
    "^(\\.{1,2}/.*)\\.js$": "$1",
  },
  extensionsToTreatAsEsm: [".ts"],
  transform: {
    "^.+\\.ts$": [
      "@swc/jest",
      {
        jsc: { parser: { syntax: "typescript" }, target: "es2022" },
        // Keep ES modules so import.meta.url / import.meta.dirname survive.
        module: { type: "es6" },
      },
    ],
  },
  // @langchain/* and other ESM-only deps must be transformed, not ignored.
  // Start permissive; tighten in A6 if a CJS dep complains.
  transformIgnorePatterns: ["/node_modules/(?!(@langchain|langsmith|nanoid|uuid)/)"],
  clearMocks: true,
};
```

- [ ] **Step 2: Commit**

```bash
git add server/jest.config.mjs
git commit -m "build: add server jest config (native esm, swc)"
```

---

### Task A4: Write the server contract Jest config

**Files:**
- Create: `server/jest.contract.config.mjs`

**Interfaces:**
- Consumes: the base settings from A3 (duplicated, not imported, to keep configs standalone).
- Produces: a serial config for `npm run test:contract --workspace server`; matches `tests/contract/**/*.test.ts`.

- [ ] **Step 1: Create `server/jest.contract.config.mjs`**

```js
// Postgres-backed contract suites. Serial (one shared DB); self-skip without
// CONTRACT_PG_URL / CONTRACT_VECTOR_URL / CONTRACT_MONGO_URL.
/** @type {import('jest').Config} */
export default {
  testEnvironment: "node",
  roots: ["<rootDir>/tests/contract"],
  testMatch: ["**/*.test.ts"],
  moduleNameMapper: {
    "^(\\.{1,2}/.*)\\.js$": "$1",
  },
  extensionsToTreatAsEsm: [".ts"],
  transform: {
    "^.+\\.ts$": [
      "@swc/jest",
      {
        jsc: { parser: { syntax: "typescript" }, target: "es2022" },
        module: { type: "es6" },
      },
    ],
  },
  transformIgnorePatterns: ["/node_modules/(?!(@langchain|langsmith|nanoid|uuid)/)"],
  maxWorkers: 1,
  clearMocks: true,
};
```

- [ ] **Step 2: Commit**

```bash
git add server/jest.contract.config.mjs
git commit -m "build: add server contract jest config (serial, esm)"
```

---

### Task A5: Write the client Jest config

**Files:**
- Create: `client/jest.config.mjs`

**Interfaces:**
- Produces: config consumed by `npm test --workspace client`; matches `src/**/__tests__/**/*.test.tsx` and `.test.ts`. Resolves the `@/*` alias.

- [ ] **Step 1: Create `client/jest.config.mjs`**

```js
// Native-ESM Jest for the client. testEnvironment "node" keeps the existing
// renderToStaticMarkup approach (no jsdom). import.meta.env?.* degrades to
// undefined here, which the source already handles via optional chaining.
/** @type {import('jest').Config} */
export default {
  testEnvironment: "node",
  roots: ["<rootDir>/src"],
  testMatch: ["**/__tests__/**/*.test.tsx", "**/__tests__/**/*.test.ts"],
  moduleNameMapper: {
    "^@/(.*)$": "<rootDir>/src/$1",
    "^(\\.{1,2}/.*)\\.js$": "$1",
  },
  extensionsToTreatAsEsm: [".ts", ".tsx"],
  transform: {
    "^.+\\.tsx?$": [
      "@swc/jest",
      {
        jsc: {
          parser: { syntax: "typescript", tsx: true },
          transform: { react: { runtime: "automatic" } },
          target: "es2020",
        },
        module: { type: "es6" },
      },
    ],
  },
  transformIgnorePatterns: ["/node_modules/(?!(framer-motion|motion|lucide-react)/)"],
  clearMocks: true,
};
```

- [ ] **Step 2: Commit**

```bash
git add client/jest.config.mjs
git commit -m "build: add client jest config (native esm, node env, swc)"
```

---

### Task A6: Wire npm scripts and validate the config against a PILOT converted test

This is the **infra validation loop**. Do not proceed to Phase B until a real converted suite is green under Jest. Treat config bugs surfaced here (transformIgnorePatterns, moduleNameMapper, ESM interop) as the work of this task.

**Files:**
- Modify: `server/package.json` (scripts), `client/package.json` (scripts), `package.json` (root scripts)
- Modify (pilot conversion): `server/src/ai/__tests__/amountExpr.test.ts` (a pure-logic suite, no DB)
- Modify (pilot conversion): `client/src/components/__tests__/bootSplash.test.tsx`

- [ ] **Step 1: Update `server/package.json` scripts**

Replace the `test` and `test:contract` scripts:

```json
"test": "NODE_OPTIONS=--experimental-vm-modules jest",
"test:contract": "NODE_OPTIONS=--experimental-vm-modules jest --config jest.contract.config.mjs"
```

- [ ] **Step 2: Update `client/package.json` scripts**

Add a `test` script:

```json
"test": "NODE_OPTIONS=--experimental-vm-modules jest"
```

- [ ] **Step 3: Update root `package.json` scripts**

Replace `test:client` / `test:server` so they delegate to the workspaces, and add an aggregate `test`:

```json
"test": "npm test --workspace server && npm test --workspace client",
"test:server": "npm test --workspace server",
"test:client": "npm test --workspace client"
```

- [ ] **Step 4: Convert the server pilot `amountExpr.test.ts` to Jest**

Apply the conversion mapping from Phase B (Task B1) to this one file: delete the `import test from "node:test"` and `import assert from "node:assert/strict"` lines; rewrite each `assert.*` per the mapping table; `test(...)` stays (Jest global). Keep everything else identical.

- [ ] **Step 5: Run the server pilot**

Run: `npm test --workspace server -- src/ai/__tests__/amountExpr.test.ts`
Expected: the suite runs under Jest and PASSES. If you hit `Cannot use import statement` / ESM interop / "Jest encountered an unexpected token" from a `node_modules` dep, add that package to the negative lookahead in `transformIgnorePatterns` and re-run. If a `.js` specifier fails to resolve, confirm the `moduleNameMapper` regex. Iterate until green.

- [ ] **Step 6: Convert and run the client pilot**

Convert `client/src/components/__tests__/bootSplash.test.tsx` (drop `node:test`/`node:assert/strict` imports; `assert.match(html, re)` -> `expect(html).toMatch(re)`; `assert.ok(cells >= 12, msg)` -> `expect(cells).toBeGreaterThanOrEqual(12)`).
Run: `npm test --workspace client -- src/components/__tests__/bootSplash.test.tsx`
Expected: PASSES.

- [ ] **Step 7: Update `server/tsconfig.json` types and verify typecheck still passes**

Change `"types": ["node"]` to `"types": ["node", "jest"]` so `tsc --noEmit` (which `include`s `src`, and thus the test files) accepts `describe`/`it`/`expect`.
Run: `npx tsc -p server/tsconfig.json --noEmit`
Expected: no errors (the two pilot files now reference Jest globals, which resolve via `@types/jest`).

- [ ] **Step 8: Commit the validated infrastructure**

```bash
git add server/package.json client/package.json package.json server/tsconfig.json \
  server/src/ai/__tests__/amountExpr.test.ts \
  client/src/components/__tests__/bootSplash.test.tsx
git commit -m "build: wire jest npm scripts; validate config with pilot conversions"
```

---

## Phase B — Convert all existing `node:test` suites to Jest (parallel)

~95 files. Mechanical and high-confidence. Dispatch one subagent per directory group below; each agent converts its files following the **exact mapping table**, runs the converted suites, and commits its group. Pilot files from A6 are already done.

### Task B1: The canonical conversion mapping (reference for all B agents)

This task adds no code; it is the spec every B agent follows. Conversion rules:

**Imports — delete these lines:**
- `import test from "node:test";`  / `import { test, describe, ... } from "node:test";`
- `import assert from "node:assert/strict";` / `import assert from "node:assert";`

Do **not** add any Jest import — `describe`, `it`, `test`, `expect`, `beforeEach`, `afterEach`, `jest` are injected globals.

**Test structure — keep as-is:** `test("name", async () => { ... })` and `describe(...)` are valid Jest. `test.skip` / conditional `(cond ? test : test.skip)` stay valid.

**Assertions — rewrite (note: source imports `node:assert/strict`, so `equal`/`deepEqual` are STRICT):**

| node:assert (strict)                | Jest                                                |
|-------------------------------------|-----------------------------------------------------|
| `assert.equal(a, b)`                | `expect(a).toBe(b)` (primitives); `expect(a).toStrictEqual(b)` if `b` is an object/array |
| `assert.strictEqual(a, b)`          | `expect(a).toBe(b)`                                 |
| `assert.notEqual(a, b)`             | `expect(a).not.toBe(b)`                             |
| `assert.notStrictEqual(a, b)`       | `expect(a).not.toBe(b)`                             |
| `assert.deepEqual(a, b)`            | `expect(a).toStrictEqual(b)`                        |
| `assert.notDeepEqual(a, b)`         | `expect(a).not.toStrictEqual(b)`                    |
| `assert.ok(x)` / `assert(x)`        | `expect(x).toBeTruthy()`                            |
| `assert.ok(x, "msg")`               | `expect(x).toBeTruthy()` (drop msg, or use a focused matcher like `toBeGreaterThanOrEqual` when the expression is a comparison) |
| `assert.match(str, re)`             | `expect(str).toMatch(re)`                           |
| `assert.doesNotMatch(str, re)`      | `expect(str).not.toMatch(re)`                       |
| `assert.throws(fn)`                 | `expect(fn).toThrow()`                              |
| `assert.throws(fn, /re/)`           | `expect(fn).toThrow(/re/)`                          |
| `assert.doesNotThrow(fn)`           | `expect(fn).not.toThrow()`                          |
| `await assert.rejects(p)`           | `await expect(p).rejects.toThrow()`                 |
| `await assert.rejects(p, /re/)`     | `await expect(p).rejects.toThrow(/re/)`             |
| `assert.deepStrictEqual(a, b)`      | `expect(a).toStrictEqual(b)`                        |

**Edge cases:**
- `assert.ok(x >= 12, msg)` and similar comparisons -> prefer the precise matcher: `expect(x).toBeGreaterThanOrEqual(12)`.
- `assert.equal(typeof x, "function")` -> `expect(typeof x).toBe("function")`.
- If a file uses node's `mock` API (survey said 0 server files, verify per-file): `mock.fn()` -> `jest.fn()`; `mock.method(obj,"m",impl)` -> `jest.spyOn(obj,"m").mockImplementation(impl)`; reset in `afterEach(() => jest.restoreAllMocks())`.
- Preserve any conditional-skip logic (contract tests): `node:test` `{ skip }` option or early `return` -> Jest `(cond ? describe : describe.skip)(...)` or guard with `if (!url) { it.skip(...); return; }`.

**Per-file loop (every B agent, every file):**
1. Read file. 2. Apply mapping. 3. Run `npm test --workspace <ws> -- <relativePath>`. 4. Fix until green. 5. Move to next file. 6. Commit the group.

### Task B2: Convert server `services` + root `src/__tests__` suites

**Files (convert in place):**
- `server/src/services/__tests__/*.test.ts` (account, aiPendingTransfer, auth, email, fx, personalDetails, transactionQuery, transfer, videoSession)
- `server/src/__tests__/*.test.ts` (authCookie, config.dbDriver, db.boot)

- [ ] **Step 1: Convert each file per the B1 mapping**
- [ ] **Step 2: Run the group**

Run: `npm test --workspace server -- src/services src/__tests__`
Expected: all suites PASS.

- [ ] **Step 3: Commit**

```bash
git add server/src/services/__tests__ server/src/__tests__
git commit -m "test: convert server services + root suites from node:test to jest"
```

### Task B3: Convert server `ai` suites (non-v2)

**Files:** `server/src/ai/__tests__/*.test.ts`, `server/src/ai/rag/**/__tests__/*.test.ts`, `server/src/ai/evals/v2/__tests__/*.test.ts`

- [ ] **Step 1: Convert per B1 mapping**
- [ ] **Step 2:** Run `npm test --workspace server -- src/ai/__tests__ src/ai/rag src/ai/evals` -> Expected: PASS
- [ ] **Step 3:** `git add server/src/ai && git commit -m "test: convert server ai suites to jest"`

### Task B4: Convert server `ai/v2` suites

**Files:** `server/src/ai/v2/**/__tests__/*.test.ts` (hitl, messages, persona, prompt, streamEvents, memory/*, nodes/*, tools/*)

- [ ] **Step 1:** Convert per B1 mapping
- [ ] **Step 2:** Run `npm test --workspace server -- src/ai/v2` -> Expected: PASS
- [ ] **Step 3:** `git add server/src/ai/v2 && git commit -m "test: convert server ai/v2 suites to jest"`

### Task B5: Convert server `repositories` + `db` + `routes` + `realtime` + `fraud` + `mcp` + `ttl` suites

**Files:** `server/src/repositories/**/__tests__/*.test.ts`, `server/src/db/__tests__/*.test.ts`, `server/src/routes/__tests__/*.test.ts`, `server/src/realtime/__tests__/*.test.ts`, `server/src/fraud/__tests__/*.test.ts`, `server/src/mcp/__tests__/*.test.ts`, `server/src/ttl/__tests__/*.test.ts`

- [ ] **Step 1:** Convert per B1 mapping
- [ ] **Step 2:** Run `npm test --workspace server -- src/repositories src/db src/routes src/realtime src/fraud src/mcp src/ttl` -> Expected: PASS
- [ ] **Step 3:** `git add ...those dirs... && git commit -m "test: convert server repo/db/routes/realtime/fraud/mcp/ttl suites to jest"`

### Task B6: Convert server contract suites

**Files:** `server/tests/contract/*.test.ts` (13 files)

- [ ] **Step 1:** Convert per B1 mapping; **preserve self-skip guards** (these check `CONTRACT_PG_URL` etc.). Rewrite node:test skip patterns to `describe.skip`/`it.skip` as needed.
- [ ] **Step 2:** Run locally with Postgres available, or confirm clean self-skip without env:

Run (no env): `npm run test:contract --workspace server`
Expected: suites self-skip (0 failures) when `CONTRACT_*` unset. With a pgvector container + `CONTRACT_PG_URL`/`CONTRACT_VECTOR_URL` set, the Postgres suites PASS.

- [ ] **Step 3:** `git add server/tests/contract && git commit -m "test: convert contract suites to jest (serial, self-skipping)"`

### Task B7: Convert remaining client suites

**Files:** `client/src/**/__tests__/*.test.tsx` (assistantBlocks, assistantStructuredResponses.e2e, currency, userProfileComponents, realtime — bootSplash already done in A6)

- [ ] **Step 1:** Convert per B1 mapping. Client specifics: `assert.match(html, re)` -> `expect(html).toMatch(re)`. Keep `renderToStaticMarkup` and `MemoryRouter` wrappers exactly as-is.
- [ ] **Step 2:** Run `npm test --workspace client` -> Expected: all PASS
- [ ] **Step 3:** `git add client/src && git commit -m "test: convert client suites from node:test to jest"`

### Task B8: Full converted-suite green gate

- [ ] **Step 1:** Run `npm test --workspace server` -> Expected: all converted server unit suites PASS.
- [ ] **Step 2:** Run `npm test --workspace client` -> Expected: all client suites PASS.
- [ ] **Step 3:** Run `npx tsc -p server/tsconfig.json --noEmit` -> Expected: no type errors.

No commit (gate only). If anything is red, fix in the owning file before Phase C.

---

## Phase C — Author new unit tests for untested logic files (parallel)

~200 logic files lack tests (see inventory). Dispatch parallel subagents, one per directory group. Each agent uses the **generating-unit-tests** approach: read the source, enumerate exported functions/components, and write happy-path + edge + error cases using the repo's DI seams. Place each test at `<dir>/__tests__/<basename>.test.ts(x)`.

### Task C1: Regenerate the authoritative inventory

**Files:**
- Create: `scripts/test-inventory.mjs`

- [ ] **Step 1: Create `scripts/test-inventory.mjs`**

```js
// Dev-only inventory: list logic-bearing source files lacking a sibling
// __tests__ test. Skips pure type-only files and pure re-export index barrels.
import { readdirSync, readFileSync, statSync } from "node:fs";
import { join, dirname, basename, relative } from "node:path";

const roots = ["server/src", "client/src"];
const repo = process.cwd();
const isTest = (f) => /\.(test|spec)\.(ts|tsx)$/.test(f);

function walk(dir, acc = []) {
  for (const entry of readdirSync(dir)) {
    const full = join(dir, entry);
    if (statSync(full).isDirectory()) {
      if (entry === "node_modules" || entry === "dist") continue;
      walk(full, acc);
    } else if (/\.(ts|tsx)$/.test(entry)) acc.push(full);
  }
  return acc;
}

function classify(file) {
  const lines = readFileSync(file, "utf8").split("\n").map((l) => l.trim())
    .filter((l) => l && !l.startsWith("//") && !l.startsWith("*") && !l.startsWith("/*"));
  const code = lines.join("\n");
  const reExportOnly = lines.every(
    (l) => /^import /.test(l) || /^export (\*|type \{|\{)[^=]*from /.test(l) || /^export \{[^}]*\};?$/.test(l)
  );
  if (basename(file) === "index.ts" && reExportOnly) return "barrel";
  const hasRuntime =
    /\b(function|=>|class |new |await |return |for \(|while \(|if \()/.test(code) ||
    /export (const|let|function|class|async|default) /.test(code) ||
    /^(const|let|var) /m.test(code);
  if (/(export )?(type |interface |enum )/.test(code) && !hasRuntime) return "type-only";
  if (reExportOnly) return "barrel";
  return "logic";
}

function hasTest(file) {
  const base = basename(file).replace(/\.(ts|tsx)$/, "");
  try {
    return readdirSync(join(dirname(file), "__tests__"))
      .some((c) => c.startsWith(base + ".") && isTest(c));
  } catch { return false; }
}

const untested = [];
for (const root of roots)
  for (const file of walk(join(repo, root)))
    if (!isTest(file) && classify(file) === "logic" && !hasTest(file))
      untested.push(relative(repo, file));

console.log(untested.sort().join("\n"));
console.log(`\nTOTAL untested logic files: ${untested.length}`);
```

- [ ] **Step 2:** Run `node scripts/test-inventory.mjs` and save the list. Expected: ~200 files. This list drives C2–C8.
- [ ] **Step 3:** `git add scripts/test-inventory.mjs && git commit -m "chore: add dev inventory script for untested files"`

### Task C2: Author tests — server `utils`, `config`, `middleware`, `models`

Pure-logic, no-DB units first (highest value, lowest friction). For each file, write a suite covering: at least 2 happy paths, edge cases (empty/null/undefined/zero/boundary), and error conditions (invalid input -> thrown `AppError`, etc.). Use real inputs; no mocking needed for pure functions.

- [ ] **Step 1:** For each untested file under `server/src/utils`, `server/src/middleware`, `server/src/models`, plus `config.ts`, create `__tests__/<basename>.test.ts` with happy/edge/error cases.
- [ ] **Step 2:** Run `npm test --workspace server -- src/utils src/middleware src/models src/__tests__` -> Expected: PASS
- [ ] **Step 3:** `git add server/src && git commit -m "test: add unit tests for server utils/middleware/models/config"`

### Task C3: Author tests — server `fraud` (knnEval, repository, service, types-with-logic)

The fraud math (knn, logreg, scaler, metrics, anomaly, risk) already has tests; cover the remaining `service.ts`, `repository.ts`, `knnEval.ts`. Use in-memory stubs for the repository seam; assert scoring/hold decisions deterministically.

- [ ] **Step 1:** Create tests for each untested `server/src/fraud/*.ts` logic file.
- [ ] **Step 2:** Run `npm test --workspace server -- src/fraud` -> Expected: PASS
- [ ] **Step 3:** `git add server/src/fraud && git commit -m "test: add unit tests for fraud service/repository/knnEval"`

### Task C4: Author tests — server `ai/tools` + `ai/v2/tools`

~40 tool files. Each tool is a function over injected context. Stub the context (repositories, current user) and assert the tool's structured output for representative inputs + empty/edge cases. Skip pure barrel `index.ts` files (note them as skipped).

- [ ] **Step 1:** Create tests for each untested `server/src/ai/tools/*.ts` and `server/src/ai/v2/tools/*.ts` logic file.
- [ ] **Step 2:** Run `npm test --workspace server -- src/ai/tools src/ai/v2/tools` -> Expected: PASS
- [ ] **Step 3:** `git add server/src/ai && git commit -m "test: add unit tests for ai tool modules"`

### Task C5: Author tests — server `ai` core + `ai/v2` core + `ai/evals`

Cover the untested `ai/*.ts` (assistants, counterpartyMemory, dateResolution, messageNormalization, policy, router, state, toolInputs/Memory/Results, runAssistant, graphRoutes) and `ai/v2/*.ts` (agent, blocks, state, turn, toolContext, model, nodes/*, memory/*) and the testable `ai/evals/*` helpers (assertions, harness, judge, personaTone, loadFixtures). Skip graph-wiring entry files that only compose a LangGraph with no pure unit (note them). Mock the LLM seam via the existing injection points — never call a real model.

- [ ] **Step 1:** Create tests per file; for LLM-dependent modules, assert the prompt/state-shaping logic with a stubbed model.
- [ ] **Step 2:** Run `npm test --workspace server -- src/ai` -> Expected: PASS
- [ ] **Step 3:** `git add server/src/ai && git commit -m "test: add unit tests for ai core, v2 core, and eval helpers"`

### Task C6: Author tests — server `repositories` (postgres impls), `db`, `realtime`, `mcp`, `ttl`, `app`

For DB-touching code, unit-test the pure pieces (id generation, error mapping, schema builders, query construction) with stubs; leave live-DB behavior to the contract suites. For `realtime`/`mcp`/`app`, test handler/registration logic with stubbed transports.

- [ ] **Step 1:** Create tests for each untested logic file in these dirs.
- [ ] **Step 2:** Run `npm test --workspace server -- src/repositories src/db src/realtime src/mcp src/ttl` -> Expected: PASS
- [ ] **Step 3:** `git add server/src && git commit -m "test: add unit tests for repositories/db/realtime/mcp/ttl helpers"`

### Task C7: Author tests — client `lib` (pure utilities)

`amount-words`, `api`, `contacts`, `currency`, `format`, `route-transition`, `user-avatar`, `utils`, `validation`. Pure functions: happy/edge/error. For `api.ts` (fetch wrapper), inject/stub `globalThis.fetch` (`jest.fn()`) and assert request shape + response handling; `import.meta.env?.VITE_API_BASE_URL` is `undefined` under Jest, so the default base URL path is exercised.

- [ ] **Step 1:** Create `client/src/lib/__tests__/<basename>.test.ts` for each.
- [ ] **Step 2:** Run `npm test --workspace client -- src/lib` -> Expected: PASS
- [ ] **Step 3:** `git add client/src/lib && git commit -m "test: add unit tests for client lib utilities"`

### Task C8: Author tests — client components, features, ui

Render each component with `renderToStaticMarkup` (wrap router-dependent components in `MemoryRouter`, context-dependent ones in their provider) and assert on the produced HTML: key text, roles/aria, conditional branches (empty vs populated props). Skip pure presentational wrappers with no branching only if they truly render a constant (note them). Provider components: assert they render children and expose default context via a hook-free probe.

- [ ] **Step 1:** Create tests for each untested file under `client/src/components`, `client/src/features`, `client/src/components/ui`, `client/src/app`.
- [ ] **Step 2:** Run `npm test --workspace client` -> Expected: all PASS
- [ ] **Step 3:** `git add client/src && git commit -m "test: add unit tests for client components and features"`

---

## Phase D — CI, cleanup, and final gate

### Task D1: Update CI to run Jest and include client tests

**Files:**
- Modify: `.github/workflows/ci.yml`

- [ ] **Step 1:** In the `unit` job, after `npm ci`, keep the server typecheck step, then run `npm test --workspace server` (now Jest) and **add** `npm test --workspace client`. The contract job's `npm run test:contract --workspace server` now runs the Jest contract config unchanged in invocation. Concretely, the `unit` job steps become:

```yaml
      - name: Typecheck (server)
        run: npx tsc -p server/tsconfig.json --noEmit
      - name: Unit tests (server)
        run: npm test --workspace server
      - name: Unit tests (client)
        run: npm test --workspace client
```

- [ ] **Step 2:** Confirm no remaining `tsx --test` references:

Run: `grep -rn "tsx --test" . --include=*.json --include=*.yml --exclude-dir=node_modules`
Expected: no matches.

- [ ] **Step 3:** `git add .github/workflows/ci.yml && git commit -m "ci: run jest for server + client unit tests"`

### Task D2: Remove `tsx` from test path / confirm it is unused for testing

- [ ] **Step 1:** Verify `tsx` is no longer referenced by any `test*` script (it remains a legit dependency for `dev`, migrations, and the eval/mcp/fraud scripts — do NOT remove the package).

Run: `grep -rn "\"test" server/package.json client/package.json package.json`
Expected: every `test*` script invokes `jest`, none invoke `tsx`.

### Task D3: Final full green gate + coverage snapshot

- [ ] **Step 1:** Run the whole suite:

Run: `npm test` (root: server then client)
Expected: all suites PASS.

- [ ] **Step 2:** Typecheck:

Run: `npx tsc -p server/tsconfig.json --noEmit`
Expected: no errors.

- [ ] **Step 3:** Coverage snapshot (informational):

Run: `npm test --workspace server -- --coverage` and `npm test --workspace client -- --coverage`
Expected: reports generate; record line/branch coverage in the PR description. Note any deliberately-skipped files (entry/barrel/type-only) with one-line justifications.

- [ ] **Step 4:** Contract suite sanity (with Postgres):

Run (with a `pgvector/pgvector:pg16` container and `CONTRACT_PG_URL`/`CONTRACT_VECTOR_URL` set): `npm run test:contract --workspace server`
Expected: Postgres + pgvector contract suites PASS; Mongo cases self-skip without `CONTRACT_MONGO_URL`.

### Task D4: Open the PR

- [ ] **Step 1:** Push and open a PR summarizing: runner switch (node:test -> Jest), ESM/swc config rationale, count of converted suites and new suites, coverage delta, and the list of intentionally-skipped files. Ayal authors his own PRs — prepare the body but confirm before opening.

---

## Self-Review (completed during planning)

- **Spec coverage:** new branch (A1), Jest for every logic file (C2-C8), `__tests__` one level deeper (Global Constraints + every C task), convert existing node:test -> Jest (B2-B7), parallel creation (Phases B and C dispatch one agent per directory group). All four user confirmations encoded: every-logic-file scope (C), @swc/jest (A3-A5), keep renderToStaticMarkup/node env (A5, C8), full runner replace (A6, B6, D1-D2).
- **Placeholder scan:** infra code is given in full; the per-file test bodies in C are intentionally pattern-specified (worked examples in A6 + the generating-unit-tests categories) because ~295 individual test bodies cannot be pre-written in a plan — each C agent authors them against the live source. This is a deliberate, disclosed boundary, not a "TODO".
- **Type consistency:** config field names (`moduleNameMapper`, `extensionsToTreatAsEsm`, `transformIgnorePatterns`, `module.type: "es6"`) are identical across A3/A4/A5; script names (`test`, `test:contract`) match between A6 and D1/D2; the `import.meta` handling rationale (native ESM, optional-chaining-safe) is consistent across server and client configs.

## Known risk areas (surface during A6 / B / C, fix in place)

1. **ESM-only `node_modules` deps** (`@langchain/*`, `langsmith`, `framer-motion`, `motion`) may need adding to the `transformIgnorePatterns` negative lookahead. A6 establishes the pattern; extend per failing import.
2. **`--experimental-vm-modules` warning** is expected on Node 22 and is not an error.
3. **swc + decorators:** none observed in source; if a decorator appears, set `jsc.parser.decorators: true` in the affected config.
4. **Coverage with swc:** `--coverage` uses babel-plugin-istanbul by default which may not see swc-transformed files; if numbers look empty, set `coverageProvider: "v8"` in the Jest configs.
