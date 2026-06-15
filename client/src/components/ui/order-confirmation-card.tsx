import * as React from "react";
import { AnimatePresence, motion } from "framer-motion";
import type { Variants } from "framer-motion";
import { CheckCircle2 } from "lucide-react";

import { cn } from "@/lib/utils";
import { Button } from "@/components/ui/button";

interface OrderConfirmationCardProps {
  orderId: string;
  paymentMethod: string;
  dateTime: string;
  totalAmount: string;
  onGoToAccount: () => void;
  reason?: string | null;
  title?: string;
  buttonText?: string;
  icon?: React.ReactNode;
  className?: string;
}

export const OrderConfirmationCard: React.FC<OrderConfirmationCardProps> = ({
  orderId,
  paymentMethod,
  dateTime,
  totalAmount,
  onGoToAccount,
  reason,
  title = "Transaction completed successfully",
  buttonText = "Close",
  icon = <CheckCircle2 className="h-12 w-12 text-primary" />,
  className,
}) => {
  const isDebitAmount = totalAmount.trim().startsWith("-");
  const totalAmountClassName = isDebitAmount ? "amount-debit" : "amount-credit";

  const details = [
    { label: "Transaction ID", value: orderId },
    { label: "Counterparty", value: paymentMethod },
    { label: "Reason", value: reason?.trim() || "No reason provided" },
    { label: "Date & Time", value: dateTime },
    {
      label: "Total",
      value: totalAmount,
      isBold: true,
      valueClassName: totalAmountClassName,
    },
  ];

  const containerVariants: Variants = {
    hidden: { opacity: 0, scale: 0.95 },
    visible: {
      opacity: 1,
      scale: 1,
      transition: {
        duration: 0.4,
        ease: "easeInOut",
        staggerChildren: 0.1,
      },
    },
  };

  const itemVariants: Variants = {
    hidden: { opacity: 0, y: 20 },
    visible: { opacity: 1, y: 0, transition: { type: "spring", stiffness: 100 } },
  };

  return (
    <AnimatePresence>
      <motion.div
        variants={containerVariants}
        initial="hidden"
        animate="visible"
        aria-live="polite"
        className={cn(
          "order-confirmation-card w-full max-w-sm rounded-xl border bg-card p-5 text-card-foreground shadow-lg sm:p-8",
          className,
        )}
      >
        <div className="flex flex-col items-center space-y-6 text-center">
          <motion.div variants={itemVariants}>{icon}</motion.div>

          <motion.h2 variants={itemVariants} className="text-2xl font-semibold">
            {title}
          </motion.h2>

          <motion.div variants={itemVariants} className="w-full space-y-4 pt-4">
            {details.map((item, index) => (
              <div
                key={item.label}
                className={cn(
                  "order-detail-row flex min-w-0 flex-col gap-1 border-b pb-4 text-start text-sm text-muted-foreground sm:flex-row sm:items-center sm:justify-between sm:gap-4",
                  {
                    "border-none pb-0": index === details.length - 1,
                    "font-bold text-card-foreground": item.isBold,
                  },
                )}
              >
                <span className="shrink-0">{item.label}</span>
                <span
                  className={cn(
                    "min-w-0 break-words sm:text-right",
                    { "text-lg": item.isBold },
                    item.valueClassName,
                  )}
                >
                  {item.value}
                </span>
              </div>
            ))}
          </motion.div>

          <motion.div variants={itemVariants} className="w-full pt-4">
            <Button onClick={onGoToAccount} className="h-12 w-full text-base" size="lg">
              {buttonText}
            </Button>
          </motion.div>
        </div>
      </motion.div>
    </AnimatePresence>
  );
};
