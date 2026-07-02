# CI Checks Expansion + Playground Clarification Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Todoist task:** `6h2HPVWRG3cR79Vc` - "add more CI checks" (description: "figure out what is playground; what is it good for, how can we implement it into a workflow").

**Goal:** Close the verified CI gaps (client typecheck, client build, server build, Storybook build), document what a "playground" actually is, and wire an advisory playground check into the GitHub workflow.

**Architecture:** Two new parallel jobs are added to `.github/workflows/ci.yml`: `build` (server `tsc` compile + client `tsc -b && vite build`, which is the ONLY thing that typechecks the client and its stories) and `storybook` (catches story bundling breakage the typecheck cannot).
A third `playground` job runs on pull requests only and emits a GitHub warning annotation when the branch has no `docs/playgrounds/<slug>/*.html`; it never fails, mirroring the advisory semantics of the existing local hook.
A new `docs/playgrounds/README.md` becomes the single answer to "what is playground".

**Tech Stack:** GitHub Actions, npm workspaces scripts, bash; no new dependencies, no application code.

## Global Constraints

- There is intentionally no lint step in this repo (CLAUDE.md; no eslint/prettier config exists) - do NOT add one here.
- The unit and contract jobs must remain unchanged and blocking; the playground job must be advisory (always green).
- Node 22 with npm cache, `actions/checkout@v4` + `actions/setup-node@v4`, matching the existing jobs.
- After changing what CI runs, update the project CLAUDE.md sentence that says CI "is exactly: server typecheck, server unit tests, client unit tests, and a separate contract-tests job".
- Never use emojis (including in workflow names and annotations).

## Findings this plan is grounded on (verified 2026-07-02)

**What playground is:** per-branch, self-contained HTML explainer pages under `docs/playgrounds/<branch-slug>/` (slug = branch name with `/` replaced by `--`), e.g. `docs/playgrounds/feat--socketio-realtime/explorer.html`.
They document a feature branch (what changed, diagrams, links to ADRs/plans) for reviewers.
They are enforced only by a local advisory Claude hook, `.claude/hooks/playground-presence.mjs`, which fires on `git push` / `gh pr create` (configured in `.claude/settings.local.json`), warns when the branch has no playground HTML, and never blocks.
There is NO CI job for playgrounds today (the "playground CI gate" some docs implied is a myth).

**Current CI (`.github/workflows/ci.yml`):** exactly two jobs on `push` (all branches) + `pull_request`:
`unit` (npm ci, server typecheck `npx tsc -p server/tsconfig.json --noEmit`, server unit tests, client unit tests) and `contract` (pgvector Postgres service; Mongo cases self-skip).

**Verified gaps:** the client is never typechecked in CI (`npm test --workspace client` runs Jest through `@swc/jest`, which strips types without checking them; only `tsc -b` in the client build does), the client is never bundled, the server is never compiled to `dist/`, and Storybook is never built (stories are typechecked by `tsc -b` since `__stories__/` is not excluded from the build tsconfig, but their bundling is unverified).

## File Structure

| File | Responsibility |
|---|---|
| `.github/workflows/ci.yml` (modify) | Add `build`, `storybook`, and `playground` jobs. |
| `docs/playgrounds/README.md` (create) | What a playground is, slug rule, local hook, CI advisory. |
| `docs/testing.md` (modify) | Add the new CI jobs to the testing docs. |
| `.claude/CLAUDE.md` (modify) | Correct the "CI is exactly ..." sentence. |

---

## Task 1: `build` job (server compile + client typecheck/build)

**Files:**
- Modify: `.github/workflows/ci.yml`

**Interfaces:**
- Consumes: existing workspace scripts `npm run build --workspace server` (`tsc -p tsconfig.json`) and `npm run build --workspace client` (`tsc -b && vite build`).

- [ ] **Step 1: Prove the commands pass locally first**

Run: `npm run build`
Expected: server `tsc` compile and client `tsc -b && vite build` both succeed from a clean checkout state.
If either fails, fix the breakage FIRST in its own commit; do not add a red check.
Note: the client build must not require env vars; `VITE_API_BASE_URL` is optional (the client falls back to same-origin `/api`). If the build demands env, add the minimal `env:` block to the job instead of a repo secret.

- [ ] **Step 2: Add the job to `ci.yml`**

Append after the `contract` job, matching the existing indentation and style:

```yaml
  build:
    name: build (server + client)
    runs-on: ubuntu-latest
    steps:
      - uses: actions/checkout@v4
      - uses: actions/setup-node@v4
        with:
          node-version: 22
          cache: npm
      - run: npm ci
      # Compiles the server to dist/ (unit job only typechecks with --noEmit).
      - run: npm run build --workspace server
      # tsc -b is the ONLY client typecheck anywhere in CI (Jest uses @swc/jest,
      # which strips types without checking them); vite build catches bundling.
      - run: npm run build --workspace client
```

- [ ] **Step 3: Commit**

```bash
git add .github/workflows/ci.yml
git commit -m "ci: build job compiles server and typechecks + bundles client"
```

---

## Task 2: `storybook` job

**Files:**
- Modify: `.github/workflows/ci.yml`

- [ ] **Step 1: Prove it locally**

Run: `npm run build-storybook`
Expected: `storybook build` succeeds (output in `client/storybook-static/`).
Fix any breakage first, in its own commit.

- [ ] **Step 2: Add the job**

```yaml
  storybook:
    name: storybook build
    runs-on: ubuntu-latest
    steps:
      - uses: actions/checkout@v4
      - uses: actions/setup-node@v4
        with:
          node-version: 22
          cache: npm
      - run: npm ci
      # Stories are typechecked by tsc -b (the build job); this catches
      # story BUNDLING breakage (bad imports, addon config, fixtures).
      - run: npm run build-storybook --workspace client
```

- [ ] **Step 3: Commit**

```bash
git add .github/workflows/ci.yml
git commit -m "ci: storybook build job"
```

---

## Task 3: Advisory `playground` job

**Files:**
- Modify: `.github/workflows/ci.yml`

**Interfaces:**
- Mirrors: `.claude/hooks/playground-presence.mjs` semantics - same slug rule (`/` -> `--`), same skip list for infra branches, warn-only.

- [ ] **Step 1: Add the job**

```yaml
  playground:
    name: playground presence (advisory)
    if: github.event_name == 'pull_request'
    runs-on: ubuntu-latest
    steps:
      - uses: actions/checkout@v4
      - name: Check for a branch playground page
        env:
          BRANCH: ${{ github.head_ref }}
        run: |
          case "$BRANCH" in
            main|master|develop|dev|dependabot/*|renovate/*|release-please*)
              echo "Infra branch '$BRANCH' - playground not expected."
              exit 0
              ;;
          esac
          slug="${BRANCH//\//--}"
          dir="docs/playgrounds/${slug}"
          if compgen -G "${dir}/*.html" > /dev/null; then
            echo "Playground found at ${dir}/."
          else
            echo "::warning title=No playground for this branch::Branch '${BRANCH}' has no playground at '${dir}/'. Playgrounds are per-branch HTML explainers for reviewers (see docs/playgrounds/README.md). Advisory only - this check never fails."
          fi
```

The job always exits 0; the signal is the warning annotation on the PR checks page, matching the local hook's "advisory only - push not blocked" behavior.

- [ ] **Step 2: Commit**

```bash
git add .github/workflows/ci.yml
git commit -m "ci: advisory playground-presence check on pull requests"
```

---

## Task 4: `docs/playgrounds/README.md` - the "what is playground" answer

**Files:**
- Create: `docs/playgrounds/README.md`

- [ ] **Step 1: Write the README**

```markdown
# Branch Playgrounds

A playground is a per-branch, self-contained HTML page that explains a feature branch to reviewers: what changed, why, diagrams, and links to the relevant ADRs and plans.
Think of it as the PR description's interactive big sibling.

## Where they live

`docs/playgrounds/<branch-slug>/`, where the slug is the branch name with every `/` replaced by `--`.
Example: branch `feat/socketio-realtime` -> `docs/playgrounds/feat--socketio-realtime/explorer.html`.

## What a playground contains

Self-contained HTML5 (inline CSS, no build step), typically with:

- a hero section naming the branch and its status,
- "what changed" sections,
- Mermaid diagrams (loaded from CDN),
- links to related docs, ADRs, and plans.

Open any existing folder here and copy its structure; `feat--socketio-realtime/explorer.html` is a good template.

## How it is enforced (advisory only, twice)

1. **Locally:** the Claude Code hook `.claude/hooks/playground-presence.mjs` (wired in `.claude/settings.local.json`) warns on `git push` / `gh pr create` when the branch has no playground HTML. It never blocks.
2. **In CI:** the `playground presence (advisory)` job in `.github/workflows/ci.yml` emits a warning annotation on pull requests with no playground. It never fails.

Infra branches (`main`, `dev`, `dependabot/*`, `renovate/*`, `release-please*`) are exempt in both places.

## Why advisory and not required

Playgrounds are reviewer aids, not correctness gates.
Small fixes legitimately ship without one; the warning keeps the habit visible without blocking urgent work.
```

- [ ] **Step 2: Commit**

```bash
git add docs/playgrounds/README.md
git commit -m "docs(playgrounds): explain what a branch playground is and how it is checked"
```

---

## Task 5: Sync the surrounding docs

**Files:**
- Modify: `docs/testing.md`
- Modify: `.claude/CLAUDE.md`

- [ ] **Step 1: Update `docs/testing.md`**

In the CI-related section (near the contract-tests description), document the five jobs: `unit` (server typecheck + both unit suites), `contract` (pgvector; Mongo self-skips), `build` (server compile; client typecheck + vite build - noting this is where the client gets typechecked), `storybook` (story bundling), `playground` (advisory, PR-only).

- [ ] **Step 2: Update `.claude/CLAUDE.md`**

Replace the sentence:

> There is no lint step. CI (`.github/workflows/ci.yml`) is exactly: server typecheck, server unit tests, client unit tests, and a separate contract-tests job against Postgres + pgvector.

with:

> There is no lint step. CI (`.github/workflows/ci.yml`) runs: server typecheck + server/client unit tests (`unit`), contract tests against Postgres + pgvector (`contract`), server compile + client typecheck/build (`build`), a Storybook build (`storybook`), and an advisory playground-presence check on PRs (`playground`, never blocking; see `docs/playgrounds/README.md`).

- [ ] **Step 3: Commit**

```bash
git add docs/testing.md .claude/CLAUDE.md
git commit -m "docs: describe the expanded CI matrix and playground convention"
```

---

## Task 6: Verify on a real pull request

**Files:** none.

- [ ] **Step 1: Push the branch and open a draft PR**

```bash
git push -u origin HEAD
gh pr create --draft --title "ci: expand checks + document playgrounds" --fill
```

- [ ] **Step 2: Watch the run**

Run: `gh run watch`
Expected: five jobs; `unit`, `contract`, `build`, `storybook` green; `playground` green.
Since this branch DOES touch CI, also create the branch's own playground (per the new README) and confirm the warning annotation does not appear; then, to prove the advisory path, check any older PR-less branch or temporarily rename the playground folder in a scratch commit and confirm the warning annotation appears without failing the job, then drop the scratch commit.

- [ ] **Step 3: Confirm runtimes are acceptable**

Expected: `build` about 2-4 minutes, `storybook` about 2-4 minutes, both parallel to the existing jobs, so wall-clock CI time should not grow beyond the slower of contract/storybook.
If `storybook` proves flaky or slow in practice, it is the first candidate to demote to a nightly schedule - note it in the PR description.

---

## Self-Review

- **Spec coverage:** "add more CI checks" - Tasks 1-2 close every deterministic, dependency-free gap found (client typecheck/build, server compile, storybook); deliberately excluded: lint (policy), OpenAPI validation and RAG eval (need tooling/services - listed in Open questions). "figure out what is playground ... implement it into a workflow" - Task 4 documents it, Task 3 wires it into the GitHub workflow as advisory.
- **Placeholder scan:** none; all yaml/bash/markdown is complete and copy-pasteable.
- **Type consistency:** n/a (no application types); job names referenced in Tasks 5-6 match the yaml in Tasks 1-3 (`unit`, `contract`, `build`, `storybook`, `playground`).

## Open questions (answer later)

1. Gate `eval:policy-rag` in CI once `policy-rag.examples.jsonl` exists (depends on Todoist `6h24jj9pcF5FRVw3`; already tracked as a draft suggestion in the task index).
2. OpenAPI validation (e.g. spectral) would need a new dev dependency - decide separately; the repo currently has zero OpenAPI tooling.
3. Should `build` upload `client/dist` / `storybook-static` as artifacts for preview? Skipped for now (YAGNI).
4. The memory note "playground CI gate is a MYTH" becomes outdated once Task 3 lands - update that memory when executing this plan.
