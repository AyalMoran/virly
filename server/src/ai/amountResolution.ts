import { getRepositories } from "../repositories/index.js";
import { evaluateAmountExpr } from "./amountExpr.js";
import type {
  AmountExpr,
  AmountResolutionInput,
  AmountResolutionResult,
  CounterpartyMemory,
  ResolvedAmountRef
} from "./state.js";
import { normalizeCounterpartyEmail } from "./tools/counterpartyHelpers.js";

type AmountReferenceKind =
  | "last_pending_transfer"
  | "last_sent_transaction"
  | "last_received_transaction"
  | "last_answer_total"
  | "unknown";

/**
 * Recognizes compositional amount expressions in free text: arithmetic on the
 * active pending amount ("double it", "half", "×3", "כפול", "חצי", "פי 3") and
 * the discourse reference "the amount we discussed" / "הסכום שדיברנו עליו".
 *
 * Returns null for the legacy contextual vocabulary ("same amount",
 * "that amount", "what he sent me", ...) so the existing classifier handles it.
 * The model never produces a money value; this only names a source + operation.
 */
export function parseAmountExpression(rawText: string): AmountExpr | null {
  const text = rawText.trim();
  if (!text) {
    return null;
  }
  const lower = text.toLowerCase();

  if (
    /\b(the\s+)?amount\s+(we|you|i)\s+(discussed|talked\s+about|spoke\s+about|agreed\s+on)\b/i.test(
      lower
    ) ||
    /\b(the\s+)?(discussed|agreed)\s+amount\b/i.test(lower) ||
    /(הסכום שדיברנו(?: עליו)?|הסכום שעליו דיברנו|הסכום שסיכמנו|הסכום שהוזכר)/.test(
      text
    )
  ) {
    return { base: "discussed_amount" };
  }

  if (
    /\b(half(?:\s+of)?(?:\s+(?:it|that|the\s+amount))?|halve(?:\s+it)?)\b/i.test(
      lower
    ) ||
    /(חצי(?:\s+(?:מ?זה|מהסכום|ממנו))?)/.test(text)
  ) {
    return { base: "pending_amount", op: "div", operand: 2 };
  }

  if (
    /\b(double(?:\s+(?:it|that|the\s+amount))?|twice(?:\s+(?:it|that|the\s+amount))?|two\s+times)\b/i.test(
      lower
    ) ||
    /(כפול(?:\s+(?:שתיים|2))?|פי\s*2|פעמיים)/.test(text)
  ) {
    return { base: "pending_amount", op: "mul", operand: 2 };
  }

  const mulMatch =
    lower.match(/(?:[x×*]\s*|times\s+)(\d+(?:\.\d+)?)/i) ??
    text.match(/פי\s*(\d+(?:\.\d+)?)/);
  if (mulMatch) {
    const operand = Number(mulMatch[1]);
    if (Number.isFinite(operand) && operand > 0) {
      return { base: "pending_amount", op: "mul", operand };
    }
  }

  return null;
}

/**
 * Resolves the salient "amount we discussed" from memory: the most recently
 * referenced positive total/amount entity, or the active pending amount.
 */
function getSalientDiscussedAmount(
  memory: CounterpartyMemory
): number | undefined {
  const candidates: Array<{ amount: number; recency: number }> = [];

  for (const entity of memory.entities ?? []) {
    if (
      (entity.type === "total" || entity.type === "amount") &&
      typeof entity.amount === "number" &&
      Number.isFinite(entity.amount) &&
      entity.amount > 0
    ) {
      candidates.push({ amount: entity.amount, recency: entity.turnLastReferenced });
    }
  }

  const pending = memory.pendingConfirmation;
  if (pending?.status === "pending" && pending.amount > 0) {
    candidates.push({ amount: pending.amount, recency: pending.turnCreated });
  }

  candidates.sort((left, right) => right.recency - left.recency);
  return candidates[0]?.amount;
}

/**
 * Resolves the base value an AmountExpr draws from before arithmetic.
 * Only the bases producible by `parseAmountExpression` are handled here.
 */
function resolveExprBaseValue(
  input: AmountResolutionInput,
  base: AmountExpr["base"]
): number | undefined {
  if (base === "pending_amount") {
    const pending = input.counterpartyMemory.pendingConfirmation;
    return pending?.status === "pending" && pending.amount > 0
      ? pending.amount
      : undefined;
  }

  if (base === "discussed_amount") {
    return getSalientDiscussedAmount(input.counterpartyMemory);
  }

  return undefined;
}

/**
 * Resolves the most recent positive total entity for a direction, optionally
 * scoped to a counterparty email. Used by the turn-context resolver to value
 * "last_received_from"/"last_sent_to"/"answer_total" bases deterministically.
 */
function scopedTotalAmount(
  memory: CounterpartyMemory,
  direction: "received" | "sent" | "any",
  counterpartyEmail?: string
): number | undefined {
  const scopedEmail = counterpartyEmail
    ? normalizeCounterpartyEmail(counterpartyEmail)
    : undefined;
  const totals = (memory.entities ?? [])
    .filter(
      (entity) =>
        entity.type === "total" &&
        typeof entity.amount === "number" &&
        Number.isFinite(entity.amount) &&
        entity.amount > 0 &&
        (direction === "any" || entity.direction === direction) &&
        (!scopedEmail ||
          (entity.counterpartyEmail &&
            normalizeCounterpartyEmail(entity.counterpartyEmail) === scopedEmail))
    )
    .sort((left, right) => right.turnLastReferenced - left.turnLastReferenced);

  return totals[0]?.amount;
}

/**
 * Resolves the base value of a TurnDelta amount expression purely from memory
 * (no DB), then applies `evaluateAmountExpr`. Returns null when the base cannot
 * be valued. Every money value here is computed by deterministic code — the
 * model only supplied the base/op/operand and an optional source counterparty.
 */
export function resolveTurnDeltaAmount(
  memory: CounterpartyMemory,
  expr: AmountExpr,
  sourceCounterpartyEmail?: string
): number | null {
  let baseValue: number | undefined;

  if (expr.base === "pending_amount") {
    const pending = memory.pendingConfirmation;
    baseValue =
      pending?.status === "pending" && pending.amount > 0
        ? pending.amount
        : undefined;
  } else if (expr.base === "discussed_amount") {
    baseValue = getSalientDiscussedAmount(memory);
  } else if (expr.base === "answer_total") {
    baseValue = scopedTotalAmount(memory, "any", sourceCounterpartyEmail);
  } else if (expr.base === "last_received_from") {
    baseValue = scopedTotalAmount(memory, "received", sourceCounterpartyEmail);
  } else if (expr.base === "last_sent_to") {
    baseValue = scopedTotalAmount(memory, "sent", sourceCounterpartyEmail);
  }

  if (baseValue == null) {
    return null;
  }

  try {
    return evaluateAmountExpr(baseValue, expr);
  } catch {
    return null;
  }
}

function resolveAmountExpression(
  input: AmountResolutionInput,
  expr: AmountExpr
): AmountResolutionResult {
  const baseValue = resolveExprBaseValue(input, expr.base);
  if (baseValue == null) {
    return {
      status: "unresolved",
      reason:
        expr.base === "pending_amount"
          ? "no_pending_amount"
          : "no_discussed_amount"
    };
  }

  try {
    const amount = evaluateAmountExpr(baseValue, expr);
    return {
      status: "resolved",
      amount: {
        amount,
        currency: "ILS",
        source:
          expr.base === "discussed_amount"
            ? "discussed_amount"
            : "pending_confirmation",
        confidence: "high",
        explanation:
          expr.base === "discussed_amount"
            ? "Resolved amount from the discussed amount in memory."
            : "Resolved amount from the active pending transfer."
      }
    };
  } catch {
    return {
      status: "unresolved",
      reason: "invalid_amount_expression"
    };
  }
}

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
    /(מה שהוא שלח לי|מה שהוא העביר לי|מה שהיא שלחה לי|מה שהיא העבירה לי|מה שהם שלחו לי|אותו סכום שהוא שלח לי|אותו סכום שהוא העביר לי|אותה כמות שהוא שלח לי|אותה כמות שהוא העביר לי)/.test(rawText)
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
  const transaction = await getRepositories().transactions.lastForOwner({
    ownerId: input.userId,
    counterpartyEmail: normalizeCounterpartyEmail(input.counterpartyEmail),
    type: input.transactionType
  });

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

  const expr = parseAmountExpression(amountReferenceText);
  if (expr) {
    return resolveAmountExpression(input, expr);
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
