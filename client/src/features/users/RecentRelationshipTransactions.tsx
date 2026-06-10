import React, { useEffect, useState } from "react";
import { ArrowDownLeft, ArrowUpRight } from "lucide-react";
import { Button, Skeleton } from "../../components/Primitives";
import { api } from "../../lib/api";
import { formatCurrency, formatRelativeDate } from "../../lib/format";
import type { Pagination, RelationshipTransaction } from "../../lib/types";

function TransactionRows({
  transactions,
  viewedName
}: {
  transactions: RelationshipTransaction[];
  viewedName: string;
}) {
  return (
    <div className="transaction-list">
      {transactions.map((transaction) => {
        const isReceived = transaction.direction === "received";
        return (
          <article className="transaction-row" key={transaction.id}>
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
                {formatCurrency(transaction.amount)}
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
  viewedName
}: {
  idOrEmail: string;
  initialTransactions: RelationshipTransaction[];
  totalCount: number;
  viewedName: string;
}) {
  const [page, setPage] = useState<number | null>(null);
  const [transactions, setTransactions] = useState(initialTransactions);
  const [pagination, setPagination] = useState<Pagination | null>(null);
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState("");

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
        <TransactionRows transactions={transactions} viewedName={viewedName} />
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
    </section>
  );
}
