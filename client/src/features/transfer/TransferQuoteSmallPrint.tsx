import { formatCurrency } from "../../lib/format";
import type { TransferQuote } from "../../lib/types";

/**
 * Small-print disclosure under a non-ILS transfer confirmation: the actual
 * ILS ledger amount, the rate used and the rate date. ILS quotes render
 * nothing — no conversion happens for them.
 */
export function TransferQuoteSmallPrint({ quote }: { quote: TransferQuote }) {
  if (quote.enteredCurrency === "ILS") {
    return null;
  }

  const rateDate =
    quote.rateValidForDate ??
    (quote.rateFetchedAt ? quote.rateFetchedAt.slice(0, 10) : "today");

  return (
    <p className="transfer-quote-small-print">
      Actual transfer amount: {formatCurrency(quote.amountIls)} ILS, using{" "}
      {quote.enteredCurrency} → ILS rate ({quote.rate}) from {rateDate}
    </p>
  );
}
