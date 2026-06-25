import { useMemo } from "react";
import { Link, useLocation, useNavigate } from "react-router-dom";
import { motion, type Variants } from "framer-motion";
import { ArrowLeft, Home } from "lucide-react";

import { NotFoundSlip } from "../../components/NotFoundSlip";

const EASE = [0.16, 1, 0.3, 1] as const;

const actions: Variants = {
  hidden: { opacity: 0, y: 14 },
  shown: { opacity: 1, y: 0, transition: { delay: 1.3, duration: 0.6, ease: EASE } },
};

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

  return (
    <main className="nf-screen" aria-label="Page not found, error 404">
      <div className="nf-stage">
        <NotFoundSlip requested={requested} printedAt={printedAt} reference={reference} />

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
