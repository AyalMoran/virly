import { Link } from "react-router-dom";
import { EmptyState } from "../../components/Primitives";
import type { AccountSummary, Transaction } from "../../lib/types";

const SHORT_DATE = new Intl.DateTimeFormat("en-US", { month: "short", day: "numeric" });
const FULL_DATE = new Intl.DateTimeFormat("en-US", { month: "short", day: "numeric", year: "numeric" });

function shortDate(value?: string) {
  return value ? SHORT_DATE.format(new Date(value)) : "—";
}

export function AccountStatement({
  summary,
  holderName,
  accountNumber,
  formatAmount,
  onSelectTransaction
}: {
  summary: AccountSummary;
  holderName: string;
  accountNumber: string;
  formatAmount: (amountIls: number) => string;
  onSelectTransaction: (transaction: Transaction) => void;
}) {
  const closing = summary.balance;

  // Newest first, so the running balance can be walked back from the closing
  // figure: the most recent entry leaves the account at the closing balance.
  const lines = [...summary.transactions].sort((a, b) => {
    const left = a.date ? Date.parse(a.date) : 0;
    const right = b.date ? Date.parse(b.date) : 0;
    return right - left;
  });

  let moneyIn = 0;
  let moneyOut = 0;
  for (const line of lines) {
    if (line.amount >= 0) {
      moneyIn += line.amount;
    } else {
      moneyOut += Math.abs(line.amount);
    }
  }

  // Balance after each entry, then the balance carried in before the oldest.
  let undone = 0;
  const balanceAfter = lines.map((line) => {
    const after = Number((closing - undone).toFixed(2));
    undone += line.amount;
    return after;
  });
  const broughtForward = Number((closing - (moneyIn - moneyOut)).toFixed(2));

  const dated = lines.filter((line) => line.date);
  const period = dated.length
    ? `${FULL_DATE.format(new Date(dated[dated.length - 1].date!))} – ${FULL_DATE.format(
        new Date(dated[0].date!)
      )}`
    : null;
  const asOf = FULL_DATE.format(new Date(dated[0]?.date ?? Date.now()));

  return (
    <section className="statement" aria-label="Account statement">
      <span className="statement-flourish" aria-hidden="true" />

      <header className="statement-masthead">
        <div className="statement-brand">
          <span className="statement-logo" aria-hidden="true">V</span>
          <span className="statement-brandname">
            Virly
            <small>Savings &amp; Trust</small>
          </span>
        </div>
        <div className="statement-meta">
          <span className="statement-doc">Account Statement</span>
          <span className="statement-metaline">Holder · {holderName}</span>
          <span className="statement-metaline">Account · {accountNumber}</span>
          {period ? <span className="statement-metaline">Period · {period}</span> : null}
        </div>
      </header>

      <div className="statement-rule" aria-hidden="true" />

      <div className="statement-summary">
        <div className="statement-closing">
          <span className="statement-microlabel">Closing balance</span>
          <strong>{formatAmount(closing)}</strong>
          <span className="statement-asof">as of {asOf}</span>
        </div>
        <div className="statement-figures">
          <div>
            <span>Brought forward</span>
            <strong>{formatAmount(broughtForward)}</strong>
          </div>
          <div className="is-in">
            <span>Money in</span>
            <strong>+{formatAmount(moneyIn)}</strong>
          </div>
          <div className="is-out">
            <span>Money out</span>
            <strong>−{formatAmount(moneyOut)}</strong>
          </div>
        </div>
      </div>

      <div className="statement-rule" aria-hidden="true" />

      {lines.length ? (
        <div className="statement-ledger">
          <div className="statement-ledger-head" aria-hidden="true">
            <span className="statement-cell-date">Date</span>
            <span className="statement-cell-desc">Description</span>
            <span className="statement-col-out">Paid out</span>
            <span className="statement-col-in">Paid in</span>
            <span className="statement-cell-bal">Balance</span>
          </div>
          {lines.map((line, index) => {
            const isCredit = line.amount >= 0;
            const magnitude = Math.abs(line.amount);
            return (
              <button
                type="button"
                key={line.id}
                className="statement-line"
                onClick={() => onSelectTransaction(line)}
                aria-label={`${shortDate(line.date)}, ${line.counterpartyEmail}, ${
                  isCredit ? "received" : "sent"
                } ${formatAmount(magnitude)}, balance ${formatAmount(balanceAfter[index])}`}
              >
                <span className="statement-cell-date">{shortDate(line.date)}</span>
                <span className="statement-cell-desc">
                  <strong>{line.counterpartyEmail}</strong>
                  {line.reason ? <small>{line.reason}</small> : null}
                </span>
                <span className={`statement-cell-amount ${isCredit ? "is-in" : "is-out"}`}>
                  {isCredit ? "+" : "−"}
                  {formatAmount(magnitude)}
                </span>
                <span className="statement-cell-bal">{formatAmount(balanceAfter[index])}</span>
              </button>
            );
          })}
        </div>
      ) : (
        <EmptyState
          title="No transactions on this statement"
          message="Money you send or receive will appear here as ledger entries."
        >
          <Link className="button button-primary" to="/transfer">
            Make a transfer
          </Link>
        </EmptyState>
      )}

      <div className="statement-rule statement-rule-end" aria-hidden="true" />

      <footer className="statement-foot">
        <span>
          End of statement · {lines.length} {lines.length === 1 ? "entry" : "entries"}
        </span>
        <Link to="/transactions" className="statement-viewall">
          View all transactions
        </Link>
      </footer>
    </section>
  );
}
