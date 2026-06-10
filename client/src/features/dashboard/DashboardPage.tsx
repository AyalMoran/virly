import { useEffect, useMemo, useState } from "react";
import { motion } from "framer-motion";
import type { Variants } from "framer-motion";
import { ArrowDownLeft, ArrowUpRight, TrendingUp } from "lucide-react";
import { Link, useLocation, useNavigate } from "react-router-dom";
import { Card, ErrorBanner, PageHeader, Skeleton } from "../../components/Primitives";
import { QuickContacts } from "../../components/QuickContacts";
import { TransactionDetailsDialog } from "../../components/TransactionDetailsDialog";
import { TransactionList } from "../../components/TransactionList";
import { api } from "../../lib/api";
import { getQuickContacts } from "../../lib/contacts";
import { formatCurrency } from "../../lib/format";
import { clearAuthTransition, hasAuthTransition } from "../../lib/route-transition";
import type { AccountSummary, Transaction } from "../../lib/types";
import { useAuth } from "../auth/AuthProvider";

function getUsername(email?: string) {
  return email?.split("@")[0] || "user";
}

export function DashboardPage() {
  const auth = useAuth();
  const location = useLocation();
  const navigate = useNavigate();
  const [summary, setSummary] = useState<AccountSummary | null>(null);
  const [selectedTransaction, setSelectedTransaction] = useState<Transaction | null>(null);
  const [error, setError] = useState("");
  const [isLoading, setIsLoading] = useState(true);
  const [enteredFromAuth] = useState(() => hasAuthTransition(location.state));

  useEffect(() => {
    let active = true;
    setIsLoading(true);
    api
      .accountSummary(1, 10)
      .then((response) => {
        if (active) {
          setSummary(response);
          setError("");
        }
      })
      .catch((loadError: unknown) => {
        if (active) {
          setError(loadError instanceof Error ? loadError.message : "Unable to load account.");
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
  }, []);

  useEffect(() => {
    if (!enteredFromAuth) {
      return;
    }

    const timer = window.setTimeout(clearAuthTransition, 1400);
    return () => window.clearTimeout(timer);
  }, [enteredFromAuth]);

  const totals = useMemo(() => {
    const transactions = summary?.transactions ?? [];
    return {
      sent: transactions
        .filter((transaction) => transaction.amount < 0)
        .reduce((total, transaction) => total + Math.abs(transaction.amount), 0),
      received: transactions
        .filter((transaction) => transaction.amount > 0)
        .reduce((total, transaction) => total + transaction.amount, 0)
    };
  }, [summary]);

  const quickContacts = useMemo(
    () => getQuickContacts(summary?.transactions ?? []),
    [summary?.transactions]
  );
  const firstName = summary?.personalDetails.firstName?.trim();
  const greetingName = firstName || getUsername(auth.user?.email);

  const containerAnimation: Variants | undefined = enteredFromAuth
    ? {
        hidden: { opacity: 0 },
        visible: {
          opacity: 1,
          transition: {
            delayChildren: 0.15,
            staggerChildren: 0.08
          }
        }
      }
    : undefined;

  const itemAnimation: Variants | undefined = enteredFromAuth
    ? {
        hidden: { opacity: 0, y: 24, scale: 0.98 },
        visible: {
          opacity: 1,
          y: 0,
          scale: 1,
          transition: { duration: 0.65, ease: [0.16, 1, 0.3, 1] }
        }
      }
    : undefined;

  return (
    <motion.div
      className="page-stack dashboard-page"
      variants={containerAnimation}
      initial={enteredFromAuth ? "hidden" : false}
      animate="visible"
    >
      <motion.div variants={itemAnimation}>
        <PageHeader eyebrow="" title={`Hello, ${greetingName}`}>
          <Link className="button button-primary" to="/transfer">
            Transfer Funds
          </Link>
        </PageHeader>
      </motion.div>
      {error ? <ErrorBanner message={error} /> : null}
      {isLoading ? (
        <motion.div
          variants={itemAnimation}
          initial={enteredFromAuth ? "hidden" : false}
          animate="visible"
        >
          <Skeleton rows={5} />
        </motion.div>
      ) : (
        <motion.div
          className="figma-dashboard-grid"
          variants={containerAnimation}
          initial={enteredFromAuth ? "hidden" : false}
          animate="visible"
        >
          <div className="dashboard-main-column">
            <motion.section className="figma-balance-card" variants={itemAnimation}>
              <div className="figma-balance-top">
                <div>
                  <p>Available Balance</p>
                  <strong>{formatCurrency(summary?.balance ?? 0)}</strong>
                </div>
                <span className="trend-badge" aria-hidden="true">
                  <TrendingUp />
                </span>
              </div>
              <div className="figma-balance-stats">
                <div>
                  <span>Received</span>
                  <strong>{formatCurrency(totals.received)}</strong>
                </div>
                <div>
                  <span>Sent</span>
                  <strong>{formatCurrency(totals.sent)}</strong>
                </div>
              </div>
            </motion.section>

            <motion.div variants={itemAnimation}>
              <Card className="figma-panel">
              <div className="section-heading">
                <h2>Recent Transactions</h2>
                <Link to="/transactions">View All</Link>
              </div>
              <TransactionList
                transactions={summary?.transactions ?? []}
                compact
                onTransactionSelect={setSelectedTransaction}
              />
              </Card>
            </motion.div>
          </div>

          <aside className="dashboard-side-column">
            <motion.div variants={itemAnimation}>
              <Card className="figma-panel">
                <div className="section-heading">
                  <h2>Quick Send</h2>
                </div>
                <QuickContacts
                  contacts={quickContacts}
                  onSelectContact={(email) => {
                    sessionStorage.setItem("virly-prefill-recipient", email);
                    navigate("/transfer");
                  }}
                />
              </Card>
            </motion.div>

            <motion.div variants={itemAnimation}>
              <Card className="figma-panel activity-panel">
                <div className="section-heading">
                  <h2>Activity Stats</h2>
                </div>
                <div className="activity-stat-list">
                  <div className="activity-stat">
                    <span className="direction-mark direction-in" aria-hidden="true">
                      <ArrowDownLeft />
                    </span>
                    <div>
                      <strong>Received</strong>
                      <span>{formatCurrency(totals.received)}</span>
                    </div>
                  </div>
                  <div className="activity-stat">
                    <span className="direction-mark direction-out" aria-hidden="true">
                      <ArrowUpRight />
                    </span>
                    <div>
                      <strong>Sent</strong>
                      <span>{formatCurrency(totals.sent)}</span>
                    </div>
                  </div>
                </div>
              </Card>
            </motion.div>
          </aside>
        </motion.div>
      )}

      <TransactionDetailsDialog
        transaction={selectedTransaction}
        onClose={() => setSelectedTransaction(null)}
      />
    </motion.div>
  );
}
