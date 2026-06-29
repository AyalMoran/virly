
/**
 * Single dispatch point between the v1 (deterministic-first) and v2 (LLM-first)
 * assistant graphs, selected by `config.ai.graphVersion`
 * (env `VIRLY_AI_GRAPH_VERSION`, default `v1`).
 *
 * Both graphs honour the identical `(RunAssistantInput, RunAssistantOptions) =>
 * RunAssistantResult` contract, so the HTTP routes and the conformance harness
 * call `runAssistant` and stay agnostic to which implementation serves the turn.
 */
import { config } from "../config.js";
import { runAssistantGraph } from "./graph.js";
import type {
  RunAssistantInput,
  RunAssistantOptions,
  RunAssistantResult
} from "./state.js";
import { invokeV2Resumable } from "./v2/hitl.js";

export function runAssistant(
  input: RunAssistantInput,
  options: RunAssistantOptions = {}
): Promise<RunAssistantResult> {
  if (config.ai.graphVersion === "v2") {
    // The single v2 graph: resumable, checkpointer-backed, with the summarization
    // view. In the DB-free eval/test env the checkpointer degrades to in-memory.
    return invokeV2Resumable(input, options);
  }
  return runAssistantGraph(input, options);
}
