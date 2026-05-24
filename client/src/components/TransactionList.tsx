import { Link } from "react-router-dom";
import { formatCurrency, formatRelativeDate } from "../lib/format";
import type { Pagination, Transaction } from "../lib/types";
import { Button, EmptyState } from "./Primitives";

export function TransactionList({
  transactions,
  pagination,
  page,
  onPageChange,
  compact = false,
  onTransactionSelect
}: {
  transactions: Transaction[];
  pagination?: Pagination;
  page?: number;
  onPageChange?: (page: number) => void;
  compact?: boolean;
  onTransactionSelect?: (transaction: Transaction) => void;
}) {
  if (!transactions.length) {
    return (
      <EmptyState title="No transactions" message="">
        <Link className="button button-primary" to="/transfer">
          Send money
        </Link>
      </EmptyState>
    );
  }

  return (
    <div className={compact ? "transaction-list compact" : "transaction-list"}>
      {transactions.map((transaction) => {
        const isCredit = transaction.amount > 0;
        const isSelectable = Boolean(onTransactionSelect);
        return (
          <article
            className={isSelectable ? "transaction-row selectable" : "transaction-row"}
            key={transaction.id}
            role={isSelectable ? "button" : undefined}
            tabIndex={isSelectable ? 0 : undefined}
            onClick={() => onTransactionSelect?.(transaction)}
            onKeyDown={(event) => {
              if (!isSelectable) {
                return;
              }

              if (event.key === "Enter" || event.key === " ") {
                event.preventDefault();
                onTransactionSelect?.(transaction);
              }
            }}
          >
            <div
              className={isCredit ? "direction-mark direction-in" : "direction-mark direction-out"}
              aria-hidden="true"
            >
              {isCredit ? "↓" : "↑"}
            </div>
            <div className="transaction-main">
              <strong>{transaction.counterpartyEmail}</strong>
              <span>{transaction.reason || formatRelativeDate(transaction.date)}</span>
            </div>
            <div className="transaction-meta">
              <strong className={isCredit ? "amount-credit" : "amount-debit"}>
                {isCredit ? "+" : ""}
                {formatCurrency(transaction.amount)}
              </strong>
              <span>Completed</span>
            </div>
          </article>
        );
      })}
      {pagination && page && onPageChange ? (
        <div className="pagination">
          <Button
            type="button"
            variant="secondary"
            disabled={page <= 1}
            onClick={() => onPageChange(page - 1)}
          >
            Previous
          </Button>
          <span>
            Page {pagination.page} of {Math.max(1, pagination.totalPages)}
          </span>
          <Button
            type="button"
            variant="secondary"
            disabled={page >= pagination.totalPages}
            onClick={() => onPageChange(page + 1)}
          >
            Next
          </Button>
        </div>
      ) : null}
    </div>
  );
}
