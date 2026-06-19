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

    const result = await executeTransfer({
      senderId: req.userId,
      recipientEmail: parsed.recipientEmail,
      amount: amountIls,
      reason: parsed.reason,
      fx
    });

    return res.status(201).json(result);
  } catch (error) {
    next(error);
  }
});
//#endregion
export default router;
