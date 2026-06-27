import { Router } from "express";
import { z } from "zod";
import { requireAuth } from "../middleware/auth.js";
import { AppError } from "../utils/app-error.js";
import {
  assertSupportedCurrency,
  buildTransferQuote,
  getCurrentRates,
  type SupportedCurrency,
  type TransferFxQuote
} from "../services/fx.service.js";
import {
  executeTransfer,
  type TransferFxMetadata
} from "../services/transfer.service.js";
import { recordTransferRiskFlag, scoreTransfer } from "../fraud/service.js";
import { cancelHold, confirmHold, createHold, shouldHold } from "../fraud/holds.js";
import { sendTransferHoldEmail } from "../services/email.service.js";
import { getRepositories } from "../repositories/index.js";
import { config } from "../config.js";
import { transactionQueryService } from "../services/transactionQuery.service.js";
import { getPaginationMeta, parsePagination } from "../utils/pagination.js";
import { toTransactionDto } from "../utils/transaction-dto.js";

const router = Router();

//#region Schemas
const transferSchema = z.object({
  recipientEmail: z.string().email(),
  amount: z.number().positive("Amount must be greater than 0."),
  currency: z.string().optional(),
  reason: z.string().max(200, "Reason must be at most 200 characters.").optional(),
  quote: z
    .object({
      rate: z.number().positive(),
      fetchedAt: z.string()
    })
    .optional()
});

const quoteSchema = z.object({
  amount: z.number().positive("Amount must be greater than 0."),
  currency: z.string()
});
//#endregion

//#region Helpers
/**
 * Resolves the entered amount/currency into the authoritative ILS amount and
 * fx ledger metadata. Non-ILS transfers must echo the server-issued quote so
 * the executed rate always matches the confirmed one (409 otherwise).
 */
export function resolveTransferAmount(
  input: {
    amount: number;
    currency: SupportedCurrency;
    quote?: { rate: number; fetchedAt: string };
  },
  currentQuote: TransferFxQuote | null
): { amountIls: number; fx: TransferFxMetadata | null } {
  if (input.currency === "ILS") {
    return { amountIls: input.amount, fx: null };
  }

  if (!currentQuote) {
    throw new AppError(503, "Exchange rates are unavailable.");
  }

  if (!input.quote) {
    throw new AppError(
      400,
      "A current exchange-rate quote is required for non-ILS transfers.",
      { code: "QUOTE_REQUIRED" }
    );
  }

  if (
    input.quote.rate !== currentQuote.rate ||
    input.quote.fetchedAt !== currentQuote.rateFetchedAt
  ) {
    throw new AppError(
      409,
      "The exchange rate has changed since this transfer was quoted. Review the refreshed quote before confirming.",
      { code: "QUOTE_RATE_CHANGED" }
    );
  }

  return {
    amountIls: currentQuote.amountIls,
    fx: {
      enteredCurrency: input.currency,
      enteredAmount: currentQuote.enteredAmount,
      exchangeRateUsed: currentQuote.rate,
      exchangeRateFetchedAt: new Date(currentQuote.rateFetchedAt)
    }
  };
}
//#endregion

//#region Routes
router.get("/", requireAuth, async (req, res, next) => {
  try {
    const { page, limit } = parsePagination(req.query);
    const counterparty = z.string().email().optional().parse(req.query.counterparty);

    const { transactions, total } = await transactionQueryService.listForOwner({
      ownerId: req.userId!,
      counterpartyEmail: counterparty ? counterparty.toLowerCase() : undefined,
      page,
      limit
    });

    return res.json({
      transactions: transactions.map(toTransactionDto),
      pagination: getPaginationMeta(page, limit, total)
    });
  } catch (error) {
    next(error);
  }
});

router.post("/quote", requireAuth, async (req, res, next) => {
  try {
    const parsed = quoteSchema.parse(req.body);
    const currency = assertSupportedCurrency(parsed.currency);

    if (currency === "ILS") {
      return res.json({
        quote: {
          enteredAmount: parsed.amount,
          enteredCurrency: "ILS",
          amountIls: parsed.amount,
          rate: 1,
          rateFetchedAt: null,
          rateValidForDate: null,
          baseCurrency: "ILS",
          provider: null
        }
      });
    }

    const snapshot = await getCurrentRates();
    return res.json({ quote: buildTransferQuote(parsed.amount, currency, snapshot) });
  } catch (error) {
    next(error);
  }
});

router.post("/", requireAuth, async (req, res, next) => {
  try {
    if (!req.userId) {
      return res.status(401).json({ message: "Authentication required." });
    }

    const parsed = transferSchema.parse(req.body);
    const currency = assertSupportedCurrency(parsed.currency ?? "ILS");

    const currentQuote =
      currency === "ILS"
        ? null
        : buildTransferQuote(parsed.amount, currency, await getCurrentRates());

    const { amountIls, fx } = resolveTransferAmount(
      { amount: parsed.amount, currency, quote: parsed.quote },
      currentQuote
    );

    // Fraud gate: when enabled, hold a risky transfer for email confirmation
    // instead of executing it now. Scoring/holding failures degrade to a normal
    // (flagged) transfer — infra problems must never block a legitimate send.
    if (config.fraud.holdLevel !== "off") {
      const held = await tryHoldTransfer(req.userId, parsed, amountIls, currency, fx);
      if (held) return res.status(202).json(held);
    }

    const result = await executeTransfer({
      senderId: req.userId,
      recipientEmail: parsed.recipientEmail,
      amount: amountIls,
      reason: parsed.reason,
      fx
    });

    // Best-effort fraud flag (post-commit; never affects the transfer).
    await recordTransferRiskFlag({
      userId: req.userId,
      recipientEmail: parsed.recipientEmail,
      amount: amountIls,
      transactionId: result.transaction.id,
      alreadyExecuted: true
    });

    return res.status(201).json(result);
  } catch (error) {
    next(error);
  }
});

/**
 * Score a transfer and, if it meets the hold policy, hold it for email
 * confirmation instead of executing. Returns the held response, or null to fall
 * through to a normal transfer. Any failure returns null (degrade, never block).
 */
async function tryHoldTransfer(
  userId: string,
  parsed: z.infer<typeof transferSchema>,
  amountIls: number,
  currency: SupportedCurrency,
  fx: TransferFxMetadata | null | undefined
): Promise<Record<string, unknown> | null> {
  let risk;
  try {
    risk = await scoreTransfer({
      userId,
      recipientEmail: parsed.recipientEmail,
      amount: amountIls,
      alreadyExecuted: false
    });
  } catch {
    return null;
  }
  if (!shouldHold(risk.level)) return null;

  try {
    const sender = await getRepositories().users.findById(userId);
    if (!sender) return null;
    const { id, token, expiresAt } = await createHold({
      userId,
      recipientEmail: parsed.recipientEmail,
      amount: amountIls,
      currency,
      reason: parsed.reason,
      fx,
      score: risk.score,
      level: risk.level,
      reasons: risk.reasons
    });
    const base = config.serverUrl;
    const confirmUrl = `${base}/api/transactions/held/confirm?id=${id}&token=${token}`;
    const cancelUrl = `${base}/api/transactions/held/cancel?id=${id}&token=${token}`;
    await sendTransferHoldEmail(sender.email, {
      amount: parsed.amount,
      currency,
      recipientEmail: parsed.recipientEmail,
      reasons: risk.reasons,
      confirmUrl,
      cancelUrl
    });
    return {
      status: "held",
      heldId: id,
      level: risk.level,
      reasons: risk.reasons,
      expiresAt: expiresAt.toISOString(),
      message: "This transfer was held for review. Check your email to confirm it."
    };
  } catch {
    // Holding failed (e.g. AI Postgres unavailable) — let the transfer proceed.
    return null;
  }
}

// Public, token-guarded: the sender clicks these from the hold email.
router.get("/held/confirm", async (req, res, next) => {
  try {
    const id = String(req.query.id ?? "");
    const token = String(req.query.token ?? "");
    if (!id || !token) throw new AppError(400, "Missing confirmation id or token.");
    const result = await confirmHold(id, token);
    switch (result.status) {
      case "executed":
        return res.json({
          status: "confirmed",
          transactionId: result.transactionId,
          newBalance: result.newBalance,
          message: "Transfer confirmed and sent."
        });
      case "already_confirmed":
        return res.json({
          status: "confirmed",
          transactionId: result.transactionId,
          message: "This transfer was already confirmed."
        });
      case "in_progress":
        return res.status(409).json({ status: "in_progress", message: "This transfer is being processed." });
      case "expired":
        return res.status(410).json({ status: "expired", message: "This confirmation link has expired." });
      case "cancelled":
        return res.status(409).json({ status: "cancelled", message: "This transfer was cancelled." });
      case "failed":
        return res.status(400).json({ status: "failed", message: result.message });
      default:
        return res.status(404).json({ status: "invalid", message: "Invalid confirmation link." });
    }
  } catch (error) {
    next(error);
  }
});

router.get("/held/cancel", async (req, res, next) => {
  try {
    const id = String(req.query.id ?? "");
    const token = String(req.query.token ?? "");
    if (!id || !token) throw new AppError(400, "Missing confirmation id or token.");
    const cancelled = await cancelHold(id, token);
    return res.json(
      cancelled
        ? { status: "cancelled", message: "Transfer cancelled." }
        : { status: "noop", message: "This transfer could not be cancelled (already actioned or invalid)." }
    );
  } catch (error) {
    next(error);
  }
});
//#endregion
export default router;
