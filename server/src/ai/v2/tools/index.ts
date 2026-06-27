/**
 * The v2 toolbelt: read-only tools + money-proposing tools, plus the `ToolNode`
 * the graph executes them in.
 *
 * `allTools` is what the agent binds (with `parallel_tool_calls`); `toolNode`
 * runs the model's chosen calls (in parallel) and appends `ToolMessage`s. Money
 * tools build confirmation cards via injected services — they do not execute
 * money (Phase 5). Per-call dependencies (executors, transfer services, identity)
 * are read from `config.configurable`, so the ToolNode is built once.
 */
import { ToolNode } from "@langchain/langgraph/prebuilt";

import { fraudTools } from "./fraud.js";
import { moneyTools } from "./money.js";
import { knowledgeTools } from "./policyDocs.js";
import { readOnlyTools } from "./readOnly.js";

export { readOnlyTools } from "./readOnly.js";
export { moneyTools } from "./money.js";
export { knowledgeTools } from "./policyDocs.js";
export { fraudTools } from "./fraud.js";

/** Tool names that propose money movement (built into cards, never executed). */
export const MONEY_TOOL_NAMES = new Set([
  "prepareTransfer",
  "modifyPendingTransfer",
  "cancelPendingTransfer"
]);

export const allTools = [...readOnlyTools, ...knowledgeTools, ...fraudTools, ...moneyTools];

/** A ToolNode over the full v2 toolbelt; per-call deps ride in config.configurable. */
export function createV2ToolNode(): ToolNode {
  return new ToolNode(allTools);
}
