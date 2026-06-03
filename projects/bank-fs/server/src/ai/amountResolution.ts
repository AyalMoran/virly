import { Transaction } from "../models/Transaction.js";
import type {
  AmountResolutionInput,
  AmountResolutionResult,
  ResolvedAmountRef
} from "./state.js";
import { normalizeCounterpartyEmail } from "./tools/counterpartyHelpers.js";

type AmountReferenceKind =
  | "last_pending_transfer"
  | "last_sent_transaction"
  | "last_received_transaction"
  | "last_answer_total"
  | "unknown";

export function classifyAmountReference(rawText: string): AmountReferenceKind {
  const normalized = rawText.toLowerCase();

  if (
    /\b(that|this)\s+(amount|total|net)\b/i.test(normalized) ||
    /\b(the\s+)?(last|previous)\s+(amount|total|net)\b/i.test(normalized) ||
    /(הסכום הזה|הסכום ההוא|הסכום האחרון|הסה"כ הזה|הסך הזה|הנטו הזה)/.test(
      rawText
    )
  ) {
    return "last_answer_total";
  }

  if (
    /\b(?:he|she|they)\s+sent\s+me\b/i.test(normalized) ||
    /\bwhat\s+(?:he|she|they)\s+sent\s+me\b/i.test(normalized) ||
    /(מה שהוא שלח לי|מה שהיא שלחה לי|מה שהם שלחו לי)/.test(rawText)
  ) {
    return "last_received_transaction";
  }

  if (
    /\bi\s+sent\s+(?:him|her|them)\b/i.test(normalized) ||
    /\bwhat\s+i\s+sent\s+(?:him|her|them)\b/i.test(normalized) ||
    /(מה ששלחתי לו|מה ששלחתי לה|מה ששלחתי להם)/.test(rawText)
  ) {
    return "last_sent_transaction";
  }

  if (
    /\b(same amount|same amount again|same as before|same as last time)\b/i.test(
      normalized
    ) ||
    /(אותה כמות|אותו סכום|כמו קודם|כמו פעם שעברה)/.test(rawText)
  ) {
    return "last_pending_transfer";
  }

  return "unknown";
}

function sourceForTotalDirection(
  direction: "sent" | "received" | "both" | "net" | undefined
): ResolvedAmountRef["source"] {
  if (direction === "sent") {
    return "last_answer_total_sent";
  }

  if (direction === "received") {
    return "last_answer_total_received";
  }

  return "last_answer_total_net";
}

function getScopedTotalEntities(input: AmountResolutionInput) {
  const resolvedCounterpartyEmail = input.resolvedCounterparty?.email
    ? normalizeCounterpartyEmail(input.resolvedCounterparty.email)
    : undefined;
  const totalEntities = (input.counterpartyMemory.entities ?? [])
    .filter(
      (entity) =>
        entity.type === "total" &&
        typeof entity.amount === "number" &&
        Number.isFinite(entity.amount)
    )
    .sort((left, right) => {
      if (left.turnLastReferenced !== right.turnLastReferenced) {
        return right.turnLastReferenced - left.turnLastReferenced;
      }

      return right.turnIntroduced - left.turnIntroduced;
    });
  const scopedTotals = resolvedCounterpartyEmail
    ? totalEntities.filter(
        (entity) =>
          entity.counterpartyEmail &&
          normalizeCounterpartyEmail(entity.counterpartyEmail) ===
            resolvedCounterpartyEmail
      )
    : totalEntities;

  return scopedTotals;
}

function hasPositiveAnswerTotal(input: AmountResolutionInput) {
  return getScopedTotalEntities(input).some(
    (entity) =>
      typeof entity.amount === "number" &&
      Number.isFinite(entity.amount) &&
      entity.amount > 0
  );
}

function resolveLatestAnswerTotal(input: AmountResolutionInput): AmountResolutionResult {
  const scopedTotals = getScopedTotalEntities(input);
  const latestTotal = scopedTotals[0];

  if (!latestTotal) {
    return {
      status: "unresolved",
      reason: input.resolvedCounterparty?.email
        ? "no_answer_total_for_counterparty"
        : "no_answer_total_available"
    };
  }

  if (!latestTotal.amount || latestTotal.amount <= 0) {
    return {
      status: "unresolved",
      reason: "invalid_answer_total_amount"
    };
  }

  return {
    status: "resolved",
    amount: {
      amount: latestTotal.amount,
      currency: "ILS",
      source: sourceForTotalDirection(latestTotal.direction),
      confidence: "high",
      explanation: "Resolved amount from the latest total answer in memory."
    }
  };
}

async function resolveLatestTransactionAmount(input: {
  userId: string;
  counterpartyEmail: string;
  transactionType: "credit" | "debit";
  source: ResolvedAmountRef["source"];
  explanation: string;
}): Promise<AmountResolutionResult> {
  const transaction = await Transaction.findOne({
    ownerId: input.userId,
    counterpartyEmail: normalizeCounterpartyEmail(input.counterpartyEmail),
    type: input.transactionType
  })
    .sort({ createdAt: -1 })
    .select("amount type");

  if (!transaction) {
    return {
      status: "unresolved",
      reason:
        input.transactionType === "credit"
          ? "no_received_transaction_for_counterparty"
          : "no_sent_transaction_for_counterparty"
    };
  }

  const amount = Math.abs(transaction.amount);

  return Number.isFinite(amount) && amount > 0
    ? {
        status: "resolved",
        amount: {
          amount,
          currency: "ILS",
          source: input.source,
          confidence: "high",
          explanation: input.explanation
        }
      }
    : {
        status: "unresolved",
        reason: "invalid_transaction_amount"
      };
}

export async function resolveContextualAmount(
  input: AmountResolutionInput
): Promise<AmountResolutionResult> {
  const amountReferenceText = input.transferDraft.amountReferenceText?.trim();

  if (!amountReferenceText) {
    return {
      status: "unresolved",
      reason: "missing_amount_reference"
    };
  }

  const kind = classifyAmountReference(amountReferenceText);

  if (kind === "last_answer_total") {
    return resolveLatestAnswerTotal(input);
  }

  if (kind === "last_pending_transfer") {
    const pending = input.counterpartyMemory.pendingConfirmation;
    if (pending?.status === "pending" && pending.amount > 0) {
      return {
        status: "resolved",
        amount: {
          amount: pending.amount,
          currency: "ILS",
          source: "last_pending_transfer",
          confidence: "high",
          explanation: "Resolved amount from the active pending transfer."
        }
      };
    }

    if (hasPositiveAnswerTotal(input)) {
      return {
        status: "unresolved",
        reason: "ambiguous_amount_scope"
      };
    }
  }

  const counterpartyEmail = input.resolvedCounterparty?.email;
  if (!counterpartyEmail) {
    return {
      status: "unresolved",
      reason: "missing_resolved_counterparty"
    };
  }

  if (kind === "last_received_transaction") {
    return resolveLatestTransactionAmount({
      userId: input.userId,
      counterpartyEmail,
      transactionType: "credit",
      source: "last_received_transaction",
      explanation:
        "Resolved amount from the latest received transaction with the counterparty."
    });
  }

  if (kind === "last_sent_transaction" || kind === "last_pending_transfer") {
    return resolveLatestTransactionAmount({
      userId: input.userId,
      counterpartyEmail,
      transactionType: "debit",
      source: "last_sent_transaction",
      explanation:
        "Resolved amount from the latest sent transaction with the counterparty."
    });
  }

  return {
    status: "unresolved",
    reason: "unsupported_amount_reference"
  };
}
