/**
 * Retrieval-quality eval for the policy RAG knowledge base (RAG_PLAN.md §4, §6).
 *
 * Measures recall@k: for each question, did the expected source document appear
 * among the top-k retrieved chunks? Run AFTER `npm run rag:sync`, from server/:
 *   VIRLY_RAG_ENABLED=true npm run eval:policy-rag
 *
 * Requires VIRLY_AI_PG_URL + OPENAI_API_KEY + VIRLY_RAG_ENABLED. Exits non-zero
 * if recall falls below the threshold (default 1.0; override with --threshold=).
 */
import { promises as fs } from "node:fs";
import path from "node:path";

import { config } from "../src/config.js";
import { closeAiPool } from "../src/db/vector.js";
import { retrievePolicyDocs } from "../src/ai/rag/retriever.js";

type Example = { question: string; expectedSourceRefs: string[] };

function getFlag(name: string, fallback: string): string {
  const hit = process.argv.find((a) => a.startsWith(`--${name}=`));
  return hit ? hit.slice(name.length + 3) : fallback;
}

async function loadExamples(): Promise<Example[]> {
  const file = path.resolve(import.meta.dirname, "../src/ai/evals/policy-rag.examples.jsonl");
  const raw = await fs.readFile(file, "utf8");
  return raw
    .split("\n")
    .map((l) => l.trim())
    .filter(Boolean)
    .map((l) => JSON.parse(l) as Example);
}

async function main(): Promise<void> {
  const topK = Number(getFlag("k", String(config.rag.topK)));
  const threshold = Number(getFlag("threshold", "1.0"));

  if (!config.rag.enabled) {
    throw new Error("Set VIRLY_RAG_ENABLED=true to run the eval.");
  }

  const examples = await loadExamples();
  let hits = 0;
  for (const ex of examples) {
    const result = await retrievePolicyDocs(ex.question, { topK });
    if (!result.available) {
      throw new Error(`Knowledge base unavailable (${result.reason}). Run rag:sync first.`);
    }
    const retrieved = new Set(result.citations.map((c) => c.sourceRef));
    const hit = ex.expectedSourceRefs.some((ref) => retrieved.has(ref));
    if (hit) hits += 1;
    console.log(`${hit ? "✓" : "✗"} ${ex.question}`);
    if (!hit) {
      console.log(`    expected one of: ${ex.expectedSourceRefs.join(", ")}`);
      console.log(`    got: ${[...retrieved].join(", ") || "(none)"}`);
    }
  }

  const recall = hits / examples.length;
  console.log(`\nrecall@${topK} = ${hits}/${examples.length} = ${recall.toFixed(3)}`);
  if (recall < threshold) {
    console.error(`FAIL: recall ${recall.toFixed(3)} < threshold ${threshold}`);
    process.exitCode = 1;
  }
}

main()
  .then(() => closeAiPool())
  .then(() => process.exit(process.exitCode ?? 0))
  .catch(async (error) => {
    console.error(error instanceof Error ? error.message : error);
    await closeAiPool().catch(() => {});
    process.exit(1);
  });
