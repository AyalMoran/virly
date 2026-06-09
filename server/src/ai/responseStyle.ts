import type { AssistantId } from "./assistants.js";
import type { AssistantIntent } from "./state.js";

export const responseSituationValues = [
  "balance_inquiry_success",
  "account_summary_success",
  "transaction_history_success",
  "transaction_stats_success",
  "transfer_prepare_needs_confirmation",
  "transfer_modify_pending_success",
  "transfer_quote_success",
  "transfer_confirmed_success",
  "transfer_cancelled_success",
  "transfer_status_success",
  "transfer_limits_success",
  "missing_required_transfer_details",
  "insufficient_funds",
  "transfer_failed",
  "security_sensitive",
  "general_help"
] as const;

export type ResponseSituation = (typeof responseSituationValues)[number];

export const riskLevelValues = ["low", "medium", "high", "blocked"] as const;

export type RiskLevel = (typeof riskLevelValues)[number];

export type PhrasePack = {
  maxPhrases: number;
  openings?: string[];
  resultIntros?: string[];
  closings?: string[];
  flavor?: string[];
  forbidden?: string[];
  guidance: string;
};

type AssistantPersonalityForStyle = {
  id: AssistantId;
  name: string;
  role: string;
  traits: string[];
  globalGuidance: string;
  phrasePacks: Partial<Record<ResponseSituation, PhrasePack>>;
};

export type ResponseStyleContext = {
  assistantId: AssistantId;
  assistantName: string;
  role: string;
  traits: string[];
  situation: ResponseSituation;
  riskLevel: RiskLevel;
  maxPersonalityPhrases: number;
  allowedPhrases: string[];
  forbiddenPhrases: string[];
  guidance: string;
};

export type ResolveResponseSituationInput = {
  intent: AssistantIntent;
  riskLevel?: RiskLevel;
  toolSucceeded?: boolean;
  requiresConfirmation?: boolean;
  transferStatus?: string;
  missingFields?: string[];
  failureReason?: string;
  backendConfirmedExecution?: boolean;
};

export type PersonalityPhraseUsage = {
  phrase: string;
  count: number;
};

export type PersonalityLintResult = {
  valid: boolean;
  disallowedPhrases: string[];
  forbiddenPhrases: string[];
  usedAllowedPhrases: PersonalityPhraseUsage[];
  usedPersonalityPhraseCount: number;
  tooManyPersonalityPhrases: boolean;
};

function unique(values: string[]) {
  return [...new Set(values.filter((value) => value.trim()))];
}

function flattenPhrasePack(pack: PhrasePack | undefined) {
  if (!pack) {
    return [];
  }

  return unique([
    ...(pack.openings ?? []),
    ...(pack.resultIntros ?? []),
    ...(pack.closings ?? []),
    ...(pack.flavor ?? [])
  ]);
}

function isTransferIntent(intent: AssistantIntent) {
  return (
    intent === "transfer_prepare" ||
    intent === "transfer_modify_pending" ||
    intent === "transfer_cancel_pending" ||
    intent === "transfer_limits" ||
    intent === "transfer_eligibility" ||
    intent === "transfer_quote" ||
    intent === "daily_transfer_usage" ||
    intent === "transfer_status" ||
    intent === "pending_ai_transfers" ||
    intent === "pending_confirmation_status"
  );
}

function normalizeFailureReason(reason: string | undefined) {
  return reason?.toLowerCase().replace(/\s+/g, "_");
}

export function resolveResponseSituation(
  input: ResolveResponseSituationInput
): ResponseSituation {
  const failureReason = normalizeFailureReason(input.failureReason);

  if (input.riskLevel === "high" || input.riskLevel === "blocked") {
    if (failureReason === "insufficient_funds" || failureReason === "insufficient_balance") {
      return "insufficient_funds";
    }

    if (input.intent === "unsafe_request" || input.riskLevel === "blocked") {
      return "security_sensitive";
    }
  }

  if (input.missingFields && input.missingFields.length > 0) {
    return "missing_required_transfer_details";
  }

  if (failureReason === "insufficient_funds" || failureReason === "insufficient_balance") {
    return "insufficient_funds";
  }

  if (input.toolSucceeded === false && isTransferIntent(input.intent)) {
    return "transfer_failed";
  }

  if (
    input.backendConfirmedExecution &&
    input.transferStatus === "confirmed" &&
    !input.requiresConfirmation
  ) {
    return "transfer_confirmed_success";
  }

  if (
    input.transferStatus === "denied" ||
    input.transferStatus === "cancelled" ||
    input.transferStatus === "canceled"
  ) {
    return "transfer_cancelled_success";
  }

  switch (input.intent) {
    case "balance_inquiry":
      return "balance_inquiry_success";

    case "account_summary":
      return "account_summary_success";

    case "recent_transactions":
    case "transaction_search":
    case "transaction_detail":
    case "counterparty_transactions":
    case "counterparty_summary":
    case "counterparty_activity_timeline":
    case "counterparty_total_sent":
    case "counterparty_total_received":
    case "counterparty_net_total":
    case "recent_sent_counterparties":
    case "recent_received_counterparties":
    case "last_sent_counterparty":
      return "transaction_history_success";

    case "transaction_summary":
    case "transaction_count":
    case "transaction_stats":
    case "cashflow_summary":
      return "transaction_stats_success";

    case "transfer_prepare":
      return "transfer_prepare_needs_confirmation";

    case "transfer_modify_pending":
      return "transfer_modify_pending_success";

    case "transfer_quote":
      return "transfer_quote_success";

    case "transfer_cancel_pending":
      return "transfer_cancelled_success";

    case "transfer_status":
    case "pending_ai_transfers":
    case "pending_confirmation_status":
      return "transfer_status_success";

    case "transfer_limits":
    case "transfer_eligibility":
    case "daily_transfer_usage":
      return "transfer_limits_success";

    case "unsafe_request":
      return "security_sensitive";

    default:
      return "general_help";
  }
}

export function buildResponseStyleContext(
  personality: AssistantPersonalityForStyle,
  situation: ResponseSituation,
  riskLevel: RiskLevel
): ResponseStyleContext {
  const pack = personality.phrasePacks[situation];
  const riskBlocksPersonality = riskLevel === "high" || riskLevel === "blocked";

  return {
    assistantId: personality.id,
    assistantName: personality.name,
    role: personality.role,
    traits: personality.traits,
    situation,
    riskLevel,
    maxPersonalityPhrases: riskBlocksPersonality ? 0 : pack?.maxPhrases ?? 0,
    allowedPhrases: riskBlocksPersonality ? [] : flattenPhrasePack(pack),
    forbiddenPhrases: unique(pack?.forbidden ?? []),
    guidance: [
      personality.globalGuidance,
      pack?.guidance ??
        "No situation-specific phrase pack is available. Use clear, neutral wording.",
      riskBlocksPersonality
        ? "Risk level requires zero personality phrases, jokes, slang, blessings, sarcasm, or success phrasing."
        : undefined
    ]
      .filter(Boolean)
      .join("\n\n")
  };
}

export function buildPersonalityPromptSection(style: ResponseStyleContext) {
  const allowed = style.allowedPhrases.length
    ? style.allowedPhrases.map((phrase) => `- ${phrase}`).join("\n")
    : "- None";
  const forbidden = style.forbiddenPhrases.length
    ? style.forbiddenPhrases.map((phrase) => `- ${phrase}`).join("\n")
    : "- None";

  return [
    `Assistant personality: ${style.assistantName}`,
    `Role label: ${style.role}.`,
    `Traits: ${style.traits.join(", ")}.`,
    `Response situation: ${style.situation}.`,
    `Risk level: ${style.riskLevel}.`,
    "",
    "Tone guidance:",
    style.guidance,
    "",
    "Allowed personality phrases for this response:",
    allowed,
    "",
    "Forbidden phrases for this response:",
    forbidden,
    "",
    "Personality rules:",
    `- Use at most ${style.maxPersonalityPhrases} personality phrase(s).`,
    "- Do not force personality phrasing.",
    "- Do not use any personality phrase unless it appears in the allowed list above.",
    "- Do not use any forbidden phrase.",
    "- Put the financial fact, required confirmation, missing detail, status, or next step first.",
    "- If structured response blocks exist, do not duplicate the full financial data in prose.",
    "- Never imply that a transfer completed unless backend state confirms execution success."
  ].join("\n");
}

export function collectAllKnownPersonalityPhrases(
  personalities: Record<AssistantId, AssistantPersonalityForStyle>
) {
  const phrases = new Set<string>();

  for (const personality of Object.values(personalities)) {
    for (const pack of Object.values(personality.phrasePacks)) {
      if (!pack) {
        continue;
      }

      for (const phrase of [
        ...flattenPhrasePack(pack),
        ...(pack.forbidden ?? [])
      ]) {
        phrases.add(phrase);
      }
    }
  }

  return [...phrases];
}

function getPhraseOccurrences(text: string, phrase: string) {
  const normalizedText = text.toLocaleLowerCase();
  const normalizedPhrase = phrase.toLocaleLowerCase();
  const ranges: Array<[start: number, end: number]> = [];
  let index = normalizedText.indexOf(normalizedPhrase);

  while (index !== -1) {
    ranges.push([index, index + normalizedPhrase.length]);
    index = normalizedText.indexOf(normalizedPhrase, index + normalizedPhrase.length);
  }

  return ranges;
}

function rangesOverlap(
  left: [start: number, end: number],
  right: [start: number, end: number]
) {
  return left[0] < right[1] && right[0] < left[1];
}

function collectPhraseUsages(text: string, phrases: string[]) {
  const claimedRanges: Array<[start: number, end: number]> = [];
  const usages: PersonalityPhraseUsage[] = [];

  for (const phrase of unique(phrases).sort((left, right) => right.length - left.length)) {
    const ranges = getPhraseOccurrences(text, phrase).filter((range) =>
      !claimedRanges.some((claimedRange) => rangesOverlap(range, claimedRange))
    );
    if (ranges.length === 0) {
      continue;
    }

    usages.push({ phrase, count: ranges.length });
    claimedRanges.push(...ranges);
  }

  return usages;
}

export function lintPersonalityUsage(
  responseText: string,
  style: ResponseStyleContext,
  allKnownPhrases: string[]
): PersonalityLintResult {
  const allowedSet = new Set(style.allowedPhrases);
  const usedKnownPhrases = collectPhraseUsages(responseText, allKnownPhrases);
  const usedAllowedPhrases = usedKnownPhrases.filter((usage) =>
    allowedSet.has(usage.phrase)
  );
  const usedPersonalityPhraseCount = usedAllowedPhrases.reduce(
    (total, usage) => total + usage.count,
    0
  );
  const disallowedPhrases = usedKnownPhrases
    .filter((usage) => !allowedSet.has(usage.phrase))
    .map((usage) => usage.phrase);
  const forbiddenPhrases = collectPhraseUsages(
    responseText,
    style.forbiddenPhrases
  ).map((usage) => usage.phrase);
  const tooManyPersonalityPhrases =
    usedPersonalityPhraseCount > style.maxPersonalityPhrases;

  return {
    valid:
      disallowedPhrases.length === 0 &&
      forbiddenPhrases.length === 0 &&
      !tooManyPersonalityPhrases,
    disallowedPhrases,
    forbiddenPhrases,
    usedAllowedPhrases,
    usedPersonalityPhraseCount,
    tooManyPersonalityPhrases
  };
}

export function buildPersonalityLintFeedback(result: PersonalityLintResult) {
  const issues: string[] = [];
  if (result.disallowedPhrases.length > 0) {
    issues.push(
      `disallowed phrases: ${result.disallowedPhrases.join(", ")}`
    );
  }
  if (result.forbiddenPhrases.length > 0) {
    issues.push(`forbidden phrases: ${result.forbiddenPhrases.join(", ")}`);
  }
  if (result.tooManyPersonalityPhrases) {
    issues.push("too many personality phrases");
  }

  return issues.join("; ");
}
