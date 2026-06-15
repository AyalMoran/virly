/**
 * The [PERSONA] section of the v2 system prompt. v2 puts personality in the
 * agent's system prompt so the streamed reply is in-character in ONE pass — no
 * second compose node, no post-hoc rewrite (design §H). Injects identity + voice
 * + globalGuidance, a hard "be plain on serious situations" rule, and a few
 * Hebrew phrases as SPIRIT exemplars (never verbatim filler, never overriding
 * the language-mirroring rule).
 */
import { getAssistantPersonality, type AssistantId } from "../assistants.js";
import type { ResponseSituation } from "../responseStyle.js";

const EXEMPLAR_SITUATIONS: ResponseSituation[] = [
  "balance_inquiry_success",
  "account_summary_success",
  "transaction_history_success",
  "general_help"
];
const MAX_EXEMPLARS = 4;

const SERIOUS_TONE_RULE = [
  "[TONE — SERIOUS SITUATIONS] Drop ALL humor, slang, blessings, sarcasm, and",
  "success-flavored phrases, and use plain, careful, neutral wording, whenever the",
  "situation is serious: insufficient funds; a failed, declined, or cancelled",
  "transfer; a security-sensitive or out-of-scope request; or when you must ask for",
  "a missing recipient or amount. Personality returns only on safe, successful,",
  "read-only or prepared-transfer replies, and even then it is a light garnish that",
  "never obscures a number, confirmation, or warning."
].join("\n");

function collectSpiritExemplars(assistantId: AssistantId): string[] {
  const persona = getAssistantPersonality(assistantId);
  const out: string[] = [];
  for (const situation of EXEMPLAR_SITUATIONS) {
    const pack = persona.phrasePacks[situation];
    if (!pack) continue;
    for (const phrase of [
      ...(pack.openings ?? []),
      ...(pack.resultIntros ?? []),
      ...(pack.closings ?? []),
      ...(pack.flavor ?? [])
    ]) {
      if (!out.includes(phrase)) out.push(phrase);
      if (out.length >= MAX_EXEMPLARS) return out;
    }
  }
  return out;
}

export function buildPersonaSection(assistantId: AssistantId): string {
  const persona = getAssistantPersonality(assistantId);
  const exemplars = collectSpiritExemplars(assistantId);
  return [
    `[PERSONA] You are ${persona.name} — ${persona.role}.`,
    `Voice: ${persona.traits.join(", ")}.`,
    persona.globalGuidance,
    exemplars.length
      ? `Voice exemplars (these Hebrew phrases illustrate ${persona.name}'s SPIRIT/register only — do NOT reuse them verbatim as filler, do NOT inject Hebrew into a non-Hebrew reply; when replying in another language match the register, not the words): ${exemplars.map((p) => `“${p}”`).join("; ")}.`
      : "",
    SERIOUS_TONE_RULE
  ]
    .filter(Boolean)
    .join("\n");
}
