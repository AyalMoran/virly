import * as React from "react";
import { AnimatePresence, motion, useMotionValue, useTransform } from "framer-motion";
import { ArrowRight, Eye, EyeClosed, Lock, Mail, Phone } from "lucide-react";
import { Link } from "react-router-dom";
import { cn } from "../../lib/utils";

type SignInCardProps = {
  title?: string;
  submitLabel?: string;
  footerLabel?: string;
  footerTo?: string;
  email: string;
  password: string;
  rememberMe?: boolean;
  showRememberMe?: boolean;
  confirmPassword?: string;
  phone?: string;
  emailError?: string;
  passwordError?: string;
  confirmPasswordError?: string;
  phoneError?: string;
  formError?: string;
  successMessage?: string;
  isLoading: boolean;
  onEmailChange: (value: string) => void;
  onPasswordChange: (value: string) => void;
  onRememberMeChange?: (value: boolean) => void;
  onConfirmPasswordChange?: (value: string) => void;
  onPhoneChange?: (value: string) => void;
  onSubmit: (event: React.FormEvent<HTMLFormElement>) => void;
};

const LoginInput = React.forwardRef<HTMLInputElement, React.ComponentProps<"input">>(
  ({ className, type, ...props }, ref) => {
    return (
      <input
        ref={ref}
        type={type}
        className={cn("signin-input", className)}
        {...props}
      />
    );
  }
);

LoginInput.displayName = "LoginInput";

export function SignInCard2({
  title = "Welcome Back",
  submitLabel = "Sign In",
  footerLabel = "Create account",
  footerTo = "/register",
  email,
  password,
  rememberMe = false,
  showRememberMe = true,
  confirmPassword,
  phone,
  emailError,
  passwordError,
  confirmPasswordError,
  phoneError,
  formError,
  successMessage,
  isLoading,
  onEmailChange,
  onPasswordChange,
  onRememberMeChange,
  onConfirmPasswordChange,
  onPhoneChange,
  onSubmit
}: SignInCardProps) {
  const [showPassword, setShowPassword] = React.useState(false);
  const [focusedInput, setFocusedInput] = React.useState<
    "email" | "password" | "confirmPassword" | "phone" | null
  >(null);

  const mouseX = useMotionValue(0);
  const mouseY = useMotionValue(0);
  const rotateX = useTransform(mouseY, [-300, 300], [8, -8]);
  const rotateY = useTransform(mouseX, [-300, 300], [-8, 8]);

  function handleMouseMove(event: React.MouseEvent<HTMLDivElement>) {
    if (event.target instanceof HTMLElement && event.target.closest("input, button, a")) {
      return;
    }

    const rect = event.currentTarget.getBoundingClientRect();
    mouseX.set(event.clientX - rect.left - rect.width / 2);
    mouseY.set(event.clientY - rect.top - rect.height / 2);
  }

  function handleMouseLeave() {
    mouseX.set(0);
    mouseY.set(0);
  }

  return (
    <motion.div
      initial={{ opacity: 0, y: 20 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ duration: 0.65 }}
      className="signin-card-wrap"
      style={{ perspective: 1500 }}
    >
      <motion.div
        className="signin-card-tilt"
        style={{ rotateX, rotateY }}
        onMouseMove={handleMouseMove}
        onMouseLeave={handleMouseLeave}
        whileHover={{ z: 10 }}
      >
        <div className="signin-card-group">
          <motion.div
            className="signin-card-glow"
            animate={{
              boxShadow: [
                "0 0 10px 2px rgba(255,255,255,0.08)",
                "0 0 22px 8px rgba(53,133,142,0.16)",
                "0 0 10px 2px rgba(255,255,255,0.08)"
              ],
              opacity: [0.28, 0.56, 0.28]
            }}
            transition={{
              duration: 4,
              repeat: Infinity,
              ease: "easeInOut",
              repeatType: "mirror"
            }}
          />

          <div className="signin-light-frame" aria-hidden="true">
            <motion.div
              className="signin-beam signin-beam-top"
              animate={{ left: ["-50%", "100%"], opacity: [0.28, 0.74, 0.28] }}
              transition={{ duration: 2.5, ease: "easeInOut", repeat: Infinity, repeatDelay: 1 }}
            />
            <motion.div
              className="signin-beam signin-beam-right"
              animate={{ top: ["-50%", "100%"], opacity: [0.28, 0.74, 0.28] }}
              transition={{ duration: 2.5, ease: "easeInOut", repeat: Infinity, repeatDelay: 1, delay: 0.6 }}
            />
            <motion.div
              className="signin-beam signin-beam-bottom"
              animate={{ right: ["-50%", "100%"], opacity: [0.28, 0.74, 0.28] }}
              transition={{ duration: 2.5, ease: "easeInOut", repeat: Infinity, repeatDelay: 1, delay: 1.2 }}
            />
            <motion.div
              className="signin-beam signin-beam-left"
              animate={{ bottom: ["-50%", "100%"], opacity: [0.28, 0.74, 0.28] }}
              transition={{ duration: 2.5, ease: "easeInOut", repeat: Infinity, repeatDelay: 1, delay: 1.8 }}
            />
          </div>

          <div className="signin-card">
            <div className="signin-card-pattern" aria-hidden="true" />

            <div className="signin-header">
              <motion.div
                initial={{ scale: 0.6, opacity: 0 }}
                animate={{ scale: 1, opacity: 1 }}
                transition={{ type: "spring", duration: 0.8 }}
                className="signin-logo"
              >
                V
              </motion.div>
              <motion.h1
                initial={{ opacity: 0, y: 10 }}
                animate={{ opacity: 1, y: 0 }}
                transition={{ delay: 0.2 }}
              >
                {title}
              </motion.h1>
            </div>

            <form onSubmit={onSubmit} className="signin-form" noValidate>
              {formError ? (
                <motion.div
                  className="signin-error"
                  role="alert"
                  initial={{ opacity: 0, y: -6 }}
                  animate={{ opacity: 1, y: 0 }}
                >
                  {formError}
                </motion.div>
              ) : null}
              {successMessage ? (
                <motion.div
                  className="signin-success"
                  role="status"
                  initial={{ opacity: 0, y: -6 }}
                  animate={{ opacity: 1, y: 0 }}
                >
                  {successMessage}
                </motion.div>
              ) : null}

              <motion.div
                className={cn("signin-field-motion", focusedInput === "email" && "focused")}
                whileHover={{ scale: 1.01 }}
                transition={{ type: "spring", stiffness: 400, damping: 25 }}
              >
                <label
                  className={cn("signin-field", focusedInput === "email" && "focused")}
                  htmlFor="login-email"
                >
                  <Mail aria-hidden="true" />
                  <LoginInput
                    id="login-email"
                    type="email"
                    placeholder="Email address"
                    autoComplete="email"
                    value={email}
                    aria-invalid={Boolean(emailError)}
                    onChange={(event) => onEmailChange(event.target.value)}
                    onFocus={() => setFocusedInput("email")}
                    onBlur={() => setFocusedInput(null)}
                  />
                </label>
              </motion.div>
              {emailError ? <span className="signin-field-error">{emailError}</span> : null}

              <motion.div
                className={cn("signin-field-motion", focusedInput === "password" && "focused")}
                whileHover={{ scale: 1.01 }}
                transition={{ type: "spring", stiffness: 400, damping: 25 }}
              >
                <label
                  className={cn("signin-field", focusedInput === "password" && "focused")}
                  htmlFor="login-password"
                >
                  <Lock aria-hidden="true" />
                  <LoginInput
                    id="login-password"
                    type={showPassword ? "text" : "password"}
                    placeholder="Password"
                    autoComplete={onConfirmPasswordChange ? "new-password" : "current-password"}
                    value={password}
                    aria-invalid={Boolean(passwordError)}
                    onChange={(event) => onPasswordChange(event.target.value)}
                    onFocus={() => setFocusedInput("password")}
                    onBlur={() => setFocusedInput(null)}
                  />
                  <button
                    type="button"
                    className="signin-icon-button"
                    aria-label={showPassword ? "Hide password" : "Show password"}
                    onClick={(event) => {
                      event.preventDefault();
                      setShowPassword((current) => !current);
                    }}
                  >
                    {showPassword ? <Eye /> : <EyeClosed />}
                  </button>
                </label>
              </motion.div>
              {passwordError ? <span className="signin-field-error">{passwordError}</span> : null}

              {onConfirmPasswordChange ? (
                <>
                  <motion.div
                    className={cn("signin-field-motion", focusedInput === "confirmPassword" && "focused")}
                    whileHover={{ scale: 1.01 }}
                    transition={{ type: "spring", stiffness: 400, damping: 25 }}
                  >
                    <label
                      className={cn("signin-field", focusedInput === "confirmPassword" && "focused")}
                      htmlFor="register-confirm-password"
                    >
                      <Lock aria-hidden="true" />
                      <LoginInput
                        id="register-confirm-password"
                        type={showPassword ? "text" : "password"}
                        placeholder="Confirm password"
                        autoComplete="new-password"
                        value={confirmPassword ?? ""}
                        aria-invalid={Boolean(confirmPasswordError)}
                        onChange={(event) => onConfirmPasswordChange(event.target.value)}
                        onFocus={() => setFocusedInput("confirmPassword")}
                        onBlur={() => setFocusedInput(null)}
                      />
                    </label>
                  </motion.div>
                  {confirmPasswordError ? (
                    <span className="signin-field-error">{confirmPasswordError}</span>
                  ) : null}
                </>
              ) : null}

              {onPhoneChange ? (
                <>
                  <motion.div
                    className={cn("signin-field-motion", focusedInput === "phone" && "focused")}
                    whileHover={{ scale: 1.01 }}
                    transition={{ type: "spring", stiffness: 400, damping: 25 }}
                  >
                    <label
                      className={cn("signin-field", focusedInput === "phone" && "focused")}
                      htmlFor="auth-phone"
                    >
                      <Phone aria-hidden="true" />
                      <LoginInput
                        id="auth-phone"
                        type="tel"
                        placeholder="Phone number"
                        autoComplete="tel"
                        value={phone ?? ""}
                        aria-invalid={Boolean(phoneError)}
                        onChange={(event) => onPhoneChange(event.target.value)}
                        onFocus={() => setFocusedInput("phone")}
                        onBlur={() => setFocusedInput(null)}
                      />
                    </label>
                  </motion.div>
                  {phoneError ? <span className="signin-field-error">{phoneError}</span> : null}
                </>
              ) : null}

              {showRememberMe && !onPhoneChange ? <div className="signin-options">
                <label className="signin-checkbox">
                  <input
                    type="checkbox"
                    checked={rememberMe}
                    onChange={(event) => onRememberMeChange?.(event.target.checked)}
                  />
                  <span>{rememberMe ? "✓" : ""}</span>
                  Remember me
                </label>
              </div> : null}

              <motion.button
                whileHover={{ scale: 1.02 }}
                whileTap={{ scale: 0.98 }}
                type="submit"
                disabled={isLoading}
                className="signin-submit"
              >
                <span className="signin-submit-shine" aria-hidden="true" />
                <AnimatePresence mode="wait">
                  {isLoading ? (
                    <motion.span
                      key="loading"
                      initial={{ opacity: 0 }}
                      animate={{ opacity: 1 }}
                      exit={{ opacity: 0 }}
                      className="signin-spinner"
                    />
                  ) : (
                    <motion.span
                      key="button-text"
                      initial={{ opacity: 0 }}
                      animate={{ opacity: 1 }}
                      exit={{ opacity: 0 }}
                      className="signin-submit-label"
                    >
                      {submitLabel}
                      <ArrowRight />
                    </motion.span>
                  )}
                </AnimatePresence>
              </motion.button>

              <motion.p
                className="signin-signup"
                initial={{ opacity: 0 }}
                animate={{ opacity: 1 }}
                transition={{ delay: 0.5 }}
              >
                <Link to={footerTo}>{footerLabel}</Link>
              </motion.p>
            </form>
          </div>
        </div>
      </motion.div>
    </motion.div>
  );
}
