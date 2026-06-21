import { FormEvent, useEffect, useMemo, useState } from "react";
import { AnimatePresence, motion } from "framer-motion";
import { Link, useNavigate } from "react-router-dom";
import {
  Button,
  Card,
  ErrorBanner,
  PageHeader,
  PageStack,
  ResponsiveGrid,
  SuccessBanner
} from "../../components/Primitives";
import { useAuth } from "../auth/AuthProvider";
import { useCurrency } from "../currency/CurrencyProvider";
import { ApiError, api } from "../../lib/api";
import { getQuickContacts } from "../../lib/contacts";
import {
  CURRENCY_LABELS,
  SUPPORTED_DISPLAY_CURRENCIES,
  convertIlsForDisplay,
  isDisplayCurrency
} from "../../lib/currency";
import { amountInWords } from "../../lib/amount-words";
import { formatCurrency } from "../../lib/format";
import type {
  AccountSummary,
  DisplayCurrency,
  TransferQuote,
  TransferResponse
} from "../../lib/types";
import {
  validateAmount,
  validateEmail,
  validateReason
} from "../../lib/validation";
import { TransferQuoteSmallPrint } from "./TransferQuoteSmallPrint";

type TransferErrors = {
  recipientEmail?: string;
  amount?: string;
  reason?: string;
  form?: string;
};

const CURRENCY_WORD: Record<DisplayCurrency, string> = {
  ILS: "Shekels",
  USD: "Dollars",
  EUR: "Euros"
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

export function TransferPage() {
  const auth = useAuth();
  const { currency: displayCurrency, rates, formatAmount } = useCurrency();
  const navigate = useNavigate();
  const [recipientEmail, setRecipientEmail] = useState("");
  const [amount, setAmount] = useState("");
  const [currency, setCurrency] = useState<DisplayCurrency>(displayCurrency);
  const [reason, setReason] = useState("");
  const [errors, setErrors] = useState<TransferErrors>({});
  const [step, setStep] = useState<"form" | "review" | "success">("form");
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [summary, setSummary] = useState<AccountSummary | null>(null);
  const [quote, setQuote] = useState<TransferQuote | null>(null);
  const [quoteNotice, setQuoteNotice] = useState("");
  const [result, setResult] = useState<TransferResponse | null>(null);

  useEffect(() => {
    let active = true;
    const prefillRecipient = sessionStorage.getItem("virly-prefill-recipient");

    if (prefillRecipient) {
      setRecipientEmail(prefillRecipient);
      sessionStorage.removeItem("virly-prefill-recipient");
    }

    api.accountSummary(1, 10).then((response) => {
      if (active) {
        setSummary(response);
      }
    });

    return () => {
      active = false;
    };
  }, []);

  const numericAmount = Number(amount);
  const balance = summary?.balance ?? auth.user?.balance ?? 0;

  // The balance is ILS; for non-ILS input compare against its converted
  // value. This is a UX convenience only — the server validates in ILS.
  const balanceInEnteredCurrency = useMemo(() => {
    if (currency === "ILS") {
      return balance;
    }

    return rates ? convertIlsForDisplay(balance, currency, rates.rates) : undefined;
  }, [balance, currency, rates]);

  // Authoritative when a server quote exists; a client-side estimate before
  // review so the projection stays useful while typing.
  const amountIls = useMemo(() => {
    if (currency === "ILS") {
      return Number.isFinite(numericAmount) ? numericAmount : 0;
    }

    if (quote && quote.enteredCurrency === currency && quote.enteredAmount === numericAmount) {
      return quote.amountIls;
    }

    if (rates && Number.isFinite(numericAmount)) {
      const rate = rates.rates[currency];
      return rate > 0 ? Math.round((numericAmount / rate) * 100) / 100 : 0;
    }

    return 0;
  }, [currency, numericAmount, quote, rates]);

  const projectedBalance = Number((balance - amountIls).toFixed(2));

  const recentCounterparties = useMemo(
    () => getQuickContacts(summary?.transactions ?? []),
    [summary?.transactions]
  );

  function validateDraft() {
    const normalizedRecipient = recipientEmail.trim().toLowerCase();
    const nextErrors: TransferErrors = {
      recipientEmail: validateEmail(recipientEmail),
      amount: validateAmount(amount, balanceInEnteredCurrency),
      reason: validateReason(reason)
    };

    if (normalizedRecipient && normalizedRecipient === auth.user?.email) {
      nextErrors.recipientEmail = "You cannot transfer money to yourself.";
    }

    setErrors(nextErrors);
    return !nextErrors.recipientEmail && !nextErrors.amount && !nextErrors.reason;
  }

  async function handleReview(event: FormEvent) {
    event.preventDefault();
    if (!validateDraft()) {
      return;
    }

    setQuoteNotice("");

    if (currency === "ILS") {
      setQuote(null);
      setStep("review");
      return;
    }

    try {
      setIsSubmitting(true);
      const response = await api.transferQuote({
        amount: Number(amount),
        currency
      });
      setQuote(response.quote);
      setStep("review");
    } catch (error) {
      setErrors({
        form:
          error instanceof ApiError && error.status === 503
            ? "Currency conversion is currently unavailable. Try again later or send the transfer in ILS."
            : error instanceof Error
              ? error.message
              : "Unable to prepare the transfer quote."
      });
    } finally {
      setIsSubmitting(false);
    }
  }

  async function handleSubmit() {
    if (!validateDraft()) {
      setStep("form");
      return;
    }

    try {
      setIsSubmitting(true);
      setErrors({});
      const response = await api.transfer({
        recipientEmail,
        amount: Number(amount),
        ...(currency !== "ILS" && quote?.rateFetchedAt
          ? {
              currency,
              quote: { rate: quote.rate, fetchedAt: quote.rateFetchedAt }
            }
          : {}),
        reason
      });
      setResult(response);
      auth.updateBalance(response.newBalance);
      setStep("success");
    } catch (error) {
      if (error instanceof ApiError && error.status === 409) {
        // The daily rate changed between quote and confirmation: refresh the
        // quote and ask the user to confirm the updated ILS amount.
        try {
          const refreshed = await api.transferQuote({
            amount: Number(amount),
            currency
          });
          setQuote(refreshed.quote);
          setQuoteNotice(
            "The exchange rate was updated. Review the refreshed amount below and confirm again."
          );
        } catch {
          setErrors({ form: "Unable to refresh the exchange-rate quote." });
          setStep("form");
        }
        return;
      }

      if (error instanceof ApiError) {
        setErrors({
          recipientEmail:
            error.status === 404 || error.message.includes("Recipient")
              ? error.message
              : error.issues.recipientEmail,
          amount:
            error.message.includes("Insufficient") || error.message.includes("amount")
              ? error.message
              : error.issues.amount,
          reason: error.issues.reason,
          form:
            error.status === 404 || error.status === 400 ? undefined : error.message
        });
      } else {
        setErrors({ form: "Unable to complete transfer." });
      }

      setStep("form");
    } finally {
      setIsSubmitting(false);
    }
  }

  function resetForm() {
    setRecipientEmail("");
    setAmount("");
    setReason("");
    setResult(null);
    setQuote(null);
    setQuoteNotice("");
    setErrors({});
    setStep("form");
  }

  const isForm = step === "form";
  const isReview = step === "review";
  const isSuccess = step === "success";

  const chequeNumber = useMemo(() => String(Math.floor(10000 + Math.random() * 89999)), []);
  const issueDate = useMemo(
    () =>
      new Intl.DateTimeFormat("en-US", {
        year: "numeric",
        month: "short",
        day: "2-digit"
      }).format(new Date()),
    []
  );
  const holderName = signatureName(auth.user?.email);

  const payee = (isSuccess ? result?.transaction.counterpartyEmail ?? recipientEmail : recipientEmail)
    .trim()
    .toLowerCase();
  const hasAmount = amount.trim() !== "" && Number.isFinite(numericAmount) && numericAmount > 0;
  const words = hasAmount ? amountInWords(numericAmount) : "";
  const numericFigure = new Intl.NumberFormat("en-US", {
    minimumFractionDigits: 2,
    maximumFractionDigits: 2
  }).format(hasAmount ? numericAmount : 0);

  const cheque = (
    <article className="cheque" aria-label="Cheque">
      <span className="cheque-watermark" aria-hidden="true">V</span>
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
          <span className="cheque-logo" aria-hidden="true">V</span>
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
              onChange={(event) => setRecipientEmail(event.target.value)}
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
                onChange={(event) => setAmount(event.target.value)}
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
                setCurrency(next);
                setQuote(null);
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
              onChange={(event) => setReason(event.target.value)}
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

  return (
    <PageStack>
      <PageHeader eyebrow="Transfer" title="Write a cheque" />
      <ResponsiveGrid className="cheque-layout" variant="sidebar">
        <div className="cheque-panel">
          <AnimatePresence mode="wait" initial={false}>
            <motion.div
              key={step}
              className="cheque-step"
              initial={{ opacity: 0, y: 12 }}
              animate={{ opacity: 1, y: 0 }}
              exit={{ opacity: 0, y: -6, transition: { duration: 0.12, ease: [0.4, 0, 1, 1] } }}
              transition={{ duration: 0.24, ease: [0.16, 1, 0.3, 1] }}
            >
              {isForm ? (
                <form className="cheque-shell" onSubmit={handleReview} noValidate>
                  {errors.form ? <ErrorBanner message={errors.form} /> : null}
                  {cheque}
                  {currency !== "ILS" && !rates ? (
                    <p className="cheque-hint">
                      Currency conversion is unavailable right now; the exact ILS amount will be
                      quoted before you confirm.
                    </p>
                  ) : null}
                  {recentCounterparties.length ? (
                    <div className="cheque-payeebook" aria-label="Recent payees">
                      <span className="cheque-microlabel">Recent payees</span>
                      <div className="cheque-payeebook-grid">
                        {recentCounterparties.map((contact) => (
                          <button
                            key={contact.email}
                            type="button"
                            className={
                              recipientEmail === contact.email
                                ? "cheque-payee-chip selected"
                                : "cheque-payee-chip"
                            }
                            onClick={() => setRecipientEmail(contact.email)}
                          >
                            <span aria-hidden="true">{contact.avatar}</span>
                            <strong>{contact.email}</strong>
                          </button>
                        ))}
                      </div>
                    </div>
                  ) : null}
                  <div className="cheque-actions">
                    <Button type="submit" disabled={isSubmitting}>
                      {isSubmitting ? "Preparing quote…" : "Review cheque"}
                    </Button>
                  </div>
                </form>
              ) : isReview ? (
                <div className="cheque-shell">
                  {cheque}
                  <div className="cheque-reviewnote">
                    {quoteNotice ? <ErrorBanner message={quoteNotice} /> : null}
                    {quote ? <TransferQuoteSmallPrint quote={quote} /> : null}
                    <p className="cheque-projection-line">
                      Projected balance after sending{" "}
                      <strong>{formatCurrency(projectedBalance)}</strong>
                    </p>
                  </div>
                  <div className="cheque-actions">
                    <Button type="button" disabled={isSubmitting} onClick={handleSubmit}>
                      {isSubmitting ? "Sending…" : "Sign & send"}
                    </Button>
                    <Button
                      type="button"
                      variant="secondary"
                      disabled={isSubmitting}
                      onClick={() => {
                        setQuoteNotice("");
                        setStep("form");
                      }}
                    >
                      Edit
                    </Button>
                  </div>
                </div>
              ) : (
                <div className="cheque-shell">
                  {cheque}
                  {result ? (
                    <div className="cheque-successnote">
                      <SuccessBanner message={result.message} />
                      <p className="cheque-projection-line">
                        New balance <strong>{formatAmount(result.newBalance)}</strong>
                      </p>
                    </div>
                  ) : null}
                  <div className="cheque-actions">
                    <Button type="button" onClick={() => navigate("/transactions")}>
                      View transactions
                    </Button>
                    <Button type="button" variant="secondary" onClick={resetForm}>
                      Write another
                    </Button>
                  </div>
                </div>
              )}
            </motion.div>
          </AnimatePresence>
        </div>
        <Card className="balance-aside figma-balance-aside">
          <p className="eyebrow">Balance</p>
          <strong>{formatAmount(balance)}</strong>
          {!isSuccess ? (
            <div className="projection">
              <span>After transfer</span>
              <strong>{formatAmount(Math.max(projectedBalance, 0))}</strong>
            </div>
          ) : null}
        </Card>
      </ResponsiveGrid>
    </PageStack>
  );
}
