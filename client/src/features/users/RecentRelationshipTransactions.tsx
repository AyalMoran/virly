import React, { useEffect, useState } from "react";
import { ArrowDownLeft, ArrowUpRight } from "lucide-react";
import { Button, Skeleton } from "../../components/Primitives";
import { TransactionDetailsDialog } from "../../components/TransactionDetailsDialog";
import { api } from "../../lib/api";
import { formatRelativeDate } from "../../lib/format";
import type { Pagination, RelationshipTransaction, Transaction } from "../../lib/types";
import { useCurrency } from "../currency/CurrencyProvider";

/**
 * Shapes a relationship transaction (positive amount + direction) into the
 * viewer-relative form the shared details dialog expects (signed amount).
 */
function toDialogTransaction(
  transaction: RelationshipTransaction,
  counterpartyEmail: string
): Transaction {
  return {
    id: transaction.id,
    amount:
      transaction.direction === "received" ? transaction.amount : -transaction.amount,
    counterpartyEmail,
    reason: transaction.description ?? null,
    date: transaction.createdAt
  };
}

function TransactionRows({
  transactions,
  viewedName,
  onTransactionSelect
}: {
  transactions: RelationshipTransaction[];
  viewedName: string;
  onTransactionSelect: (transaction: RelationshipTransaction) => void;
}) {
  const { formatAmount } = useCurrency();

  return (
    <div className="transaction-list">
      {transactions.map((transaction) => {
        const isReceived = transaction.direction === "received";
        return (
          <article
            className="transaction-row selectable"
            key={transaction.id}
            role="button"
            tabIndex={0}
            onClick={() => onTransactionSelect(transaction)}
            onKeyDown={(event) => {
              if (event.key === "Enter" || event.key === " ") {
                event.preventDefault();
                onTransactionSelect(transaction);
              }
            }}
          >
            <div
              className={
                isReceived ? "direction-mark direction-in" : "direction-mark direction-out"
              }
              aria-hidden="true"
            >
              {isReceived ? <ArrowDownLeft /> : <ArrowUpRight />}
            </div>
            <div className="transaction-main">
              <strong>
                {isReceived ? `Received from ${viewedName}` : `Sent to ${viewedName}`}
              </strong>
              <span>
                {transaction.description || formatRelativeDate(transaction.createdAt)}
              </span>
            </div>
            <div className="transaction-meta">
              <strong className={isReceived ? "amount-credit" : "amount-debit"}>
                {isReceived ? "+" : "-"}
                {formatAmount(transaction.amount)}
              </strong>
              <span>Completed</span>
            </div>
          </article>
        );
      })}
    </div>
  );
}

export function RecentRelationshipTransactions({
  idOrEmail,
  initialTransactions,
  totalCount,
  viewedName,
  viewedEmail
}: {
  idOrEmail: string;
  initialTransactions: RelationshipTransaction[];
  totalCount: number;
  viewedName: string;
  viewedEmail?: string;
}) {
  const [page, setPage] = useState<number | null>(null);
  const [transactions, setTransactions] = useState(initialTransactions);
  const [pagination, setPagination] = useState<Pagination | null>(null);
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState("");
  const [selectedTransaction, setSelectedTransaction] = useState<Transaction | null>(null);

  useEffect(() => {
    if (page === null) {
      return;
    }

    let active = true;
    setIsLoading(true);
    api
      .userRelationshipTransactions(idOrEmail, page, 10)
      .then((response) => {
        if (active) {
          setTransactions(response.transactions);
          setPagination(response.pagination);
          setError("");
        }
      })
      .catch((loadError: unknown) => {
        if (active) {
          setError(
            loadError instanceof Error
              ? loadError.message
              : "Unable to load shared transactions."
          );
        }
      })
      .finally(() => {
        if (active) {
          setIsLoading(false);
        }
      });

    return () => {
      active = false;
    };
  }, [idOrEmail, page]);

  const hasMore = totalCount > initialTransactions.length;

  return (
    <section className="card" aria-label={`Shared transactions with ${viewedName}`}>
      <div className="section-heading">
        <h2>Shared activity</h2>
      </div>
      {error ? <p className="field-error">{error}</p> : null}
      {isLoading ? (
        <Skeleton rows={3} />
      ) : (
        <TransactionRows
          transactions={transactions}
          viewedName={viewedName}
          onTransactionSelect={(transaction) =>
            setSelectedTransaction(
              toDialogTransaction(transaction, viewedEmail ?? idOrEmail)
            )
          }
        />
      )}
      {pagination ? (
        <nav className="pagination" aria-label="Shared transactions pages">
          <Button
            type="button"
            variant="secondary"
            disabled={isLoading || (page ?? 1) <= 1}
            onClick={() => setPage((current) => Math.max(1, (current ?? 1) - 1))}
          >
            Previous
          </Button>
          <span>
            Page {pagination.page} of {Math.max(1, pagination.totalPages)}
          </span>
          <Button
            type="button"
            variant="secondary"
            disabled={isLoading || (page ?? 1) >= pagination.totalPages}
            onClick={() => setPage((current) => (current ?? 1) + 1)}
          >
            Next
          </Button>
        </nav>
      ) : hasMore ? (
        <div className="button-row">
          <Button type="button" variant="secondary" onClick={() => setPage(1)}>
            View all {totalCount} transactions
          </Button>
        </div>
      ) : null}
      <TransactionDetailsDialog
        transaction={selectedTransaction}
        onClose={() => setSelectedTransaction(null)}
      />
    </section>
  );
}
