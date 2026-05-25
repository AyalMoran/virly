import { FormEvent, useEffect, useState } from "react";
import { Button, Card, ErrorBanner, Field, PageHeader, Skeleton } from "../../components/Primitives";
import { TransactionDetailsDialog } from "../../components/TransactionDetailsDialog";
import { TransactionList } from "../../components/TransactionList";
import { api } from "../../lib/api";
import type { Transaction, TransactionsResponse } from "../../lib/types";
import { validateEmail } from "../../lib/validation";

export function TransactionsPage() {
  const [response, setResponse] = useState<TransactionsResponse | null>(null);
  const [page, setPage] = useState(1);
  const [counterparty, setCounterparty] = useState("");
  const [activeCounterparty, setActiveCounterparty] = useState("");
  const [error, setError] = useState("");
  const [filterError, setFilterError] = useState("");
  const [isLoading, setIsLoading] = useState(true);
  const [selectedTransaction, setSelectedTransaction] = useState<Transaction | null>(null);

  useEffect(() => {
    let active = true;
    setIsLoading(true);
    api
      .transactions({
        page,
        limit: 10,
        counterparty: activeCounterparty
      })
      .then((transactionsResponse) => {
        if (active) {
          setResponse(transactionsResponse);
          setError("");
        }
      })
      .catch((loadError: unknown) => {
        if (active) {
          setError(
            loadError instanceof Error ? loadError.message : "Unable to load transactions."
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
  }, [activeCounterparty, page]);

  function applyFilter(event: FormEvent) {
    event.preventDefault();
    if (counterparty.trim()) {
      const nextError = validateEmail(counterparty);
      if (nextError) {
        setFilterError(nextError);
        return;
      }
    }

    setFilterError("");
    setPage(1);
    setActiveCounterparty(counterparty.trim());
  }

  function clearFilter() {
    setCounterparty("");
    setActiveCounterparty("");
    setFilterError("");
    setPage(1);
  }

  return (
    <div className="page-stack">
      <PageHeader eyebrow="" title="Transactions" />
      <Card>
        <form className="filter-bar" onSubmit={applyFilter} noValidate>
          <Field
            label="Counterparty email"
            name="counterparty"
            type="email"
            value={counterparty}
            error={filterError}
            placeholder="name@example.com"
            onChange={(event) => setCounterparty(event.target.value)}
          />
          <Button type="submit">Filter</Button>
          <Button type="button" variant="secondary" onClick={clearFilter}>
            Reset
          </Button>
        </form>
      </Card>
      {error ? <ErrorBanner message={error} /> : null}
      <Card>
        {isLoading ? (
          <Skeleton rows={6} />
        ) : (
          <TransactionList
            transactions={response?.transactions ?? []}
            pagination={response?.pagination}
            page={page}
            onPageChange={setPage}
            onTransactionSelect={setSelectedTransaction}
          />
        )}
      </Card>
      <TransactionDetailsDialog
        transaction={selectedTransaction}
        onClose={() => setSelectedTransaction(null)}
      />
    </div>
  );
}
