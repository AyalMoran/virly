import { useMemo } from "react";
import { Link, useLocation, useNavigate } from "react-router-dom";
import { motion, type Variants } from "framer-motion";
import { ArrowLeft, Home } from "lucide-react";

const EASE = [0.16, 1, 0.3, 1] as const;

// The slip "prints" out of the terminal — revealed top-to-bottom — then settles
// onto the desk at a casual tilt, staggering its lines in as it goes.
const paper: Variants = {
  hidden: { opacity: 0, y: 28, rotate: -3.4, clipPath: "inset(0 0 100% 0)" },
  shown: {
    opacity: 1,
    y: 0,
    rotate: -1.4,
    clipPath: "inset(0 0 0% 0)",
    transition: {
      duration: 0.9,
      ease: EASE,
      when: "beforeChildren",
      delayChildren: 0.3,
      staggerChildren: 0.07
    }
  }
};

const line: Variants = {
  hidden: { opacity: 0, y: 10 },
  shown: { opacity: 1, y: 0, transition: { duration: 0.5, ease: EASE } }
};

// The rubber stamp slams down off-axis once the receipt has finished printing.
const stamp: Variants = {
  hidden: { opacity: 0, scale: 1.9, rotate: -24 },
  shown: {
    opacity: 0.92,
    scale: 1,
    rotate: -13,
    transition: { delay: 1.15, type: "spring", stiffness: 360, damping: 13, mass: 0.7 }
  }
};

const actions: Variants = {
  hidden: { opacity: 0, y: 14 },
  shown: { opacity: 1, y: 0, transition: { delay: 1.3, duration: 0.6, ease: EASE } }
};

function LedgerRow({ label, value }: { label: string; value: string }) {
  return (
    <motion.div className="nf-row" variants={line}>
      <span className="nf-row-key">{label}</span>
      <span className="nf-row-dots" aria-hidden="true" />
      <span className="nf-row-val">{value}</span>
    </motion.div>
  );
}

export function NotFoundPage() {
  const location = useLocation();
  const navigate = useNavigate();

  const requested = `${location.pathname}${location.search}` || "/";

  // Receipt metadata is derived once and stays stable across re-renders. The
  // reference is a tiny hash of the requested path so the same dead link always
  // prints the same "declined" reference number.
  const { printedAt, reference } = useMemo(() => {
    const now = new Date();
    const pad = (n: number) => String(n).padStart(2, "0");
    const printedAt = `${now.getFullYear()}-${pad(now.getMonth() + 1)}-${pad(
      now.getDate()
    )} ${pad(now.getHours())}:${pad(now.getMinutes())}`;
    const hash = Math.abs(
      [...requested].reduce((acc, ch) => ((acc << 5) - acc + ch.charCodeAt(0)) | 0, 7)
    );
    const reference = `VRL-${hash.toString(36).toUpperCase().padStart(6, "0").slice(0, 6)}`;
    return { printedAt, reference };
  }, [requested]);

  // A plausible-looking barcode: deterministic bar/space widths derived from the
  // error code. Even segments ink, odd segments paper.
  const bars = useMemo(() => {
    const seed = "404-NOT-FOUND-VIRLY-SAVINGS-AND-TRUST";
    const widths: number[] = [];
    for (let i = 0; i < seed.length; i += 1) {
      const code = seed.charCodeAt(i);
      widths.push((code % 3) + 1);
      widths.push(((code >> 2) % 3) + 1);
    }
    return widths;
  }, []);

  return (
    <main className="nf-screen" aria-label="Page not found, error 404">
      <div className="nf-stage">
        <div className="nf-receipt-shadow">
          <motion.article
            className="nf-receipt"
            variants={paper}
            initial="hidden"
            animate="shown"
            whileHover={{ rotate: 0, y: -5 }}
            transition={{ type: "spring", stiffness: 220, damping: 22 }}
          >
            <motion.header className="nf-merchant" variants={line}>
              <span className="nf-logo" aria-hidden="true">
                V
              </span>
              <span className="nf-brand">Virly</span>
              <span className="nf-merchant-sub">Savings &amp; Trust</span>
              <span className="nf-merchant-meta">Routing Node · WWW Edge · Terminal 07</span>
            </motion.header>

            <div className="nf-divider" aria-hidden="true" />

            <motion.div className="nf-hero" variants={line}>
              <h1 className="nf-headline">
                404
                <motion.span
                  className="nf-stamp"
                  variants={stamp}
                  aria-hidden="true"
                >
                  <span className="nf-stamp-main">Declined</span>
                  <span className="nf-stamp-sub">No Such Route</span>
                </motion.span>
              </h1>
              <p className="nf-sub">Transaction declined.</p>
              <p className="nf-note">This page isn&apos;t in our ledger.</p>
            </motion.div>

            <div className="nf-divider" aria-hidden="true" />

            <motion.div className="nf-rows" variants={line}>
              <LedgerRow label="Status" value="404 Not Found" />
              <LedgerRow label="Requested" value={requested} />
              <LedgerRow label="Method" value="GET" />
              <LedgerRow label="Posted" value={printedAt} />
              <LedgerRow label="Reference" value={reference} />
            </motion.div>

            <div className="nf-divider" aria-hidden="true" />

            <motion.div className="nf-totals" variants={line}>
              <div className="nf-row nf-total">
                <span className="nf-row-key">Pages found</span>
                <span className="nf-row-dots" aria-hidden="true" />
                <span className="nf-row-val">0</span>
              </div>
              <div className="nf-row nf-total">
                <span className="nf-row-key">Balance of luck</span>
                <span className="nf-row-dots" aria-hidden="true" />
                <span className="nf-row-val">$0.00</span>
              </div>
            </motion.div>

            <div className="nf-divider" aria-hidden="true" />

            <motion.div className="nf-barcode" variants={line} aria-hidden="true">
              {bars.map((width, index) => (
                <span
                  key={index}
                  className={index % 2 === 0 ? "nf-bar" : "nf-space"}
                  style={{ flexGrow: width }}
                />
              ))}
            </motion.div>
            <motion.p className="nf-barcode-caption" variants={line} aria-hidden="true">
              4 0 4 — N O T — F O U N D
            </motion.p>

            <motion.footer className="nf-receipt-footer" variants={line}>
              No pages were charged for this error.
              <br />★ Thank you for banking with Virly ★
            </motion.footer>
          </motion.article>
        </div>

        <motion.div className="nf-actions" variants={actions} initial="hidden" animate="shown">
          <Link to="/" className="button button-primary nf-cta">
            <Home aria-hidden="true" />
            Back to dashboard
          </Link>
          <button
            type="button"
            className="button button-secondary nf-cta"
            onClick={() => navigate(-1)}
          >
            <ArrowLeft aria-hidden="true" />
            Go back
          </button>
        </motion.div>
      </div>
    </main>
  );
}
