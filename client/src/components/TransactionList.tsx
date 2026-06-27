import { ArrowDownLeft, ArrowUpRight } from "lucide-react";
import type { FormEvent } from "react";
import { Link } from "react-router-dom";
import { useCurrency } from "../features/currency/CurrencyProvider";
import { formatRelativeDate } from "../lib/format";
import type { Pagination, Transaction } from "../lib/types";
import { Button, EmptyState } from "./Primitives";

/**
 * A rendered slot in the pagination strip: either a concrete page number or a
 * truncation gap that collapses a run of hidden pages into an ellipsis.
 */
export type PaginationItem = number | "ellipsis";

function pageRange(start: number, end: number): number[] {
  const pages: number[] = [];
  for (let page = start; page <= end; page += 1) {
    pages.push(page);
  }
  return pages;
}

/**
 * Builds the windowed list of page slots to render. Always keeps the first and
 * last page, plus a sibling on each side of the current page, and collapses the
 * runs in between into "ellipsis" markers. A gap of a single page is filled with
 * that page rather than an ellipsis, since an ellipsis hiding one page is pointless.
 */
export function buildPaginationItems(
  currentPage: number,
  totalPages: number
): PaginationItem[] {
  const total = Math.max(1, Math.floor(totalPages));
  // Up to 7 pages (first, last, current, two siblings, two boundaries) fit
  // without truncation — render them all rather than introducing ellipses.
  if (total <= 7) {
    return pageRange(1, total);
  }

  const current = Math.min(Math.max(Math.floor(currentPage), 1), total);
  const anchors = new Set<number>([
    1,
    total,
    current,
    current - 1,
    current + 1
  ]);
  const visible = [...anchors]
    .filter((page) => page >= 1 && page <= total)
    .sort((a, b) => a - b);

  const items: PaginationItem[] = [];
  let previous = 0;
  for (const page of visible) {
    const gap = page - previous;
    if (gap === 2) {
      items.push(previous + 1);
    } else if (gap > 2) {
      items.push("ellipsis");
    }
    items.push(page);
    previous = page;
  }
  return items;
}

/** Clamps a requested page into the valid 1..totalPages range. */
export function clampPage(value: number, totalPages: number): number {
  const total = Math.max(1, Math.floor(totalPages));
  if (!Number.isFinite(value)) {
    return 1;
  }
  return Math.min(Math.max(Math.floor(value), 1), total);
}

/**
 * Numbered page-jump controls for the transactions list. Hook-free so it can be
 * exercised directly in unit tests. Renders nothing when there is a single page.
 */
export function TransactionsPagination({
  pagination,
  page,
  onPageChange
}: {
  pagination: Pagination;
  page: number;
  onPageChange: (page: number) => void;
}) {
  const totalPages = Math.max(1, pagination.totalPages);
  if (totalPages <= 1) {
    return null;
  }

  const items = buildPaginationItems(page, totalPages);
  // Numbered buttons only reach the first, last, and a window of pages; a direct
  // input is what actually makes an arbitrary jump possible once pages truncate.
  const showJumpInput = totalPages > 7;
  const jumpInputId = "transactions-pagination-jump";

  function handleJump(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const requested = Number(new FormData(event.currentTarget).get("page"));
    if (!Number.isFinite(requested)) {
      return;
    }
    onPageChange(clampPage(requested, totalPages));
  }

  return (
    <nav className="pagination" aria-label="Transactions pages">
      <Button
        type="button"
        variant="secondary"
        disabled={page <= 1}
        onClick={() => onPageChange(page - 1)}
      >
        Previous
      </Button>
      <ul className="pagination-pages">
        {items.map((item, index) => {
          if (item === "ellipsis") {
            return (
              <li
                className="pagination-gap"
                key={`ellipsis-${index}`}
                aria-hidden="true"
              >
                …
              </li>
            );
          }

          const isCurrent = item === page;
          return (
            <li className="pagination-page-item" key={item}>
              <Button
                type="button"
                variant={isCurrent ? "primary" : "ghost"}
                className="pagination-page"
                aria-current={isCurrent ? "page" : undefined}
                aria-disabled={isCurrent ? true : undefined}
                aria-label={
                  isCurrent ? `Page ${item}, current page` : `Go to page ${item}`
                }
                onClick={isCurrent ? undefined : () => onPageChange(item)}
              >
                {item}
              </Button>
            </li>
          );
        })}
      </ul>
      <Button
        type="button"
        variant="secondary"
        disabled={page >= totalPages}
        onClick={() => onPageChange(page + 1)}
      >
        Next
      </Button>
      {showJumpInput ? (
        <form className="pagination-jump" onSubmit={handleJump}>
          <label className="pagination-jump-label" htmlFor={jumpInputId}>
            Go to page
          </label>
          <input
            id={jumpInputId}
            name="page"
            type="number"
            min={1}
            max={totalPages}
            defaultValue={page}
            inputMode="numeric"
            className="pagination-jump-input"
            aria-label={`Go to page, between 1 and ${totalPages}`}
          />
          <Button type="submit" variant="secondary">
            Go
          </Button>
        </form>
      ) : null}
    </nav>
  );
}

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
  const { formatAmount } = useCurrency();

  if (!transactions.length) {
    return (
      <EmptyState
        title="No transactions"
        message="Money you send or receive will show up here. Start by sending your first transfer."
      >
        <Link className="button button-primary" to="/transfer">
          Transfer
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
            onClick={(event) => {
              if ((event.target as HTMLElement).closest("a")) {
                return;
              }
              onTransactionSelect?.(transaction);
            }}
            onKeyDown={(event) => {
              if (!isSelectable || (event.target as HTMLElement).closest("a")) {
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
              {isCredit ? <ArrowDownLeft /> : <ArrowUpRight />}
            </div>
            <div className="transaction-main">
              <strong>
                <Link
                  className="counterparty-link"
                  to={`/users/${encodeURIComponent(transaction.counterpartyEmail)}`}
                  aria-label={`View ${transaction.counterpartyEmail}'s profile`}
                >
                  {transaction.counterpartyEmail}
                </Link>
              </strong>
              <span>{transaction.reason || formatRelativeDate(transaction.date)}</span>
            </div>
            <div className="transaction-meta">
              <strong className={isCredit ? "amount-credit" : "amount-debit"}>
                {isCredit ? "+" : ""}
                {formatAmount(transaction.amount)}
              </strong>
              <span>Completed</span>
            </div>
          </article>
        );
      })}
      {pagination && page && onPageChange ? (
        <TransactionsPagination
          pagination={pagination}
          page={page}
          onPageChange={onPageChange}
        />
      ) : null}
    </div>
  );
}
