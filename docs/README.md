# Virly docs

The map of this documentation tree.
Reference docs describe how the system works today; planning docs are time-bound and dated.
For where a new doc should go, see [planning/README.md](planning/README.md) (planning artifacts) and [`adr/`](adr/README.md) (decisions).

## Reference (current-state truth)

By subsystem:
- [frontend](frontend/index.md) - React client component reference.
- [backend](backend/index.md) - server module reference: routes, services, repositories, AI, fraud, RAG, MCP.
- [ai](ai/architecture.md) - AI assistant architecture (v1 + v2).
- [api](api/README.md) - HTTP API reference (surfaces `openapi.yaml`).
- [domain](domain/transfers.md) - money-movement / transfer domain.
- [adr](adr/README.md) - Architecture Decision Records: why the code is built this way.

Cross-cutting guides, kept at the `docs/` root because the whole tree links to them:
- [configuration.md](configuration.md) - environment variables, defaults, and profiles.
- [operations.md](operations.md) - deploy, operate, and recover runbook.
- [security.md](security.md) - the security model and threat model.
- [testing.md](testing.md) - unit, contract, and AI-eval test tiers.
- [realtime.md](realtime.md) - Socket.IO realtime.

## Planning (time-bound)

- [planning/](planning/README.md) - proposals -> specs -> plans -> archive. Its README says where new specs and plans go.

## Analysis and artifacts

- [reviews/](reviews/) - point-in-time audits tied to a snapshot of the code.
- [playgrounds/](playgrounds/) - per-branch HTML explainers (path fixed by a repo hook).
