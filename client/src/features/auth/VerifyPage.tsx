import { useEffect, useState } from "react";
import { AnimatePresence, motion } from "framer-motion";
import { Link, useNavigate, useSearchParams } from "react-router-dom";
import { ErrorBanner, SuccessBanner } from "../../components/Primitives";
import { authTransitionState, markAuthTransition } from "../../lib/route-transition";
import { PersonalDetailsAuthForm } from "../profile/PersonalDetailsAuthForm";
import { useAuth } from "./AuthProvider";
import { AuthLayout } from "./AuthLayout";

const authExitMs = 1000;

export function VerifyPage() {
  const auth = useAuth();
  const navigate = useNavigate();
  const [searchParams] = useSearchParams();
  const [error, setError] = useState("");
  const [done, setDone] = useState(false);
  const [stage, setStage] = useState<"verify" | "personalDetails" | "leaving">(
    "verify"
  );

  useEffect(() => {
    const token = searchParams.get("token");

    if (!token) {
      setError("Verification token is missing.");
      return;
    }

    let active = true;
    auth
      .verify(token)
      .then((user) => {
        if (!active) {
          return;
        }

        if (user.needsPersonalDetails) {
          setStage("personalDetails");
          return;
        }

        setDone(true);
        window.setTimeout(
          () => {
            markAuthTransition();
            navigate("/dashboard", { replace: true, state: authTransitionState });
          },
          700
        );
      })
      .catch((verificationError: unknown) => {
        if (active) {
          setError(
            verificationError instanceof Error
              ? verificationError.message
              : "Verification failed."
          );
        }
      });

    return () => {
      active = false;
    };
  }, [auth, navigate, searchParams]);

  function finishVerificationFlow() {
    setStage("leaving");
    window.setTimeout(
      () => {
        markAuthTransition();
        navigate("/dashboard", { replace: true, state: authTransitionState });
      },
      authExitMs
    );
  }

  return (
    <AuthLayout
      title="Verify email"
      subtitle=""
      visualText="Virly"
      barePanel={stage === "personalDetails"}
      isExiting={stage === "leaving"}
    >
      <AnimatePresence mode="wait">
        {stage === "verify" ? (
          <motion.div
            key="verify"
            className="form-stack"
            initial={{ opacity: 1 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0, y: -18, scale: 0.98 }}
            transition={{ duration: 0.35 }}
          >
            {done ? <SuccessBanner message="Email verified. Opening dashboard..." /> : null}
            {error ? <ErrorBanner message={error} /> : null}
            {!done && !error ? <div className="spinner-panel">Checking token...</div> : null}
            {error ? (
              <Link className="button button-primary" to="/resend-verification">
                Resend verification
              </Link>
            ) : null}
          </motion.div>
        ) : stage === "personalDetails" ? (
          <PersonalDetailsAuthForm
            key="personal-details"
            onComplete={finishVerificationFlow}
          />
        ) : null}
      </AnimatePresence>
    </AuthLayout>
  );
}
