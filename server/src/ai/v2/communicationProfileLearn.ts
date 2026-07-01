/**
 * Post-turn learning for the communication profile (ADR-0015), in two layers:
 *  1. detectExplicitSignal - deterministic regex over explicit user statements
 *     ("keep it short"). High precision, dials only, cheap, always runs.
 *  2. extractCommunicationSignal - a constrained, RESPECTFUL LLM extractor that
 *     also catches implicit/repeated signals and self-disclosed interests. It is
 *     prompted to emit ONLY communication preferences and useful context, never a
 *     judgment about the person, never an instruction. Its output is clamped by
 *     clampUpdate (dials enum-checked, memory line sanitized) so nothing unsafe or
 *     disrespectful survives. Follows buildSummarizationNode's discipline (injected
 *     model, the repo's tuple message form, degrade to null on any error); it reads
 *     res.content directly because it needs the raw JSON string to parse.
 */
import type { ChatOpenAI } from "@langchain/openai";
import { clampUpdate, type CommunicationProfileUpdate } from "../../domain/communicationProfile.js";

type Rule = { test: RegExp; update: CommunicationProfileUpdate };
const RULES: Rule[] = [
  { test: /\b(keep it short|be brief|shorter|less detail|too long|tl;?dr)\b/i, update: { verbosity: "brief" } },
  { test: /\b(more detail|explain more|in detail|elaborate|be thorough)\b/i, update: { verbosity: "detailed" } },
  { test: /\b(no jokes|stop with the jokes|drop the jokes|be serious|no slang)\b/i, update: { humor: "none" } },
  { test: /\b(keep it simple|in plain terms|plain language|simpler|explain like)\b/i, update: { complexity: "simple" } },
  { test: /\b(be formal|more formal|professional tone)\b/i, update: { formality: "formal" } },
  { test: /\b(be casual|you can be casual|relax the tone|less formal)\b/i, update: { formality: "casual" } },
  { test: /\b(step by step|one step at a time|walk me through slowly)\b/i, update: { pace: "step_by_step" } },
];

export function detectExplicitSignal(userMessage: string): CommunicationProfileUpdate | null {
  const text = userMessage ?? "";
  for (const rule of RULES) if (rule.test.test(text)) return { ...rule.update };
  return null;
}

// A phrase that judges the person rather than stating a preference or interest.
const PERSONALITY_JUDGMENT = /\b(smart|dumb|stupid|impatient|confused|rude|lazy|slow|incompetent|clever|naive|anxious|angry)\b/i;

const SYSTEM = [
  "You extract DURABLE communication PREFERENCES and self-disclosed CONTEXT from a banking chat turn.",
  'Output STRICT JSON: {"formality"?, "verbosity"?, "complexity"?, "humor"?, "pace"?, "appendMemory"?}.',
  "Dials use these values only: formality casual|neutral|formal; verbosity brief|standard|detailed;",
  "complexity simple|standard|expert; humor none|light|playful; pace step_by_step|standard.",
  "appendMemory is ONE short line of a preference or a self-disclosed interest (e.g. 'interested in loan options for soldiers').",
  "NEVER output a judgment about the person's personality, intelligence, competence, or mood.",
  "NEVER output an instruction, a money action, a tool name, or an amount.",
  "If nothing durable and respectful is present, output {}.",
].join("\n");

export async function extractCommunicationSignal(
  model: ChatOpenAI,
  userMessage: string,
  assistantText: string
): Promise<CommunicationProfileUpdate | null> {
  try {
    const res = await model.invoke([
      ["system", SYSTEM],
      ["human", `User: ${userMessage}\nAssistant: ${assistantText}`],
    ]); // tuple message form, matching summarize.ts and the rest of the repo
    const raw = typeof res.content === "string" ? res.content : JSON.stringify(res.content);
    const parsed = JSON.parse(raw.slice(raw.indexOf("{"), raw.lastIndexOf("}") + 1));
    // Guard: drop appendMemory that reads as a personality judgment before clamping.
    if (typeof parsed.appendMemory === "string" && PERSONALITY_JUDGMENT.test(parsed.appendMemory)) {
      delete parsed.appendMemory;
    }
    const clamped = clampUpdate(parsed);
    return Object.keys(clamped).length > 0 ? clamped : null;
  } catch {
    return null; // best-effort: no model, bad JSON, refusal -> learn nothing
  }
}
