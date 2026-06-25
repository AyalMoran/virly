import { motion } from "framer-motion";
import { Link } from "react-router-dom";

import { amountInWords } from "../lib/amount-words";
import {
  CURRENCY_LABELS,
  SUPPORTED_DISPLAY_CURRENCIES,
  isDisplayCurrency,
} from "../lib/currency";
import type { DisplayCurrency } from "../lib/types";

const CURRENCY_WORD: Record<DisplayCurrency, string> = {
  ILS: "Shekels",
  USD: "Dollars",
  EUR: "Euros",
};
const CURRENCY_GLYPH: Record<DisplayCurrency, string> = { ILS: "₪", USD: "$", EUR: "€" };

/** Best-effort human name from an email local-part, for the signature line. */
function signatureName(email?: string | null): string {
  if (!email) {
    return "Virly Account";
  }
  const pretty = email
    .split("@")[0]
    .split(/[._-]+/)
    .filter(Boolean)
    .map((part) => `${part.charAt(0).toUpperCase()}${part.slice(1)}`)
    .join(" ");
  return pretty || email;
}

export type TransferChequeMode = "form" | "review" | "success";

export type TransferChequeErrors = {
  recipientEmail?: string;
  amount?: string;
  reason?: string;
};

export interface TransferChequeProps {
  /** "form" = editable inputs; "review"/"success" = read-only (success stamps "Cleared"). */
  mode: TransferChequeMode;
  /** Cheque serial number shown top-right and in the MICR line. */
  chequeNumber: string;
  /** Pre-formatted issue date (e.g. "Jun 25, 2026"). */
  issueDate: string;
  /** Account holder's email; the signature line shows a name derived from it. */
  holderEmail?: string | null;
  /** Display currency; drives the glyph, amount-in-words, and currency picker. */
  currency: DisplayCurrency;
  /** Finalized recipient shown (linked) in review/success mode. */
  payee: string;
  /** Controlled recipient email (form mode). */
  recipientEmail: string;
  /** Controlled amount string (drives the figure + words). */
  amount: string;
  /** Controlled memo (form mode) / static memo (review, success). */
  reason: string;
  errors?: TransferChequeErrors;
  onRecipientEmailChange?: (value: string) => void;
  onAmountChange?: (value: string) => void;
  onReasonChange?: (value: string) => void;
  onCurrencyChange?: (currency: DisplayCurrency) => void;
}

/**
 * Virly's signature transfer surface: a bank cheque (watermark, guilloche,
 * "pay to the order of", amount-in-words, authorized-signature line, MICR
 * strip). In "form" mode the payee/amount/memo/currency are editable; "review"
 * and "success" render read-only, with a "Cleared" stamp on success.
 */
export function TransferCheque({
  mode,
  chequeNumber,
  issueDate,
  holderEmail,
  currency,
  payee,
  recipientEmail,
  amount,
  reason,
  errors = {},
  onRecipientEmailChange,
  onAmountChange,
  onReasonChange,
  onCurrencyChange,
}: TransferChequeProps) {
  const isForm = mode === "form";
  const isReview = mode === "review";
  const isSuccess = mode === "success";

  const holderName = signatureName(holderEmail);
  const numericAmount = Number(amount);
  const hasAmount =
    amount.trim() !== "" && Number.isFinite(numericAmount) && numericAmount > 0;
  const words = hasAmount ? amountInWords(numericAmount) : "";
  const numericFigure = new Intl.NumberFormat("en-US", {
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  }).format(hasAmount ? numericAmount : 0);

  return (
    <article className="cheque" aria-label="Cheque">
      <span className="cheque-watermark" aria-hidden="true">
        V
      </span>
      <span className="cheque-guilloche" aria-hidden="true" />

      {isSuccess ? (
        <motion.span
          className="cheque-stamp"
          aria-hidden="true"
          initial={{ opacity: 0, scale: 1.8, rotate: -24 }}
          animate={{ opacity: 0.92, scale: 1, rotate: -12 }}
          transition={{ delay: 0.18, type: "spring", stiffness: 340, damping: 13, mass: 0.7 }}
        >
          <span className="cheque-stamp-main">Cleared</span>
          <span className="cheque-stamp-sub">Virly · Paid</span>
        </motion.span>
      ) : null}

      <header className="cheque-head">
        <div className="cheque-brand">
          <span className="cheque-logo" aria-hidden="true">
            V
          </span>
          <span className="cheque-brandname">
            Virly
            <small>Savings &amp; Trust</small>
          </span>
        </div>
        <div className="cheque-meta">
          <span className="cheque-no">No. {chequeNumber}</span>
          <span className="cheque-dateline">
            <span className="cheque-microlabel">Date</span> {issueDate}
          </span>
        </div>
      </header>

      <div className="cheque-payline">
        <span className="cheque-microlabel">Pay to the order of</span>
        <div className="cheque-payfields">
          {isForm ? (
            <input
              className="cheque-input cheque-payee"
              id="recipientEmail"
              name="recipientEmail"
              type="email"
              aria-label="Recipient email"
              value={recipientEmail}
              placeholder="recipient@example.com"
              aria-invalid={Boolean(errors.recipientEmail)}
              onChange={(event) => onRecipientEmailChange?.(event.target.value)}
            />
          ) : (
            <Link
              className="cheque-payee cheque-payee-static counterparty-link"
              to={`/users/${encodeURIComponent(payee)}`}
            >
              {payee}
            </Link>
          )}
          <div className={`cheque-amountbox${errors.amount && isForm ? " has-error" : ""}`}>
            <span className="cheque-amountbox-cur" aria-hidden="true">
              {CURRENCY_GLYPH[currency]}
            </span>
            {isForm ? (
              <input
                className="cheque-input cheque-amount-input"
                id="amount"
                name="amount"
                type="number"
                inputMode="decimal"
                min="0.01"
                step="0.01"
                aria-label={`Amount in ${CURRENCY_WORD[currency]}`}
                value={amount}
                placeholder="0.00"
                aria-invalid={Boolean(errors.amount)}
                onChange={(event) => onAmountChange?.(event.target.value)}
              />
            ) : (
              <span className="cheque-amount-static">{numericFigure}</span>
            )}
          </div>
        </div>
        {isForm && errors.recipientEmail ? (
          <span className="cheque-error">{errors.recipientEmail}</span>
        ) : null}
        {isForm && errors.amount ? (
          <span className="cheque-error cheque-error-amount">{errors.amount}</span>
        ) : null}
      </div>

      <div className="cheque-words">
        <span className={words ? "cheque-words-text" : "cheque-words-text is-empty"}>
          {words || "—"}
        </span>
        <span className="cheque-words-rule" aria-hidden="true" />
        <span className="cheque-words-cur">{CURRENCY_WORD[currency]}</span>
      </div>

      {isForm ? (
        <div className="cheque-currency">
          <label className="cheque-microlabel" htmlFor="transfer-currency">
            Currency
          </label>
          <select
            id="transfer-currency"
            name="currency"
            value={currency}
            onChange={(event) => {
              const next = event.target.value;
              if (isDisplayCurrency(next)) {
                onCurrencyChange?.(next);
              }
            }}
          >
            {SUPPORTED_DISPLAY_CURRENCIES.map((code) => (
              <option key={code} value={code}>
                {CURRENCY_LABELS[code]}
              </option>
            ))}
          </select>
        </div>
      ) : null}

      <div className="cheque-foot">
        <div className="cheque-memo">
          <span className="cheque-microlabel">Memo</span>
          {isForm ? (
            <input
              className="cheque-input cheque-memo-input"
              id="reason"
              name="reason"
              maxLength={200}
              aria-label="Memo"
              value={reason}
              placeholder="What's it for?"
              aria-invalid={Boolean(errors.reason)}
              onChange={(event) => onReasonChange?.(event.target.value)}
            />
          ) : (
            <span className="cheque-memo-static">{reason.trim() || "—"}</span>
          )}
          {isForm && errors.reason ? <span className="cheque-error">{errors.reason}</span> : null}
        </div>
        <div className="cheque-sign">
          <span className={isForm ? "cheque-sign-script is-ghost" : "cheque-sign-script"}>
            {isForm ? "sign on send" : holderName}
          </span>
          <span className="cheque-sign-rule" aria-hidden="true" />
          <span className="cheque-microlabel">Authorized signature</span>
        </div>
      </div>

      <div className="cheque-micr" aria-hidden="true">
        ⑆012345678⑆ {chequeNumber}⑈ 04⑇
      </div>
    </article>
  );
}
