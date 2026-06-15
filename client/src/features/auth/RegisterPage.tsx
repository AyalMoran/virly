import { FormEvent, useState } from "react";
import { SignInCard2 } from "../../components/ui/sign-in-card-2";
import { ApiError } from "../../lib/api";
import {
  validateEmail,
  validatePassword,
  validatePhone
} from "../../lib/validation";
import { useAuth } from "./AuthProvider";
import { AuthLayout } from "./AuthLayout";

type RegisterErrors = {
  email?: string;
  password?: string;
  confirmPassword?: string;
  phone?: string;
  form?: string;
};

export function RegisterPage() {
  const auth = useAuth();
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [confirmPassword, setConfirmPassword] = useState("");
  const [phone, setPhone] = useState("");
  const [message, setMessage] = useState("");
  const [errors, setErrors] = useState<RegisterErrors>({});
  const [isSubmitting, setIsSubmitting] = useState(false);

  async function handleSubmit(event: FormEvent) {
    event.preventDefault();
    const nextErrors: RegisterErrors = {
      email: validateEmail(email),
      password: validatePassword(password, "register"),
      confirmPassword: confirmPassword
        ? password === confirmPassword
          ? undefined
          : "Passwords do not match."
        : "Confirm your password.",
      phone: validatePhone(phone)
    };

    if (
      nextErrors.email ||
      nextErrors.password ||
      nextErrors.confirmPassword ||
      nextErrors.phone
    ) {
      setErrors(nextErrors);
      return;
    }

    try {
      setIsSubmitting(true);
      setErrors({});
      setMessage(await auth.register({ email, password, phone }));
    } catch (error) {
      if (error instanceof ApiError) {
        setErrors({
          email: error.status === 409 ? error.message : error.issues.email,
          password: error.issues.password,
          confirmPassword: undefined,
          phone: error.issues.phone,
          form: error.status === 409 ? undefined : error.message
        });
        return;
      }

      setErrors({ form: "Unable to create account." });
    } finally {
      setIsSubmitting(false);
    }
  }

  return (
    <AuthLayout
      title="Create account"
      subtitle=""
      visualText="Virly"
      barePanel
    >
      <SignInCard2
        title="Create account"
        submitLabel="Create account"
        footerLabel="Sign in"
        footerTo="/login"
        email={email}
        password={password}
        confirmPassword={confirmPassword}
        phone={phone}
        emailError={errors.email}
        passwordError={errors.password}
        confirmPasswordError={errors.confirmPassword}
        phoneError={errors.phone}
        formError={errors.form}
        successMessage={message}
        isLoading={isSubmitting}
        onEmailChange={setEmail}
        onPasswordChange={setPassword}
        onConfirmPasswordChange={setConfirmPassword}
        onPhoneChange={setPhone}
        onSubmit={handleSubmit}
      />
    </AuthLayout>
  );
}
