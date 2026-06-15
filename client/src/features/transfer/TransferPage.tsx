import { FormEvent, useEffect, useMemo, useState } from "react";
import { AnimatePresence, motion } from "framer-motion";
import { Link, useNavigate } from "react-router-dom";
import {
  Button,
  Card,
  ErrorBanner,
  Field,
  PageHeader,
  PageStack,
  ResponsiveGrid,
  SuccessBanner,
  TextareaField
} from "../../components/Primitives";
import { useAuth } from "../auth/AuthProvider";
import { useCurrency } from "../currency/CurrencyProvider";
import { ApiError, api } from "../../lib/api";
import { getQuickContacts } from "../../lib/contacts";
import {
  CURRENCY_LABELS,
  SUPPORTED_DISPLAY_CURRENCIES,
  convertIlsForDisplay,
  formatMoneyIn,
  isDisplayCurrency
} from "../../lib/currency";
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

  return (
    <PageStack>
      <PageHeader eyebrow="" title="Transfer" />
      <ResponsiveGrid className="transfer-layout figma-transfer-layout" variant="sidebar">
        <Card className="transfer-card figma-transfer-card">
          <AnimatePresence mode="wait" initial={false}>
            <motion.div
              key={step}
              initial={{ opacity: 0, y: 12 }}
              animate={{ opacity: 1, y: 0 }}
              exit={{
                opacity: 0,
                y: -6,
                transition: { duration: 0.12, ease: [0.4, 0, 1, 1] }
              }}
              transition={{ duration: 0.22, ease: [0.16, 1, 0.3, 1] }}
            >
          {step === "success" && result ? (
            <div className="success-panel">
              <SuccessBanner message={result.message} />
              <h2>Transfer complete</h2>
              <p>
                {result.transaction.fx
                  ? `${formatMoneyIn(
                      result.transaction.fx.enteredAmount ?? Number(amount),
                      result.transaction.fx.enteredCurrency
                    )} (${formatCurrency(Math.abs(result.transaction.amount))})`
                  : formatCurrency(Math.abs(result.transaction.amount))}{" "}
                sent to {result.transaction.counterpartyEmail}.
              </p>
              <strong>New balance: {formatAmount(result.newBalance)}</strong>
              <div className="button-row">
                <Button type="button" onClick={() => navigate("/transactions")}>
                  View transactions
                </Button>
                <Button
                  type="button"
                  variant="secondary"
                  onClick={() => {
                    setRecipientEmail("");
                    setAmount("");
                    setReason("");
                    setResult(null);
                    setQuote(null);
                    setQuoteNotice("");
                    setStep("form");
                  }}
                >
                  New transfer
                </Button>
              </div>
            </div>
          ) : step === "review" ? (
            <div className="review-panel">
              <h2>Confirm</h2>
              {quoteNotice ? <ErrorBanner message={quoteNotice} /> : null}
              <dl className="review-list">
                <div>
                  <dt>Recipient</dt>
                  <dd>
                    <Link
                      className="counterparty-link"
                      to={`/users/${encodeURIComponent(recipientEmail.trim().toLowerCase())}`}
                    >
                      {recipientEmail.trim().toLowerCase()}
                    </Link>
                  </dd>
                </div>
                <div>
                  <dt>Amount</dt>
                  <dd>
                    <span className="review-amount">
                      {formatMoneyIn(Number(amount), currency)}
                      {currency !== "ILS" ? ` ${currency}` : ""}
                    </span>
                    {quote ? <TransferQuoteSmallPrint quote={quote} /> : null}
                  </dd>
                </div>
                <div>
                  <dt>Reason</dt>
                  <dd>{reason.trim() || "No reason provided"}</dd>
                </div>
                <div>
                  <dt>Projected balance</dt>
                  <dd>{formatCurrency(projectedBalance)}</dd>
                </div>
              </dl>
              <div className="button-row">
                <Button type="button" disabled={isSubmitting} onClick={handleSubmit}>
                  {isSubmitting ? "Sending..." : "Confirm and send"}
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
            <form className="form-stack" onSubmit={handleReview} noValidate>
              {errors.form ? <ErrorBanner message={errors.form} /> : null}
              <Field
                label="Recipient email"
                name="recipientEmail"
                type="email"
                value={recipientEmail}
                error={errors.recipientEmail}
                placeholder="recipient@example.com"
                onChange={(event) => setRecipientEmail(event.target.value)}
              />
              {recentCounterparties.length ? (
                <div className="contact-picker-grid" aria-label="Recent counterparties">
                  {recentCounterparties.map((contact) => (
                    <button
                      key={contact.email}
                      className={
                        recipientEmail === contact.email
                          ? "contact-picker-item selected"
                          : "contact-picker-item"
                      }
                      type="button"
                      onClick={() => setRecipientEmail(contact.email)}
                    >
                      <span aria-hidden="true">{contact.avatar}</span>
                      <strong>{contact.email}</strong>
                    </button>
                  ))}
                </div>
              ) : null}
              <div className="amount-currency-row">
                <Field
                  label="Amount"
                  name="amount"
                  type="number"
                  inputMode="decimal"
                  min="0.01"
                  step="0.01"
                  value={amount}
                  error={errors.amount}
                  onChange={(event) => setAmount(event.target.value)}
                />
                <label className="field" htmlFor="transfer-currency">
                  <span className="field-label">Currency</span>
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
                </label>
              </div>
              {currency !== "ILS" && !rates ? (
                <p className="field-hint">
                  Currency conversion is unavailable right now; the exact ILS
                  amount will be quoted before you confirm.
                </p>
              ) : null}
              <TextareaField
                label="Reason"
                name="reason"
                value={reason}
                maxLength={200}
                error={errors.reason}
                hint={`${reason.length}/200 characters`}
                onChange={(event) => setReason(event.target.value)}
              />
              <Button type="submit" disabled={isSubmitting}>
                {isSubmitting ? "Preparing quote..." : "Review transfer"}
              </Button>
            </form>
          )}
            </motion.div>
          </AnimatePresence>
        </Card>
        <Card className="balance-aside figma-balance-aside">
          <p className="eyebrow">Balance</p>
          <strong>{formatAmount(balance)}</strong>
          {step !== "success" ? (
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
