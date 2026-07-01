# Docs Structure and Convention

> Status: Approved design - execution pending.
> Date: 2026-07-01.
> Scope: the layout of `docs/` and the rule for where each kind of document lives.

## Context

`docs/` grew organically to 213 tracked files.
Planning and analysis artifacts accumulated in six folders with no rule for which was which: `superpowers/specs/`, `superpowers/plans/`, `future-plans/`, `agent-plans/`, `improvements/`, and `reviews/`.
Three of those folders had "plans" in the name and meant three different things.
Reference material was split between typed folders (`frontend/`, `backend/`, `ai/`, `api/`, `domain/`, `adr/`) and six loose `.md` files at the root.
A newcomer could not tell where a new spec, plan, or audit should go.

## Decision

Leave the proven reference structure untouched and unify every planning or analysis artifact under a single `planning/` tree with an explicit lifecycle.

```
docs/
  README.md                  # index of the tree + the convention
  configuration.md operations.md security.md testing.md realtime.md   # cross-cutting reference guides
  frontend/ backend/ ai/ api/ domain/ adr/     # reference by subsystem
  planning/
    README.md                # the living convention
    proposals/               # aspirational ideas, not yet scheduled
    specs/                   # design specs (dated)
    plans/                   # implementation plans (dated)
    archive/                 # collections whose work has fully shipped
      agent-plans/
      improvements/
  reviews/                   # point-in-time audits
  playgrounds/               # per-branch HTML explainers
```

## Convention: where each kind of doc lives

Reference (current-state truth):
- Per-subsystem references stay in their topic folder: `frontend/`, `backend/`, `ai/`, `api/`, `domain/`, `adr/`.
- Cross-cutting operational guides stay at the `docs/` root: `configuration.md`, `operations.md`, `security.md`, `testing.md`, `realtime.md`.
  These are the most-linked files in the tree, so keeping them at the root keeps inbound relative links short and stable.
- Load-bearing architecture decisions go in `adr/` as numbered ADRs.

Planning (time-bound, named `YYYY-MM-DD-topic`):
- `planning/proposals/` - aspirational ideas not yet scheduled, such as architecture-deepening briefs.
- `planning/specs/` - design specs for work that has been designed.
- `planning/plans/` - implementation plans for work being built.
- `planning/archive/` - collections whose work has fully shipped, preserved as a record.

Analysis (point-in-time):
- `reviews/` - audits and reviews tied to a date and a snapshot of the code.

Artifacts:
- `playgrounds/` - per-branch HTML explainers; the path is fixed by `.claude/hooks/playground-presence.mjs`.

The lifecycle is proposals -> specs -> plans -> archive.
A document moves rightward as the work matures; it does not have to start at the left.

## Tooling override

The superpowers `brainstorming` and `writing-plans` skills default to writing specs and plans under `docs/superpowers/`.
This repo overrides that default: specs go in `docs/planning/specs/` and plans in `docs/planning/plans/`.
The override is recorded in this spec and in `docs/planning/README.md` (both committed), and mirrored into the git-ignored `.claude/CLAUDE.md` so local agent runs follow it.
The override is convention-based, not enforced; if a future run recreates `docs/superpowers/`, move its output into `planning/` and delete the empty folder.

## Moves

All moves use `git mv` to preserve history.

| From | To |
|---|---|
| `docs/superpowers/specs/` (2 files) | `docs/planning/specs/` |
| `docs/superpowers/plans/` (17 files) | `docs/planning/plans/` |
| `docs/future-plans/` (6 briefs + README) | `docs/planning/proposals/` |
| `docs/agent-plans/` (10 plans + index) | `docs/planning/archive/agent-plans/` |
| `docs/improvements/` (6 + README) | `docs/planning/archive/improvements/` |
| `docs/RAG_PLAN.md` | `docs/planning/specs/rag-knowledge-base-design.md` |
| `docs/TODO.md` | `docs/planning/backlog.md` |

`docs/superpowers/` is removed once empty.
`reviews/`, `playgrounds/`, and the reference tree do not move.

## Link and config fixups

- `.claude/CLAUDE.md` documentation map: repointed to the new homes; this file is git-ignored, so the change steers local agent runs but is not part of the committed diff.
- Root `README.md`: repoint any link into a moved planning folder.
- `planning/archive/agent-plans/documentation-plans.md`: its outbound links to the root guides gain directory levels.
- `planning/proposals/README.md` (was `future-plans/README.md`): fix the stale "this directory is git-ignored" claim, since `docs/` is tracked.
- After execution, every relative Markdown link under `docs/` is re-checked and none may be broken.

## Consequences

Positive:
- One obvious home for every planning artifact, with a lifecycle that mirrors how work matures.
- The reference tree and the link-hub guides do not move, so the existing cross-links stay valid.
- The word "plans" now denotes exactly one thing.

Trade-offs:
- The superpowers default path is overridden by convention rather than by an enforced setting.
- `docs/` root still holds five reference guides plus two index files; this is deliberate, to keep the link hubs stable.

## Verification

- `git mv` for every move, so `git status` shows renames rather than delete-plus-add.
- A link-check pass resolves every relative Markdown link target and reports zero broken links.
- `docs/README.md` and `docs/planning/README.md` render and link correctly.
