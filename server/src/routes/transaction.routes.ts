import { Router } from "express";
import rateLimit from "express-rate-limit";
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

// Public hold endpoints are token-guarded; cap attempts to blunt token guessing.
const heldLimiter = rateLimit({ windowMs: 60_000, max: 20, standardHeaders: true, legacyHeaders: false });

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
  } catch (error) {
    // Fail-open + logged: scoring failure degrades to a normal send (never block).
    console.error(
      "[fraud] transfer risk scoring failed; sending without a hold check:",
      error instanceof Error ? error.message : error
    );
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
    const reviewUrl = `${config.serverUrl}/api/transactions/held/confirm?id=${id}&token=${token}`;
    await sendTransferHoldEmail(sender.email, {
      amount: parsed.amount,
      currency,
      recipientEmail: parsed.recipientEmail,
      reasons: risk.reasons,
      reviewUrl
    });
    return {
      status: "held",
      heldId: id,
      level: risk.level,
      reasons: risk.reasons,
      expiresAt: expiresAt.toISOString(),
      message: "This transfer was held for review. Check your email to confirm it."
    };
  } catch (error) {
    // Fail-open + logged: a high-risk transfer could not be held (e.g. AI Postgres
    // unavailable), so it proceeds as a normal send. This is the fraud control
    // disabling itself — surface it loudly for alerting.
    console.error(
      "[fraud] FAIL-OPEN: a high-risk transfer was NOT held due to an error; it will execute normally:",
      error instanceof Error ? error.message : error
    );
    return null;
  }
}

// Public hold confirm/cancel: the GET link from the email only RENDERS a page
// (so an email prefetch/link-scanner can't move money); the actual state change
// is a POST carrying the token in the form body (kept out of the URL/logs).
function esc(s: string): string {
  return s.replace(/[&<>"']/g, (c) =>
    ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" })[c] as string
  );
}
function htmlPage(title: string, body: string): string {
  return `<!doctype html><meta charset="utf-8"><title>${esc(title)}</title><body style="font-family:system-ui,sans-serif;max-width:480px;margin:48px auto;padding:0 16px"><h1 style="font-size:20px">${esc(title)}</h1>${body}</body>`;
}
function actionForm(path: string, id: string, token: string, label: string): string {
  return `<form method="post" action="${path}" style="display:inline-block;margin-right:12px"><input type="hidden" name="id" value="${esc(id)}"><input type="hidden" name="token" value="${esc(token)}"><button type="submit">${esc(label)}</button></form>`;
}

router.get("/held/confirm", heldLimiter, (req, res) => {
  const id = String(req.query.id ?? "");
  const token = String(req.query.token ?? "");
  if (!id || !token) {
    return res.status(400).type("html").send(htmlPage("Invalid link", "<p>Missing id or token.</p>"));
  }
  return res
    .type("html")
    .send(
      htmlPage(
        "Review your held transfer",
        `<p>This transfer was held for review. Choose an action:</p>${actionForm(
          "/api/transactions/held/confirm",
          id,
          token,
          "Confirm and send"
        )}${actionForm("/api/transactions/held/cancel", id, token, "Cancel transfer")}`
      )
    );
});

router.post("/held/confirm", heldLimiter, async (req, res, next) => {
  try {
    const id = String((req.body?.id ?? req.query.id) ?? "");
    const token = String((req.body?.token ?? req.query.token) ?? "");
    if (!id || !token) {
      return res.status(400).type("html").send(htmlPage("Invalid", "<p>Missing id or token.</p>"));
    }
    const result = await confirmHold(id, token);
    const page = (code: number, title: string, msg: string) =>
      res.status(code).type("html").send(htmlPage(title, `<p>${esc(msg)}</p>`));
    switch (result.status) {
      case "executed":
        return page(200, "Transfer sent", "Your transfer has been confirmed and sent.");
      case "already_confirmed":
        return page(200, "Already confirmed", "This transfer was already confirmed.");
      case "in_progress":
        return page(409, "In progress", "This transfer is already being processed.");
      case "expired":
        return page(410, "Link expired", "This confirmation link has expired.");
      case "cancelled":
        return page(409, "Cancelled", "This transfer was cancelled.");
      case "failed":
        return page(400, "Could not send", result.message);
      default:
        return page(404, "Invalid link", "This confirmation link is not valid.");
    }
  } catch (error) {
    next(error);
  }
});

router.post("/held/cancel", heldLimiter, async (req, res, next) => {
  try {
    const id = String((req.body?.id ?? req.query.id) ?? "");
    const token = String((req.body?.token ?? req.query.token) ?? "");
    if (!id || !token) {
      return res.status(400).type("html").send(htmlPage("Invalid", "<p>Missing id or token.</p>"));
    }
    const cancelled = await cancelHold(id, token);
    return res
      .type("html")
      .send(
        htmlPage(
          cancelled ? "Transfer cancelled" : "No change",
          cancelled
            ? "<p>This transfer has been cancelled.</p>"
            : "<p>This transfer could not be cancelled (already actioned or invalid).</p>"
        )
      );
  } catch (error) {
    next(error);
  }
});
//#endregion
export default router;
