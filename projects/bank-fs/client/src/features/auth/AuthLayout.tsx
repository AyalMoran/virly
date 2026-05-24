import type { ReactNode } from "react";
import { motion } from "framer-motion";
import { AnimatedText } from "../../components/ui/animated-text";

export function AuthLayout({
  title,
  subtitle,
  visualText,
  barePanel = false,
  isExiting = false,
  children
}: {
  title: string;
  subtitle: string;
  visualText?: string;
  barePanel?: boolean;
  isExiting?: boolean;
  children: ReactNode;
}) {
  return (
    <main className="auth-page">
      <motion.section
        className="auth-visual"
        aria-label="Virly overview"
        initial={{ opacity: 1, x: 0, scale: 1 }}
        animate={
          isExiting
            ? { opacity: 0, x: 120, scale: 0.96, filter: "blur(8px)" }
            : { opacity: 1, x: 0, scale: 1, filter: "blur(0px)" }
        }
        transition={{ duration: 1.00, ease: [0.16, 1, 0.3, 1] }}
      >
        <div className="brand auth-brand">
          <div className="brand-mark" aria-hidden="true">
            Virly
          </div>
          <span>inc.</span>
        </div>
        {visualText ? (
          <div className="auth-animated-brand">
            <AnimatedText text={visualText} />
          </div>
        ) : (
          <div className="auth-balance-card">
            <p>Available balance</p>
            <strong>$28,520.30</strong>
          </div>
        )}
      </motion.section>
      <motion.section
        className="auth-panel"
        initial={{ opacity: 1, x: 0, scale: 1 }}
        animate={
          isExiting
            ? { opacity: 0, x: 120, scale: 0.96, filter: "blur(8px)" }
            : { opacity: 1, x: 0, scale: 1, filter: "blur(0px)" }
        }
        transition={{ duration: 1.00, ease: [0.16, 1, 0.3, 1], delay: isExiting ? 0.04 : 0 }}
      >
        {barePanel ? (
          children
        ) : (
          <div className="auth-card">
            <h1>{title}</h1>
            {subtitle ? <p>{subtitle}</p> : null}
            {children}
          </div>
        )}
      </motion.section>
    </main>
  );
}
