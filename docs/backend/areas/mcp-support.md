# Backend area: Support MCP server

> A read-only Model Context Protocol server that exposes the same customer-data
> executors as the in-app assistant, plus fraud triage and policy-document
> search, for internal support/ops staff (e.g. Claude Desktop). No HTTP
> endpoints and no money movement.

> **Security trust-boundary detail** (why this server must run locally with
> read-only DB credentials, and why it has no per-operator auth layer of its
> own) is documented in [`../../security.md`](../../security.md). **AI tool
> internals** live in the [AI architecture doc](../../ai/architecture.md).

**Module:** `server/src/mcp/support.ts`
**Entry point script:** `server/scripts/mcp-support-server.ts`
**Manual boot check:** `npm run mcp:support` (from `server/`)
**MCP client launch:** invoke `tsx` directly with the working directory set to
`server/` - never via `npm run`, whose stdout banner corrupts the JSON-RPC
stream. See [operations §7.3](../../operations.md#73-mcp-client-wiring).

## What it is

`buildSupportMcpServer()` constructs an `@modelcontextprotocol/sdk` `McpServer`
named `"virly-support"` (version `1.0.0`), wires it to the live app
dependencies (app repositories, the in-app read-only tool executors, the RAG
retriever, and the fraud list functions), and registers 10 read-only tools.

The tool logic is built by `createSupportTools(deps)` with injected
`SupportToolDeps`, making every tool unit-testable without a database or a live
MCP client.

## Tools

All 10 tools are read-only. Customer-facing tools resolve the customer by email
first (`withCustomer`) to scope every lookup to one account.

| Tool name | Scope | What it returns |
|-----------|-------|-----------------|
| `lookup_customer` | By email | Account id, verified status, role, balance, created date. |
| `get_balance` | By email | Current available balance. |
| `get_recent_transactions` | By email | Recent transaction list. |
| `get_transfer_limits` | By email | Per-transfer and daily limits. |
| `get_daily_transfer_usage` | By email | Today's daily-limit usage. |
| `get_pending_transfers` | By email | AI pending-transfer cards awaiting action. |
| `get_counterparty_summary` | By email + counterparty email | Total sent/received/net between the two parties. |
| `list_fraud_flags` | Optional email + level filter | Recent `ai_fraud_flags` rows (medium/high risk). |
| `list_held_transfers` | Optional email + status filter | Recent `held_transfers` rows by status. |
| `search_policy_docs` | Query string | Top-k cosine-similarity hits from the RAG knowledge base with cited excerpts. |

The customer-scoped tools delegate to `readOnlyToolExecutors` (the same
executor map the in-app assistant uses) via `runExecutor`. `list_fraud_flags`
and `list_held_transfers` call `listFraudFlags` and `listHeldTransfers`
directly from the fraud module.

## Audit log

Every tool invocation is written to **stderr** before executing:

```
[mcp-support][operator=<name>] <tool_name> <args_json>
```

`operator` is taken from `VIRLY_MCP_OPERATOR` → `USER` → `"unknown"`. Stdout
is the MCP protocol channel and must not be written by application code.

## No money movement

There are no write tools. The held-transfer confirm/cancel flow and all
`executeTransfer` paths remain in the HTTP surface of the main app. The MCP
server can only read `held_transfers`; it cannot call `confirmHold` or
`cancelHold`.

## Dependencies

| Dependency | Where it comes from |
|------------|---------------------|
| App repositories (`users`) | `getRepositories()` — the singleton wired at boot |
| Read-only tool executors | `readOnlyToolExecutors` from `ai/tools/index.ts` |
| RAG retriever | `retrievePolicyDocs` from `ai/rag/retriever.ts` |
| Fraud flag list | `listFraudFlags` from `fraud/service.ts` |
| Held-transfer list | `listHeldTransfers` from `fraud/holds.ts` |

## Cross-cutting

- **No per-operator authentication.** The trust boundary is OS-level access to
  run the process. The server must be run locally with read-scoped database
  credentials — see [`../../security.md`](../../security.md).
- **Graceful degradation.** `search_policy_docs` returns a plain-text
  "not enabled" or "not configured" message when RAG is off or unconfigured
  (same `{ available: false }` path as the in-app tool).
- **Testability.** `createSupportTools(deps)` accepts injected dependencies so
  every tool handler can be unit-tested in isolation without a live MCP server
  or database.
