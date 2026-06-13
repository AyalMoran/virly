import { motion } from "framer-motion";
import { Link } from "react-router-dom";
import { useCurrency } from "../features/currency/CurrencyProvider";
import { CurrencySelector } from "../features/currency/CurrencySelector";
import { AnimatedText } from "./ui/animated-text";

export function ShellTopbar({
  displayName,
  email,
  balance,
  enteredFromAuth
}: {
  displayName: string;
  email: string;
  balance: number;
  enteredFromAuth: boolean;
}) {
  const { formatAmount } = useCurrency();

  return (
    <motion.header
      className="topbar"
      initial={enteredFromAuth ? { opacity: 0, y: -16 } : false}
      animate={{ opacity: 1, y: 0 }}
      transition={{ duration: 0.6, ease: [0.16, 1, 0.3, 1], delay: 0.18 }}
    >
      <Link
        to="/dashboard"
        className="topbar-wordmark"
        aria-label="Virly home"
      >
        <AnimatedText
          text="Virly"
          as="span"
          duration={0.07}
          delay={0.08}
          textClassName="topbar-wordmark-text"
          underlineClassName="topbar-wordmark-underline"
        />
      </Link>
      <div className="topbar-actions">
        <CurrencySelector />
        <div className="topbar-user">
          <div className="topbar-user-meta">
            <span className="topbar-user-name">{displayName}</span>
            <span className="topbar-user-balance">
              <span className="sr-only">Current balance: </span>
              {formatAmount(balance)}
            </span>
          </div>
          <div className="avatar" aria-hidden="true">
            {email.slice(0, 2).toUpperCase()}
          </div>
        </div>
      </div>
    </motion.header>
  );
}
