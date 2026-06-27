/**
 * Entrypoint for the Virly Support MCP server (read-only).
 *
 * Launched by an MCP client (e.g. Claude Desktop) over stdio. Run from server/:
 *   npm run mcp:support
 *
 * IMPORTANT: stdio is the MCP protocol channel, so nothing may write to stdout.
 * connectDb()/initRepositories() log via console.log — we redirect console.log
 * to stderr before bootstrapping so those lines can't corrupt the JSON-RPC stream.
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
