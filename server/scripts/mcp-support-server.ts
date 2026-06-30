/**
 * Entrypoint for the Virly Support MCP server (read-only).
 *
 * Launched by an MCP client (Claude Code, Claude Desktop) over stdio. The client
 * must invoke this script via tsx directly, with the working directory set to
 * server/ so server/.env loads. Do NOT configure a client to launch it with
 * `npm run mcp:support`: npm prints a banner to stdout (the MCP JSON-RPC channel)
 * before this script runs, which corrupts the handshake. `npm run mcp:support` is
 * fine only as a manual boot check in a terminal. See docs/operations.md section 7.3.
 *
 * IMPORTANT: stdio is the MCP protocol channel, so nothing may write to stdout.
 * connectDb()/initRepositories() log via console.log - we redirect console.log
 * to stderr before bootstrapping so the app's own logging can't corrupt the
 * JSON-RPC stream. (This does not cover npm's banner; see above.)
 */
console.log = (...args: unknown[]) => console.error(...args);

import { StdioServerTransport } from "@modelcontextprotocol/sdk/server/stdio.js";

import { connectDb, initRepositories } from "../src/db.js";
import { buildSupportMcpServer } from "../src/mcp/support.js";

async function main(): Promise<void> {
  await connectDb();
  await initRepositories();
  const server = buildSupportMcpServer();
  await server.connect(new StdioServerTransport());
  console.error("Virly Support MCP server ready (stdio).");
}

main().catch((error) => {
  console.error("Support MCP server failed to start:", error);
  process.exit(1);
});
