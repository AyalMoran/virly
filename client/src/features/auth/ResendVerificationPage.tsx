import { FormEvent, useState } from "react";
import { Link, useLocation } from "react-router-dom";
import { Button, ErrorBanner, Field, SuccessBanner } from "../../components/Primitives";
import { validateEmail } from "../../lib/validation";
import { useAuth } from "./AuthProvider";
import { AuthLayout } from "./AuthLayout";

export function ResendVerificationPage() {
  const auth = useAuth();
  const location = useLocation();
  const seededEmail = (location.state as { email?: string } | null)?.email ?? "";
  const [email, setEmail] = useState(seededEmail);
  const [error, setError] = useState("");
  const [message, setMessage] = useState("");
  const [isSubmitting, setIsSubmitting] = useState(false);

  async function handleSubmit(event: FormEvent) {
    event.preventDefault();
    const emailError = validateEmail(email);
    if (emailError) {
      setError(emailError);
      return;
    }

    try {
      setError("");
      setIsSubmitting(true);
      setMessage(await auth.resendVerification(email));
    } catch (resendError) {
      setError(resendError instanceof Error ? resendError.message : "Unable to resend.");
    } finally {
      setIsSubmitting(false);
    }
  }

  return (
    <AuthLayout
      title="Verify email"
      subtitle=""
    >
      <form className="form-stack" onSubmit={handleSubmit} noValidate>
        {message ? <SuccessBanner message={message} /> : null}
        {error ? <ErrorBanner message={error} /> : null}
        <Field
          label="Email"
          name="email"
          type="email"
          value={email}
          onChange={(event) => setEmail(event.target.value)}
        />
        <Button type="submit" disabled={isSubmitting}>
          {isSubmitting ? "Sending..." : "Send verification link"}
        </Button>
      </form>
      <p className="auth-link">
        <Link to="/login">Sign in</Link>
      </p>
    </AuthLayout>
  );
}
