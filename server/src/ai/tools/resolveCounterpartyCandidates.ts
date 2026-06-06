import { Transaction } from "../../models/Transaction.js";
import { createToolResult } from "../toolResults.js";
import type { RuntimeToolResult, CounterpartyRef, ToolContext } from "../state.js";
import {
  getCounterpartyDisplays,
  getDisplayOrFallback,
  normalizeCounterpartyEmail
} from "./counterpartyHelpers.js";

type Candidate = {
  email: string;
  maskedLabel: string;
  userLabel: string;
  displayName: string;
  confidence: "low" | "medium" | "high";
  score: number;
  matchReasons: string[];
};

function normalizeSearchText(value: string) {
  return value.trim().toLowerCase().replace(/\s+/g, " ");
}

function extractQuery(context: ToolContext) {
  const slotText =
    context.requestSlots?.counterparty?.explicitEmail ??
    context.requestSlots?.counterparty?.explicitName ??
    context.requestSlots?.counterparty?.referenceText;
  if (slotText) {
    return slotText;
  }

  const message = context.message.trim();
  const englishMatch = message.match(
    /\b(?:with|to|from|for)\s+([A-Z][\p{L}'-]*(?:\s+[A-Z][\p{L}'-]*){0,2})/iu
  );
  if (englishMatch?.[1]) {
    return englishMatch[1];
  }

  const mixedHebrewEnglishMatch = message.match(
    /(?:עם|מול|ל|אל|מ)\s*([A-Z][A-Za-z'-]*(?:\s+[A-Z][A-Za-z'-]*){0,2})/
  );
  if (mixedHebrewEnglishMatch?.[1]) {
    return mixedHebrewEnglishMatch[1];
  }

  const hebrewMatch = message.match(
    /(?:עם|מול|ל|אל|מ)\s*([\u0590-\u05ff]{2,}(?:\s+[\u0590-\u05ff]{2,}){0,2})/
  );
  if (hebrewMatch?.[1]) {
    return hebrewMatch[1];
  }

  return message;
}

function isLastCounterpartyReference(query: string) {
  const normalized = query.trim().toLowerCase();
  return (
    /\b(he|him|she|her|they|them|this person|that person|same person|same recipient|last recipient)\b/i.test(
      normalized
    ) ||
    /(?<![\u0590-\u05ff])(הוא|היא|הם|הן|ממנו|ממנה|מהם|מהן|לו|לה|אליו|אליה|איתו|איתה|מולו|מולה|מולם|מולן|אותו|אותה|הנמען הזה|האדם הזה)(?![\u0590-\u05ff])/.test(
      query
    )
  );
}

function createResolvedMemoryCounterpartyResult(
  counterparty: CounterpartyRef
): RuntimeToolResult {
  const email = normalizeCounterpartyEmail(counterparty.email);
  const maskedLabel = counterparty.maskedLabel;
  const displayName =
    counterparty.displayName ?? counterparty.userLabel ?? maskedLabel;
  const userLabel = counterparty.userLabel ?? `${displayName} (${email})`;

  return createToolResult({
    toolName: "resolveCounterpartyCandidates",
    status: "ok",
    data: {
      kind: "counterparty",
      status: "resolved",
      counterparty: {
        email,
        maskedLabel,
        userLabel,
        displayName
      },
      candidates: [
        {
          id: email,
          label: userLabel,
          value: email
        }
      ]
    },
    summary: `Resolved counterparty from conversation memory: ${displayName} (${maskedLabel}).`,
    userSummary: `Resolved counterparty: ${userLabel}.`,
    metadata: {
      recordCount: 1,
      resolutionStatus: "resolved",
      counterpartyEmail: email,
      maskedLabel,
      displayName,
      counterpartyCandidates: [
        {
          counterpartyEmail: email,
          maskedLabel,
          displayName,
          confidence: "high"
        }
      ]
    },
    memoryUpdates: {
      counterparties: [
        {
          counterpartyId: email,
          emailFullForBackendOnly: email,
          emailMasked: maskedLabel,
          displayName,
          relation: "both",
          source: "transaction"
        }
      ]
    }
  });
}

function scoreCandidate(input: {
  query: string;
  email: string;
  maskedLabel: string;
  displayName: string;
  memoryRef?: CounterpartyRef;
}) {
  const query = normalizeSearchText(input.query);
  const email = normalizeCounterpartyEmail(input.email);
  const localPart = email.split("@")[0] ?? email;
  const masked = normalizeSearchText(input.maskedLabel);
  const displayName = normalizeSearchText(input.displayName);
  const nameParts = displayName.split(" ").filter(Boolean);
  const reasons: string[] = [];
  let score = 0;

  if (email === query) {
    score = 100;
    reasons.push("exact_email");
  } else if (masked === query) {
    score = 95;
    reasons.push("exact_masked_email");
  } else if (displayName === query && displayName !== masked) {
    score = 90;
    reasons.push("exact_name");
  } else if (nameParts.includes(query) && displayName !== masked) {
    score = 85;
    reasons.push("exact_name_part");
  } else if (displayName.includes(query) && displayName !== masked) {
    score = 75;
    reasons.push("partial_name");
  } else if (localPart.includes(query)) {
    score = 60;
    reasons.push("email_local_part");
  } else if (
    input.memoryRef &&
    (
      input.memoryRef.maskedLabel.toLowerCase() === query ||
      input.memoryRef.userLabel?.toLowerCase() === query ||
      input.memoryRef.displayName?.toLowerCase() === query ||
      input.memoryRef.aliases?.some((alias) => alias.toLowerCase() === query)
    )
  ) {
    score = 70;
    reasons.push("conversation_memory");
  }

  return { score, reasons };
}

export async function resolveCounterpartyCandidates(
  context: ToolContext
): Promise<RuntimeToolResult> {
  const query = extractQuery(context);
  const memoryRefs = context.counterpartyMemory?.mentionedCounterparties ?? [];
  if (isLastCounterpartyReference(query) && context.counterpartyMemory?.lastCounterparty) {
    return createResolvedMemoryCounterpartyResult(
      context.counterpartyMemory.lastCounterparty
    );
  }

  const transactions = await Transaction.find({ ownerId: context.userId })
    .sort({ createdAt: -1 })
    .limit(200)
    .select("counterpartyEmail amount type createdAt");
  const transactionEmails = [
    ...new Set(transactions.map((transaction) => normalizeCounterpartyEmail(transaction.counterpartyEmail)))
  ];
  const allEmails = [
    ...new Set([
      ...memoryRefs.map((counterparty) => normalizeCounterpartyEmail(counterparty.email)),
      ...transactionEmails
    ])
  ];

  if (allEmails.length === 0) {
    return createToolResult({
      toolName: "resolveCounterpartyCandidates",
      status: "empty",
      data: {
        kind: "counterparty",
        status: "unresolved",
        candidates: []
      },
      summary: "No counterparties were found in your account history.",
      metadata: {
        recordCount: 0,
        resolutionStatus: "unresolved"
      }
    });
  }

  const displays = await getCounterpartyDisplays(allEmails);
  const memoryByEmail = new Map(
    memoryRefs.map((counterparty) => [normalizeCounterpartyEmail(counterparty.email), counterparty])
  );
  const candidates: Candidate[] = allEmails
    .map((email) => {
      const display = getDisplayOrFallback(displays, email);
      const score = scoreCandidate({
        query,
        email,
        maskedLabel: display.emailMasked,
        displayName: display.displayName,
        memoryRef: memoryByEmail.get(email)
      });

      const confidence: Candidate["confidence"] =
        score.score >= 85 ? "high" : score.score >= 70 ? "medium" : "low";

      return {
        email,
        maskedLabel: display.emailMasked,
        userLabel: display.userLabel,
        displayName: display.displayName,
        score: score.score,
        confidence,
        matchReasons: score.reasons
      };
    })
    .filter((candidate) => candidate.score > 0)
    .sort((left, right) => right.score - left.score)
    .slice(0, 5);

  if (candidates.length === 0) {
    return createToolResult({
      toolName: "resolveCounterpartyCandidates",
      status: "empty",
      data: {
        kind: "counterparty",
        status: "unresolved",
        candidates: []
      },
      summary: `No matching counterparty was found for "${query}".`,
      metadata: {
        recordCount: 0,
        resolutionStatus: "unresolved"
      }
    });
  }

  const highConfidenceCandidates = candidates.filter(
    (candidate) => candidate.confidence === "high"
  );
  const resolved =
    candidates.length === 1 && highConfidenceCandidates.length === 1
      ? candidates[0]
      : undefined;

  if (resolved) {
    return createToolResult({
      toolName: "resolveCounterpartyCandidates",
      status: "ok",
      data: {
        kind: "counterparty",
        status: "resolved",
        counterparty: {
          email: resolved.email,
          maskedLabel: resolved.maskedLabel,
          userLabel: resolved.userLabel,
          displayName: resolved.displayName
        },
        candidates: [
          {
            id: resolved.email,
            label: resolved.userLabel,
            value: resolved.email
          }
        ]
      },
      summary: `Resolved counterparty: ${resolved.displayName} (${resolved.maskedLabel}).`,
      userSummary: `Resolved counterparty: ${resolved.userLabel}.`,
      metadata: {
        recordCount: 1,
        resolutionStatus: "resolved",
        counterpartyEmail: resolved.email,
        maskedLabel: resolved.maskedLabel,
        displayName: resolved.displayName,
        counterpartyCandidates: [
          {
            counterpartyEmail: resolved.email,
            maskedLabel: resolved.maskedLabel,
            displayName: resolved.displayName,
            confidence: resolved.confidence
          }
        ]
      },
      memoryUpdates: {
        counterparties: [
          {
            counterpartyId: resolved.email,
            emailFullForBackendOnly: resolved.email,
            emailMasked: resolved.maskedLabel,
            displayName: resolved.displayName,
            relation: "both",
            source: "transaction"
          }
        ]
      }
    });
  }

  return createToolResult({
    toolName: "resolveCounterpartyCandidates",
    status: "ok",
    data: {
      kind: "counterparty",
      status: "ambiguous",
      candidates: candidates.map((candidate) => ({
        id: candidate.email,
        label: candidate.userLabel,
        value: candidate.email
      }))
    },
    summary: `I found multiple possible counterparties: ${candidates
      .map((candidate) => `${candidate.displayName} (${candidate.maskedLabel})`)
      .join("; ")}.`,
    userSummary: `I found multiple possible counterparties: ${candidates
      .map((candidate) => candidate.userLabel)
      .join("; ")}.`,
    metadata: {
      recordCount: candidates.length,
      resolutionStatus: "ambiguous",
      counterpartyCandidates: candidates.map((candidate) => ({
        counterpartyEmail: candidate.email,
        maskedLabel: candidate.maskedLabel,
        displayName: candidate.displayName,
        confidence: candidate.confidence
        }))
    }
  });
}
