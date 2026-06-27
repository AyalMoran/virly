/**
 * Virly Support MCP server (read-only) — RAG_PLAN.md (MCP follow-up).
 *
 * Exposes the SAME read-only executors the in-app assistant uses, plus the policy
 * RAG retriever, as MCP tools for INTERNAL support/ops staff (e.g. via Claude
 * Desktop). Every tool is read-only and customer-scoped by email; there is NO
 * money movement here by design (that stays in the in-app confirmation flow).
 *
 * Tool logic is built by `createSupportTools(deps)` with injected dependencies so
 * it is unit-testable without a DB or a live MCP client; `buildSupportMcpServer`
 * wires the real repositories/executors/retriever and registers the tools.
 */
import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { z, type ZodRawShape } from "zod";

import { retrievePolicyDocs } from "../ai/rag/retriever.js";
import { readOnlyToolExecutors } from "../ai/tools/index.js";
import { minimalCounterpartyRef, renderToolResult } from "../ai/v2/toolContext.js";
import { getRepositories } from "../repositories/index.js";
import type { Repositories } from "../repositories/types.js";
import type {
  AssistantToolExecutors,
  AssistantToolName,
  ToolContext
} from "../ai/state.js";

export type SupportToolDeps = {
  repos: Pick<Repositories, "users">;
  executors: AssistantToolExecutors;
  retrieve: typeof retrievePolicyDocs;
};

export type McpToolResult = {
  content: Array<{ type: "text"; text: string }>;
  isError?: boolean;
};

export type SupportTool = {
  name: string;
  description: string;
  inputSchema: ZodRawShape;
  handler: (args: Record<string, unknown>) => Promise<McpToolResult>;
};

const ok = (text: string): McpToolResult => ({ content: [{ type: "text", text }] });
const fail = (text: string): McpToolResult => ({ content: [{ type: "text", text }], isError: true });

export function createSupportTools(deps: SupportToolDeps): SupportTool[] {
  /** Resolve a customer by email, then run `fn` with their account id. */
  async function withCustomer(
    email: unknown,
    fn: (userId: string) => Promise<McpToolResult>
  ): Promise<McpToolResult> {
    if (typeof email !== "string" || !email.trim()) {
      return fail("customerEmail is required.");
    }
    const user = await deps.repos.users.findByEmail(email.trim().toLowerCase());
    if (!user) return fail(`No customer found with email ${email}.`);
    try {
      return await fn(user.id);
    } catch (error) {
      return fail(`That lookup failed: ${error instanceof Error ? error.message : "unknown error"}.`);
    }
  }

  /** Invoke one of the app's read-only executors for the resolved customer. */
  async function runExecutor(
    name: AssistantToolName,
    userId: string,
    overrides: Partial<ToolContext> = {}
  ): Promise<McpToolResult> {
    const executor = deps.executors[name];
    if (!executor) return fail(`Capability ${name} is unavailable.`);
    const ctx: ToolContext = { userId, conversationId: "mcp-support", message: "", ...overrides };
    return ok(renderToolResult(await executor(ctx)));
  }

  return [
    {
      name: "lookup_customer",
      description:
        "Look up a Virly customer by email: account id, verification status, role, balance, created date. Start here to confirm you have the right person.",
      inputSchema: { customerEmail: z.string().describe("The customer's email address.") },
      handler: ({ customerEmail }) =>
        withCustomer(customerEmail, async (userId) => {
          const u = await deps.repos.users.findById(userId);
          if (!u) return fail("Customer not found.");
          return ok(
            [
              `Customer ${u.email}`,
              `- account id: ${u.id}`,
              `- verified: ${u.isVerified}`,
              `- role: ${u.role}`,
              `- balance: ${u.balance.toFixed(2)}`,
              `- created: ${u.createdAt.toISOString()}`
            ].join("\n")
          );
        })
    },
    {
      name: "get_balance",
      description: "Current available balance for a customer's account.",
      inputSchema: { customerEmail: z.string() },
      handler: ({ customerEmail }) =>
        withCustomer(customerEmail, (id) => runExecutor("getAccountBalance", id))
    },
    {
      name: "get_recent_transactions",
      description: "The customer's most recent transactions (for 'what happened on this account').",
      inputSchema: { customerEmail: z.string() },
      handler: ({ customerEmail }) =>
        withCustomer(customerEmail, (id) => runExecutor("getRecentTransactions", id))
    },
    {
      name: "get_transfer_limits",
      description: "The customer's per-transfer and daily transfer limits.",
      inputSchema: { customerEmail: z.string() },
      handler: ({ customerEmail }) =>
        withCustomer(customerEmail, (id) => runExecutor("getTransferLimits", id))
    },
    {
      name: "get_daily_transfer_usage",
      description: "How much of today's daily transfer limit the customer has used (for 'why was their transfer blocked').",
      inputSchema: { customerEmail: z.string() },
      handler: ({ customerEmail }) =>
        withCustomer(customerEmail, (id) => runExecutor("getDailyTransferUsage", id))
    },
    {
      name: "get_pending_transfers",
      description: "Transfer confirmations the customer has awaiting action.",
      inputSchema: { customerEmail: z.string() },
      handler: ({ customerEmail }) =>
        withCustomer(customerEmail, (id) => runExecutor("getPendingAiTransfers", id))
    },
    {
      name: "get_counterparty_summary",
      description:
        "The relationship between a customer and one counterparty (total sent/received, net, count). Both are emails.",
      inputSchema: {
        customerEmail: z.string(),
        counterpartyEmail: z.string().describe("The other party's email.")
      },
      handler: ({ customerEmail, counterpartyEmail }) =>
        withCustomer(customerEmail, (id) => {
          if (typeof counterpartyEmail !== "string" || !counterpartyEmail.trim()) {
            return Promise.resolve(fail("counterpartyEmail is required."));
          }
          return runExecutor("getCounterpartySummary", id, {
            resolvedCounterparty: minimalCounterpartyRef(counterpartyEmail)
          });
        })
    },
    {
      name: "search_policy_docs",
      description:
        "Semantic search over Virly's policy + loan-package knowledge base. Use for product/policy/eligibility/fee questions. Returns cited excerpts.",
      inputSchema: {
        query: z.string().describe("The question or topic to look up."),
        limit: z.number().int().min(1).max(10).optional()
      },
      handler: async ({ query, limit }) => {
        if (typeof query !== "string" || !query.trim()) return fail("query is required.");
        const res = await deps.retrieve(query, {
          topK: typeof limit === "number" ? limit : undefined
        });
        if (!res.available) {
          return ok(
            res.reason === "disabled"
              ? "The policy knowledge base is not enabled in this environment."
              : "The policy knowledge base is not configured."
          );
        }
        if (res.citations.length === 0) return ok("No matching policy or loan documents.");
        return ok(
          res.citations
            .map(
              (c, i) =>
                `[${i + 1}] ${c.title}${c.category ? ` (${c.category})` : ""} — ${c.uri ?? c.sourceRef}\n${c.excerpt}`
            )
            .join("\n\n")
        );
      }
    }
  ];
}

/** Build the read-only Support MCP server wired to the live app dependencies. */
export function buildSupportMcpServer(): McpServer {
  const server = new McpServer({ name: "virly-support", version: "1.0.0" });
  const tools = createSupportTools({
    repos: getRepositories(),
    executors: readOnlyToolExecutors,
    retrieve: retrievePolicyDocs
  });
  // Cast registerTool to a concrete signature: the SDK's generic inference over
  // the Zod input shape otherwise triggers TS2589 (excessively deep).
  const register = server.registerTool.bind(server) as (
    name: string,
    config: { description: string; inputSchema: ZodRawShape },
    cb: (args: Record<string, unknown>) => Promise<McpToolResult>
  ) => unknown;
  for (const tool of tools) {
    register(tool.name, { description: tool.description, inputSchema: tool.inputSchema }, tool.handler);
  }
  return server;
}
