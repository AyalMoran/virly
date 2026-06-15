import { FormEvent, useState } from "react";
import { AnimatePresence, motion } from "framer-motion";
import { useLocation, useNavigate } from "react-router-dom";
import { SignInCard2 } from "../../components/ui/sign-in-card-2";
import { ApiError } from "../../lib/api";
import {
  authTransitionState,
  clearAuthTransition,
  markAuthTransition
} from "../../lib/route-transition";
import { validateEmail, validatePassword } from "../../lib/validation";
import { PersonalDetailsAuthForm } from "../profile/PersonalDetailsAuthForm";
import { useAuth } from "./AuthProvider";
import { AuthLayout } from "./AuthLayout";

type LoginErrors = {
  email?: string;
  password?: string;
  form?: string;
};

const authExitMs = 1000;

function wait(ms: number) {
  return new Promise((resolve) => window.setTimeout(resolve, ms));
}

export function LoginPage() {
  const auth = useAuth();
  const navigate = useNavigate();
  const location = useLocation();
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [rememberMe, setRememberMe] = useState(false);
  const [errors, setErrors] = useState<LoginErrors>({});
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [stage, setStage] = useState<"login" | "personalDetails" | "leaving">(
    () => (auth.user?.needsPersonalDetails ? "personalDetails" : "login")
  );

  const state = location.state as { from?: { pathname: string } } | null;
  const redirectTo = state?.from?.pathname ?? "/dashboard";

  async function handleSubmit(event: FormEvent) {
    event.preventDefault();
    const nextErrors: LoginErrors = {
      email: validateEmail(email),
      password: validatePassword(password, "login")
    };

    if (nextErrors.email || nextErrors.password) {
      setErrors(nextErrors);
      return;
    }

    try {
      setIsSubmitting(true);
      setErrors({});
      setStage("leaving");
      markAuthTransition();
      const [user] = await Promise.all([
        auth.login({ email, password, rememberMe }),
        wait(authExitMs)
      ]);

      if (user.needsPersonalDetails) {
        setStage("personalDetails");
        return;
      }

      markAuthTransition();
      navigate(redirectTo, { replace: true, state: authTransitionState });
    } catch (error) {
      clearAuthTransition();
      setStage("login");
      if (error instanceof ApiError && error.status === 403) {
        navigate("/resend-verification", { state: { email } });
        return;
      }

      setErrors({
        form: error instanceof Error ? error.message : "Unable to log in."
      });
    } finally {
      setIsSubmitting(false);
    }
  }

  function finishAuthFlow() {
    setStage("leaving");
    window.setTimeout(
      () => {
        markAuthTransition();
        navigate(redirectTo, { replace: true, state: authTransitionState });
      },
      authExitMs
    );
  }

  return (
    <AuthLayout
      title="Sign in"
      subtitle=""
      visualText="Virly"
      barePanel
      isExiting={stage === "leaving"}
    >
      <AnimatePresence mode="wait">
        {stage === "login" ? (
          <motion.div
            key="login"
            initial={{ opacity: 1 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0, y: -18, scale: 0.98 }}
            transition={{ duration: 0.35 }}
          >
            <SignInCard2
              email={email}
              password={password}
              rememberMe={rememberMe}
              emailError={errors.email}
              passwordError={errors.password}
              formError={errors.form}
              isLoading={isSubmitting}
              onEmailChange={setEmail}
              onPasswordChange={setPassword}
              onRememberMeChange={setRememberMe}
              onSubmit={handleSubmit}
            />
          </motion.div>
        ) : stage === "personalDetails" ? (
          <PersonalDetailsAuthForm
            key="personal-details"
            onComplete={finishAuthFlow}
          />
        ) : null}
      </AnimatePresence>
    </AuthLayout>
  );
}
