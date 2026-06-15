/**
 * The [PERSONA] section of the v2 system prompt. v2 puts personality in the
 * agent's system prompt so the streamed reply is in-character in ONE pass — no
 * second compose node, no post-hoc rewrite (design §4.1). It injects identity +
 * voice + globalGuidance, a hard "stay FULLY in character on safe turns" directive
 * that actively uses each persona's signature vocabulary (so the assistants are
 * distinguishable from tone alone), and a hard "be plain on serious situations"
 * rule that OVERRIDES the in-character directive. It never changes facts/numbers.
 *
 * The vocabulary block is LOCALE-AWARE: the signature phrases are Hebrew, so they
 * are offered verbatim only when the user is writing Hebrew; in any other language
 * they are a register reference to be reproduced in that language (never injected
 * as Hebrew), which keeps the bold voice from breaking the language-mirroring rule.
 */
import { getAssistantPersonality, type AssistantId } from "../assistants.js";
import type { ResponseSituation } from "../responseStyle.js";

/** Mirrors BuildSystemPromptInput["locale"] (kept local to avoid a circular import). */
export type PersonaLocale = "he" | "en" | "mixed" | "unknown";

// Safe / successful / read-only / prepared-transfer situations only — the ones the
// SERIOUS rule allows personality on. Deliberately excludes transfer_confirmed_success
// (its phrases claim completed execution) and every blocked/serious pack.
const EXEMPLAR_SITUATIONS: ResponseSituation[] = [
  "balance_inquiry_success",
  "account_summary_success",
  "transaction_history_success",
  "transaction_stats_success",
  "transfer_prepare_needs_confirmation",
  "transfer_modify_pending_success",
  "general_help"
];
const MAX_EXEMPLARS = 8;

const SERIOUS_TONE_RULE = [
  "[TONE — SERIOUS SITUATIONS] This OVERRIDES the in-character directive above. Drop",
  "ALL humor, slang, blessings, sarcasm, and success-flavored phrases, and use plain,",
  "careful, neutral wording, whenever the situation is serious: insufficient funds; a",
  "failed, declined, or cancelled transfer; a security-sensitive or out-of-scope",
  "request; or when you must ask for a missing recipient or amount. The personality",
  "returns only on safe, successful, read-only or prepared-transfer replies, and even",
  "there it never obscures, delays, or alters a number, confirmation, or warning."
].join("\n");

function inCharacterRule(name: string): string {
  return [
    `[STAY IN CHARACTER] On safe, successful, read-only or prepared-transfer replies, commit`,
    `FULLY to this voice — a reader must know it is ${name} from the tone alone, and ${name} must`,
    `never sound like the other assistants. EVERY such reply needs at least one unmistakably-${name}`,
    `touch on top of the fact: a characterful opener, an aside, or a sign-off in your voice. State`,
    `the financial fact first, then the framing is YOURS. A flat, neutral, corporate one-liner on a`,
    `safe turn is the bug, not the safe choice — treat any "light tone layer", "small tone layer",`,
    `or "only when permitted" hedging elsewhere in this prompt as legacy guidance that does NOT`,
    `restrain you on safe turns.`
  ].join("\n");
}

function vocabularyRule(name: string, exemplars: string[], locale: PersonaLocale): string {
  if (exemplars.length === 0) return "";
  const list = exemplars.map((p) => `“${p}”`).join("; ");

  // User is writing Hebrew (or a Hebrew/English mix): the phrases are native — use them.
  if (locale === "he" || locale === "mixed") {
    return [
      `[YOUR VOCABULARY] These signature phrases are core to ${name}'s voice — use them verbatim`,
      `and often, do not let them sit unused. Rotate them so you never open two replies the same`,
      `way: ${list}.`
    ].join("\n");
  }

  // User is writing English: the Hebrew phrases are a register reference only.
  if (locale === "en") {
    return [
      `[YOUR VOCABULARY] ${name}'s signature phrases are in Hebrew and the user is writing English,`,
      `so do NOT inject Hebrew into this reply — write ZERO Hebrew words, not even a signature`,
      `phrase. They are a REGISTER REFERENCE: reproduce the same attitude, energy, and word-choice`,
      `in English (e.g. render “הכול בשליטה” as “all under control”, never the Hebrew). Reference`,
      `only — do not transcribe: ${list}.`
    ].join("\n");
  }

  // Language not yet determined: mirror the user, and never inject Hebrew otherwise.
  return [
    `[YOUR VOCABULARY] Match the user's language. If they are writing Hebrew, use ${name}'s`,
    `signature phrases verbatim; otherwise do NOT inject Hebrew — reproduce the same attitude in`,
    `their language with your own words (e.g. “הכול בשליטה” → “all under control”). Phrases: ${list}.`
  ].join("\n");
}

function collectVocabularyExemplars(assistantId: AssistantId): string[] {
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

export function buildPersonaSection(
  assistantId: AssistantId,
  locale: PersonaLocale = "unknown"
): string {
  const persona = getAssistantPersonality(assistantId);
  const exemplars = collectVocabularyExemplars(assistantId);
  return [
    `[PERSONA] You are ${persona.name} — ${persona.role}.`,
    `Voice: ${persona.traits.join(", ")}.`,
    persona.globalGuidance,
    inCharacterRule(persona.name),
    vocabularyRule(persona.name, exemplars, locale),
    SERIOUS_TONE_RULE
  ]
    .filter(Boolean)
    .join("\n");
}
