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
