import { useEffect } from "react";
import { AnimatePresence, motion } from "framer-motion";

import { formatCurrency, formatDate } from "../lib/format";
import type { Transaction } from "../lib/types";
import { OrderConfirmationCard } from "./ui/order-confirmation-card";

export function TransactionDetailsDialog({
  transaction,
  onClose,
}: {
  transaction: Transaction | null;
  onClose: () => void;
}) {
  useEffect(() => {
    if (!transaction) {
      return;
    }

    const handleKeyDown = (event: KeyboardEvent) => {
      if (event.key === "Escape") {
        onClose();
      }
    };

    window.addEventListener("keydown", handleKeyDown);
    return () => window.removeEventListener("keydown", handleKeyDown);
  }, [onClose, transaction]);

  return (
    <AnimatePresence>
      {transaction ? (
        <motion.div
          className="transaction-confirmation-overlay"
          role="presentation"
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          exit={{ opacity: 0 }}
          transition={{ duration: 0.99, ease: [0.16, 1, 0.3, 1] }}
          onClick={onClose}
        >
          <motion.div
            role="dialog"
            aria-modal="true"
            aria-label="Transaction details"
            initial={{ opacity: 0, y: 18, scale: 0.96, filter: "blur(6px)" }}
            animate={{ opacity: 1, y: 0, scale: 1, filter: "blur(0px)" }}
            exit={{ opacity: 0, y: 12, scale: 0.96, filter: "blur(6px)" }}
            transition={{ duration: 0.28, ease: [0.16, 1, 0.3, 1] }}
            onClick={(event) => event.stopPropagation()}
          >
            <OrderConfirmationCard
              orderId={transaction.id}
              paymentMethod={transaction.counterpartyEmail}
              reason={transaction.reason}
              dateTime={formatDate(transaction.date)}
              totalAmount={`${transaction.amount > 0 ? "+" : ""}${formatCurrency(
                transaction.amount,
              )}`}
              onGoToAccount={onClose}
            />
          </motion.div>
        </motion.div>
      ) : null}
    </AnimatePresence>
  );
}
