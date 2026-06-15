import { FormEvent, useState } from "react";
import { AnimatePresence, motion } from "framer-motion";
import { ArrowRight, Calendar, Home, MapPin, UserRound } from "lucide-react";
import { ApiError, api } from "../../lib/api";
import { validateDateOfBirth, validateRequiredText } from "../../lib/validation";
import { useAuth } from "../auth/AuthProvider";

type FormState = {
  firstName: string;
  lastName: string;
  dateOfBirth: string;
  country: string;
  stateRegion: string;
  city: string;
  street: string;
  addressLine2: string;
  postalCode: string;
};

type FormErrors = Partial<Record<keyof FormState | "form", string>>;
type FieldName = keyof FormState;

const initialForm: FormState = {
  firstName: "",
  lastName: "",
  dateOfBirth: "",
  country: "",
  stateRegion: "",
  city: "",
  street: "",
  addressLine2: "",
  postalCode: ""
};

export function PersonalDetailsAuthForm({ onComplete }: { onComplete: () => void }) {
  const auth = useAuth();
  const [form, setForm] = useState<FormState>(initialForm);
  const [errors, setErrors] = useState<FormErrors>({});
  const [focusedField, setFocusedField] = useState<FieldName | null>(null);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [isSkipping, setIsSkipping] = useState(false);

  function updateField(name: FieldName, value: string) {
    setForm((current) => ({ ...current, [name]: value }));
  }

  function validateForm() {
    const nextErrors: FormErrors = {
      firstName: validateRequiredText(form.firstName, "First name"),
      lastName: validateRequiredText(form.lastName, "Last name"),
      dateOfBirth: validateDateOfBirth(form.dateOfBirth),
      country: validateRequiredText(form.country, "Country"),
      city: validateRequiredText(form.city, "City"),
      street: validateRequiredText(form.street, "Street"),
      postalCode: validateRequiredText(form.postalCode, "Postal code")
    };

    return Object.fromEntries(
      Object.entries(nextErrors).filter(([, value]) => Boolean(value))
    ) as FormErrors;
  }

  async function handleSubmit(event: FormEvent) {
    event.preventDefault();
    const nextErrors = validateForm();

    if (Object.keys(nextErrors).length) {
      setErrors(nextErrors);
      return;
    }

    try {
      setIsSubmitting(true);
      setErrors({});
      const response = await api.updatePersonalDetails({
        firstName: form.firstName,
        lastName: form.lastName,
        dateOfBirth: form.dateOfBirth,
        address: {
          country: form.country,
          stateRegion: form.stateRegion,
          city: form.city,
          street: form.street,
          addressLine2: form.addressLine2,
          postalCode: form.postalCode
        }
      });

      if (auth.user) {
        auth.setSession({
          ...auth.user,
          personalDetailsId: response.personalDetails.id,
          personalDetailsStatus: response.personalDetails.status,
          needsPersonalDetails: false
        });
      }

      onComplete();
    } catch (error) {
      const apiErrors = error instanceof ApiError ? error.issues : {};
      setErrors({
        firstName: apiErrors.firstName,
        lastName: apiErrors.lastName,
        dateOfBirth: apiErrors.dateOfBirth,
        country: apiErrors["address.country"],
        city: apiErrors["address.city"],
        street: apiErrors["address.street"],
        postalCode: apiErrors["address.postalCode"],
        form: error instanceof Error ? error.message : "Unable to save personal details."
      });
    } finally {
      setIsSubmitting(false);
    }
  }

  async function handleSkip() {
    try {
      setIsSkipping(true);
      setErrors({});
      await api.skipPersonalDetails();
      onComplete();
    } catch (error) {
      setErrors({
        form: error instanceof Error ? error.message : "Unable to skip personal details."
      });
    } finally {
      setIsSkipping(false);
    }
  }

  function renderField({
    name,
    label,
    icon,
    type = "text",
    autoComplete
  }: {
    name: FieldName;
    label: string;
    icon: JSX.Element;
    type?: string;
    autoComplete?: string;
  }) {
    return (
      <div>
        <motion.label
          className={`signin-field profile-auth-field ${
            focusedField === name ? "focused" : ""
          }`}
          htmlFor={`personal-${name}`}
          whileHover={{ scale: 1.01 }}
          transition={{ type: "spring", stiffness: 400, damping: 25 }}
        >
          {icon}
          <input
            id={`personal-${name}`}
            className="signin-input"
            name={name}
            type={type}
            placeholder={label}
            value={form[name]}
            aria-invalid={Boolean(errors[name])}
            autoComplete={autoComplete}
            onChange={(event) => updateField(name, event.target.value)}
            onFocus={() => setFocusedField(name)}
            onBlur={() => setFocusedField(null)}
          />
        </motion.label>
        {errors[name] ? <span className="signin-field-error">{errors[name]}</span> : null}
      </div>
    );
  }

  return (
    <motion.div
      className="signin-card-wrap profile-auth-wrap"
      initial={{ opacity: 0, y: 24, scale: 0.98 }}
      animate={{ opacity: 1, y: 0, scale: 1 }}
      exit={{ opacity: 0, y: -18, scale: 0.98 }}
      transition={{ duration: 0.45 }}
    >
      <div className="signin-card-group">
        <div className="signin-card-glow" />
        <div className="signin-card profile-auth-card">
          <div className="signin-card-pattern" aria-hidden="true" />
          <div className="signin-header">
            <div className="signin-logo">V</div>
            <h1>Personal details</h1>
          </div>

          <form className="signin-form profile-auth-form" onSubmit={handleSubmit} noValidate>
            {errors.form ? (
              <motion.div
                className="signin-error"
                role="alert"
                initial={{ opacity: 0, y: -6 }}
                animate={{ opacity: 1, y: 0 }}
              >
                {errors.form}
              </motion.div>
            ) : null}

            <div className="profile-auth-grid two-columns">
              {renderField({
                name: "firstName",
                label: "First name",
                icon: <UserRound aria-hidden="true" />,
                autoComplete: "given-name"
              })}
              {renderField({
                name: "lastName",
                label: "Last name",
                icon: <UserRound aria-hidden="true" />,
                autoComplete: "family-name"
              })}
            </div>

            {renderField({
              name: "dateOfBirth",
              label: "Date of birth",
              icon: <Calendar aria-hidden="true" />,
              type: "date",
              autoComplete: "bday"
            })}

            <div className="profile-auth-grid two-columns">
              {renderField({
                name: "country",
                label: "Country",
                icon: <MapPin aria-hidden="true" />,
                autoComplete: "country-name"
              })}
              {renderField({
                name: "stateRegion",
                label: "State / region",
                icon: <MapPin aria-hidden="true" />,
                autoComplete: "address-level1"
              })}
            </div>

            <div className="profile-auth-grid two-columns">
              {renderField({
                name: "city",
                label: "City",
                icon: <MapPin aria-hidden="true" />,
                autoComplete: "address-level2"
              })}
              {renderField({
                name: "postalCode",
                label: "Postal code",
                icon: <MapPin aria-hidden="true" />,
                autoComplete: "postal-code"
              })}
            </div>

            {renderField({
              name: "street",
              label: "Street",
              icon: <Home aria-hidden="true" />,
              autoComplete: "address-line1"
            })}
            {renderField({
              name: "addressLine2",
              label: "Address line 2",
              icon: <Home aria-hidden="true" />,
              autoComplete: "address-line2"
            })}

            <motion.button
              whileHover={{ scale: 1.02 }}
              whileTap={{ scale: 0.98 }}
              type="submit"
              disabled={isSubmitting || isSkipping}
              className="signin-submit"
            >
              <span className="signin-submit-shine" aria-hidden="true" />
              <AnimatePresence mode="wait">
                {isSubmitting ? (
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
                    Save details
                    <ArrowRight />
                  </motion.span>
                )}
              </AnimatePresence>
            </motion.button>

            <button
              type="button"
              className="profile-auth-skip"
              onClick={handleSkip}
              disabled={isSubmitting || isSkipping}
            >
              {isSkipping ? "Skipping..." : "Skip for now"}
            </button>
          </form>
        </div>
      </div>
    </motion.div>
  );
}
