# ADR-0013: Read-only Support MCP server with an OS-level trust boundary

**Status:** Accepted
**Date:** 2026-06-27
**Source:** `server/src/mcp/support.ts` (`createSupportTools`, `buildSupportMcpServer`, `VIRLY_MCP_OPERATOR` audit-log line 280); `server/scripts/mcp-support-server.ts` (stdio entrypoint, `buildSupportMcpServer`).

---

## Context

Internal support and ops staff need read access to customer data (balance,
transactions, counterparty summaries, fraud flags, held transfers) and to the
policy/loan-package knowledge base, without going through the customer-facing UI
or writing ad-hoc database queries. An MCP server lets them use a standard MCP
client (e.g. Claude Desktop) with a natural-language interface. The key design
questions were: how to authenticate operators, and how to ensure this surface
can never move money.

## Decision

`buildSupportMcpServer()` exposes the same read-only tool executors the in-app
assistant uses (`readOnlyToolExecutors`) plus `list_fraud_flags`,
`list_held_transfers`, and `search_policy_docs` — and nothing else. No
money-movement capability is present by design; the transfer confirmation flow
remains solely in the user-facing HTTP API (ADR-0006).

The server has **no per-operator authentication**. The trust boundary is
OS-level: access to launch the process (and to the `server/.env` credentials
it reads) implicitly authorises the operator. This is intentional — the server
is designed to run locally (over stdio) with read-scoped database credentials,
not to be exposed as a network endpoint. The comment in `support.ts` (line 278)
states this explicitly.

Every tool call is **audit-logged to stderr** (not stdout, which is the
JSON-RPC protocol channel) with the pattern:
`[mcp-support][operator=<name>] <tool_name> <args>`. The operator identity
comes from `VIRLY_MCP_OPERATOR` (falling back to the OS `$USER` environment
variable), so all customer-data reads are attributable without a separate auth
system.

Tool logic is built by `createSupportTools(deps)` with injected dependencies,
keeping it fully unit-testable without a database or a live MCP connection.
`buildSupportMcpServer()` wires the real repositories, executors, and retriever.

The MCP entrypoint (`scripts/mcp-support-server.ts`) redirects `console.log` to
`stderr` before any imports, ensuring that database bootstrap messages (which
use `console.log`) do not corrupt the JSON-RPC stream on stdout.

## Alternatives considered

| Alternative | Why not chosen |
|---|---|
| Per-operator API-key authentication on the MCP server | Requires secret management for every operator; the read-only, local-only design means OS-level access is already the gating control. Adding a second credential layer adds complexity without meaningful security gain given the deployment model. |
| Expose the server as a network endpoint (HTTP/SSE transport) | Would require real auth; the stdio transport keeps the trust model simple and avoids opening a new network port. |
| Separate support database with replicated read-only data | High operational complexity; the app repositories already implement read-only queries; replication lag would make support views stale. |
| Expose write tools (e.g. cancel a transfer, refund) | Keeps the "no money movement without user action" invariant of ADR-0006 intact; support staff can trigger the appropriate user-facing flows instead. |

## Status

Accepted — `createSupportTools`, `buildSupportMcpServer`, and the
`mcp-support-server.ts` entrypoint are live. Launched via `npm run mcp:support`
from `server/`.

## Consequences

**Positive:** Support staff get a natural-language interface over all read
surfaces; money-movement is structurally excluded; every customer-data read is
logged; the server is testable without a live MCP client.

**Negative / trade-offs:** The OS-level trust model means a compromised machine
or misconfigured credentials would expose all customer read data; the server
MUST NOT be deployed as a persistent network service. Audit logs are ephemeral
(stderr only); a production deployment should redirect stderr to a persistent
log sink.

**Neutral / follow-on work:** If the deployment model ever changes to a network
service, per-operator authentication and network-level access controls would be
required. See [`../security.md`](../security.md) §6 "Support MCP server" and
[`../operations.md`](../operations.md) for operator runbook. Cross-references:
ADR-0006 (HITL money-movement gate), ADR-0011 (fraud flags surfaced here).
