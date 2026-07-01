# Planning

Time-bound planning and analysis artifacts, organized by where the work sits in its lifecycle.
The lifecycle is proposals -> specs -> plans -> archive; a document moves rightward as the work matures, and does not have to start at the left.
For the full docs tree and the reference docs, see [../README.md](../README.md).

## Where each kind of doc goes

| Folder | Holds | Add here when |
|---|---|---|
| [`proposals/`](proposals/) | Aspirational ideas and architecture briefs, not yet scheduled | You want to capture an idea worth pursuing but have no committed plan yet |
| [`specs/`](specs/) | Design specs, named `YYYY-MM-DD-topic` | Work has been designed and you are recording its decision and shape |
| [`plans/`](plans/) | Implementation plans, named `YYYY-MM-DD-topic` | Work is being built and you are recording the step-by-step |
| [`archive/`](archive/) | Collections whose work has fully shipped | A set of plans or suggestions is 100% delivered and kept as a record |

Point-in-time audits and reviews live in [`../reviews/`](../reviews/), not here.
Load-bearing architecture decisions live in [`../adr/`](../adr/) as numbered ADRs.

## Convention for tools

New design specs go in `specs/` and new implementation plans in `plans/`.
This overrides the superpowers skills' default of `docs/superpowers/`, which no longer exists.
If a run recreates `docs/superpowers/`, move its output here and delete the empty folder.

The reorg that established this layout is recorded in [specs/2026-07-01-docs-structure-and-convention-design.md](specs/2026-07-01-docs-structure-and-convention-design.md).
