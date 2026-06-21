import { useMemo } from "react";
import { Link } from "react-router-dom";
import { motion, type Variants } from "framer-motion";
import { ArrowDownLeft, ArrowUpRight } from "lucide-react";

import { useCurrency } from "../features/currency/CurrencyProvider";
import { formatDate } from "../lib/format";
import type { Transaction } from "../lib/types";

const EASE = [0.16, 1, 0.3, 1] as const;

// Same "printing" choreography as the 404 slip: reveal top-to-bottom, stagger
// the lines, then slam the status stamp down once the paper has settled.
const paper: Variants = {
  hidden: { opacity: 0, y: 16, clipPath: "inset(0 0 100% 0)" },
  shown: {
    opacity: 1,
    y: 0,
    clipPath: "inset(0 0 0% 0)",
    transition: {
      duration: 0.8,
      ease: EASE,
      when: "beforeChildren",
      delayChildren: 0.18,
      staggerChildren: 0.06
    }
  }
};

const line: Variants = {
  hidden: { opacity: 0, y: 8 },
  shown: { opacity: 1, y: 0, transition: { duration: 0.45, ease: EASE } }
};

const stamp: Variants = {
  hidden: { opacity: 0, scale: 1.8, rotate: -24 },
  shown: {
    opacity: 0.9,
    scale: 1,
    rotate: -11,
    transition: { delay: 0.85, type: "spring", stiffness: 340, damping: 13, mass: 0.7 }
  }
};

const actions: Variants = {
  hidden: { opacity: 0, y: 10 },
  shown: { opacity: 1, y: 0, transition: { delay: 1, duration: 0.5, ease: EASE } }
};

function ReceiptRow({ label, value, mono }: { label: string; value: string; mono?: boolean }) {
  return (
    <motion.div className="tr-row" variants={line}>
      <span className="tr-row-key">{label}</span>
      <span className="tr-row-dots" aria-hidden="true" />
      <span className={mono ? "tr-row-val tr-row-val-id" : "tr-row-val"}>{value}</span>
    </motion.div>
  );
}

export function TransactionReceipt({
  transaction,
  onClose
}: {
  transaction: Transaction;
  onClose: () => void;
}) {
  const { formatAmount } = useCurrency();

  const isCredit = transaction.amount > 0;
  const magnitude = Math.abs(transaction.amount);
  const sign = isCredit ? "+" : "−"; // proper minus glyph
  const amountText = `${sign}${formatAmount(magnitude)}`;
  const counterparty = transaction.counterpartyEmail;
  const fx = transaction.fx;

  // A unique barcode per receipt: bar/space widths derived from the real
  // transaction id, so no two receipts print the same pattern.
  const bars = useMemo(() => {
    const seed = `${transaction.id}-VIRLY`;
    const widths: number[] = [];
    for (let i = 0; i < seed.length; i += 1) {
      const code = seed.charCodeAt(i);
      widths.push((code % 3) + 1);
      widths.push(((code >> 2) % 3) + 1);
    }
    return widths;
  }, [transaction.id]);

  return (
    <div className="tr-stage">
      <button type="button" className="tr-close" onClick={onClose} aria-label="Close receipt">
        <span aria-hidden="true">&times;</span>
      </button>

      <div className="tr-shadow">
        <motion.article className="tr-receipt" variants={paper} initial="hidden" animate="shown">
          <motion.header className="tr-merchant" variants={line}>
            <span className="tr-logo" aria-hidden="true">
              V
            </span>
            <span className="tr-brand">Virly</span>
            <span className="tr-merchant-sub">Savings &amp; Trust</span>
            <span className="tr-merchant-meta">Customer Receipt · Cleared Instantly</span>
          </motion.header>

          <div className="tr-divider" aria-hidden="true" />

          <motion.div className="tr-hero" variants={line}>
            <span className={`tr-direction ${isCredit ? "is-credit" : "is-debit"}`}>
              <span className="tr-direction-mark" aria-hidden="true">
                {isCredit ? <ArrowDownLeft /> : <ArrowUpRight />}
              </span>
              {isCredit ? "Money received" : "Money sent"}
            </span>

            <p className={`tr-amount ${isCredit ? "is-credit" : "is-debit"}`}>
              {amountText}
              <motion.span className="tr-stamp" variants={stamp} aria-hidden="true">
                <span className="tr-stamp-main">{isCredit ? "Received" : "Paid"}</span>
                <span className="tr-stamp-sub">Virly · Cleared</span>
              </motion.span>
            </p>

            <p className="tr-status-note">Settled — funds available immediately.</p>
          </motion.div>

          <div className="tr-divider" aria-hidden="true" />

          <motion.div className="tr-rows" variants={line}>
            <ReceiptRow label={isCredit ? "From" : "To"} value={counterparty} />
            <ReceiptRow label="Memo" value={transaction.reason?.trim() || "—"} />
            <ReceiptRow label="Date" value={formatDate(transaction.date)} />
            {fx?.enteredAmount != null ? (
              <ReceiptRow
                label="Entered as"
                value={`${fx.enteredAmount} ${fx.enteredCurrency}`}
              />
            ) : null}
            <ReceiptRow label="Auth code" value={transaction.id} mono />
          </motion.div>

          <div className="tr-divider" aria-hidden="true" />

          <motion.div className="tr-totals" variants={line}>
            <div className="tr-row">
              <span className="tr-row-key">Subtotal</span>
              <span className="tr-row-dots" aria-hidden="true" />
              <span className="tr-row-val">{formatAmount(magnitude)}</span>
            </div>
            <div className="tr-row">
              <span className="tr-row-key">Transfer fee</span>
              <span className="tr-row-dots" aria-hidden="true" />
              <span className="tr-row-val">{formatAmount(0)}</span>
            </div>
            <div className="tr-row tr-grand">
              <span className="tr-row-key">Total</span>
              <span className="tr-row-dots" aria-hidden="true" />
              <span className={`tr-row-val ${isCredit ? "is-credit" : "is-debit"}`}>
                {amountText}
              </span>
            </div>
          </motion.div>

          <div className="tr-divider" aria-hidden="true" />

          <motion.div className="tr-barcode" variants={line} aria-hidden="true">
            {bars.map((width, index) => (
              <span
                key={index}
                className={index % 2 === 0 ? "tr-bar" : "tr-space"}
                style={{ flexGrow: width }}
              />
            ))}
          </motion.div>
          <motion.p className="tr-barcode-caption" variants={line} aria-hidden="true">
            ★ T H A N K — Y O U ★
          </motion.p>

          <motion.footer className="tr-receipt-footer" variants={line}>
            No fees, ever. Keep this receipt for your records.
          </motion.footer>
        </motion.article>
      </div>

      <motion.div className="tr-actions" variants={actions} initial="hidden" animate="shown">
        <button type="button" className="button button-primary tr-cta" onClick={onClose}>
          Done
        </button>
        <Link
          to={`/users/${encodeURIComponent(counterparty)}`}
          className="button button-secondary tr-cta"
          onClick={onClose}
        >
          View profile
        </Link>
      </motion.div>
    </div>
  );
}
