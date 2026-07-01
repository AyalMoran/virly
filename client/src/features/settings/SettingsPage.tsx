import { FormEvent, useEffect, useState } from "react";
import { useNavigate } from "react-router-dom";
import {
  Button,
  Card,
  ErrorBanner,
  Field,
  PageHeader,
  PageStack,
  ResponsiveGrid,
  Skeleton,
  SuccessBanner
} from "../../components/Primitives";
import { ApiError, api } from "../../lib/api";
import { useAuth } from "../auth/AuthProvider";
import { useCurrency } from "../currency/CurrencyProvider";
import type { PersonalDetails } from "../../lib/types";
import { validateDateOfBirth, validateRequiredText } from "../../lib/validation";
import { CommunicationProfileTab } from "./CommunicationProfileTab";

type SettingsTab = "profile" | "ai";

type DetailsForm = {
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

type DetailsErrors = Partial<Record<keyof DetailsForm | "form", string>>;

const emptyDetailsForm: DetailsForm = {
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

function toDateInputValue(value: string | null) {
  return value ? value.slice(0, 10) : "";
}

function toDetailsForm(details: PersonalDetails | null): DetailsForm {
  if (!details) {
    return emptyDetailsForm;
  }

  return {
    firstName: details.firstName ?? "",
    lastName: details.lastName ?? "",
    dateOfBirth: toDateInputValue(details.dateOfBirth),
    country: details.address.country ?? "",
    stateRegion: details.address.stateRegion ?? "",
    city: details.address.city ?? "",
    street: details.address.street ?? "",
    addressLine2: details.address.addressLine2 ?? "",
    postalCode: details.address.postalCode ?? ""
  };
}

function displayValue(value?: string | null) {
  return value?.trim() ? value : "Not provided";
}

function formatPersonalDate(value: string | null | undefined) {
  if (!value) {
    return "Not provided";
  }

  return new Intl.DateTimeFormat("en-US", {
    month: "short",
    day: "numeric",
    year: "numeric"
  }).format(new Date(value));
}

export function SettingsPage() {
  const auth = useAuth();
  const { formatAmount } = useCurrency();
  const navigate = useNavigate();
  const [tab, setTab] = useState<SettingsTab>("profile");
  const [details, setDetails] = useState<PersonalDetails | null>(null);
  const [form, setForm] = useState<DetailsForm>(emptyDetailsForm);
  const [errors, setErrors] = useState<DetailsErrors>({});
  const [isLoadingDetails, setIsLoadingDetails] = useState(true);
  const [isEditingDetails, setIsEditingDetails] = useState(false);
  const [isSavingDetails, setIsSavingDetails] = useState(false);
  const [successMessage, setSuccessMessage] = useState("");

  useEffect(() => {
    let isMounted = true;

    async function loadPersonalDetails() {
      try {
        setIsLoadingDetails(true);
        setErrors({});
        const response = await api.personalDetails();

        if (!isMounted) {
          return;
        }

        setDetails(response.personalDetails);
        setForm(toDetailsForm(response.personalDetails));
      } catch (error) {
        if (!isMounted) {
          return;
        }

        setErrors({
          form:
            error instanceof Error
              ? error.message
              : "Unable to load personal details."
        });
      } finally {
        if (isMounted) {
          setIsLoadingDetails(false);
        }
      }
    }

    loadPersonalDetails();

    return () => {
      isMounted = false;
    };
  }, []);

  async function handleLogout() {
    await auth.logout();
    navigate("/login", { replace: true });
  }

  function updateField(name: keyof DetailsForm, value: string) {
    setForm((current) => ({ ...current, [name]: value }));
    setErrors((current) => ({ ...current, [name]: undefined, form: undefined }));
    setSuccessMessage("");
  }

  function validateForm() {
    const nextErrors: DetailsErrors = {
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
    ) as DetailsErrors;
  }

  function handleEditDetails() {
    setForm(toDetailsForm(details));
    setErrors({});
    setSuccessMessage("");
    setIsEditingDetails(true);
  }

  function handleCancelDetails() {
    setForm(toDetailsForm(details));
    setErrors({});
    setIsEditingDetails(false);
  }

  async function handleSaveDetails(event: FormEvent) {
    event.preventDefault();
    const nextErrors = validateForm();

    if (Object.keys(nextErrors).length) {
      setErrors(nextErrors);
      return;
    }

    try {
      setIsSavingDetails(true);
      setErrors({});
      setSuccessMessage("");
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

      setDetails(response.personalDetails);
      setForm(toDetailsForm(response.personalDetails));
      setIsEditingDetails(false);
      setSuccessMessage("Personal details updated.");

      if (auth.user) {
        auth.setSession({
          ...auth.user,
          personalDetailsId: response.personalDetails.id,
          personalDetailsStatus: response.personalDetails.status,
          needsPersonalDetails: false
        });
      }
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
        form:
          error instanceof Error
            ? error.message
            : "Unable to save personal details."
      });
    } finally {
      setIsSavingDetails(false);
    }
  }

  return (
    <PageStack>
      <PageHeader eyebrow="" title="Settings" />
      <nav className="settings-tabs" aria-label="Settings sections">
        <button
          type="button"
          className={`settings-tab${tab === "profile" ? " settings-tab--active" : ""}`}
          aria-current={tab === "profile" ? "page" : undefined}
          onClick={() => setTab("profile")}
        >
          Profile
        </button>
        <button
          type="button"
          className={`settings-tab${tab === "ai" ? " settings-tab--active" : ""}`}
          aria-current={tab === "ai" ? "page" : undefined}
          onClick={() => setTab("ai")}
        >
          AI Assistant
        </button>
      </nav>
      {tab === "ai" ? (
        <CommunicationProfileTab />
      ) : (
      <ResponsiveGrid className="settings-grid" variant="sidebar">
        <Card className="settings-details-card">
          <div className="settings-card-header">
            <div>
              <h2>Personal details</h2>
              <p>Keep your customer profile up to date.</p>
            </div>
            {!isEditingDetails && !isLoadingDetails ? (
              <Button type="button" variant="secondary" onClick={handleEditDetails}>
                Edit
              </Button>
            ) : null}
          </div>

          {isLoadingDetails ? <Skeleton rows={6} /> : null}

          {!isLoadingDetails && errors.form ? (
            <ErrorBanner message={errors.form} />
          ) : null}

          {!isLoadingDetails && successMessage ? (
            <SuccessBanner message={successMessage} />
          ) : null}

          {!isLoadingDetails && !isEditingDetails ? (
            <dl className="profile-list settings-profile-list">
              <div>
                <dt>Full name</dt>
                <dd>
                  {details?.firstName || details?.lastName
                    ? `${details.firstName ?? ""} ${details.lastName ?? ""}`.trim()
                    : "Not provided"}
                </dd>
              </div>
              <div>
                <dt>Date of birth</dt>
                <dd>{formatPersonalDate(details?.dateOfBirth)}</dd>
              </div>
              <div>
                <dt>Country</dt>
                <dd>{displayValue(details?.address.country)}</dd>
              </div>
              <div>
                <dt>State / region</dt>
                <dd>{displayValue(details?.address.stateRegion)}</dd>
              </div>
              <div>
                <dt>City</dt>
                <dd>{displayValue(details?.address.city)}</dd>
              </div>
              <div>
                <dt>Street</dt>
                <dd>{displayValue(details?.address.street)}</dd>
              </div>
              <div>
                <dt>Address line 2</dt>
                <dd>{displayValue(details?.address.addressLine2)}</dd>
              </div>
              <div>
                <dt>Postal code</dt>
                <dd>{displayValue(details?.address.postalCode)}</dd>
              </div>
            </dl>
          ) : null}

          {!isLoadingDetails && isEditingDetails ? (
            <form className="settings-details-form" onSubmit={handleSaveDetails} noValidate>
              <div className="settings-form-grid two-columns">
                <Field
                  label="First name"
                  name="firstName"
                  value={form.firstName}
                  autoComplete="given-name"
                  error={errors.firstName}
                  onChange={(event) => updateField("firstName", event.target.value)}
                />
                <Field
                  label="Last name"
                  name="lastName"
                  value={form.lastName}
                  autoComplete="family-name"
                  error={errors.lastName}
                  onChange={(event) => updateField("lastName", event.target.value)}
                />
              </div>

              <Field
                label="Date of birth"
                name="dateOfBirth"
                type="date"
                value={form.dateOfBirth}
                autoComplete="bday"
                error={errors.dateOfBirth}
                onChange={(event) => updateField("dateOfBirth", event.target.value)}
              />

              <div className="settings-form-grid two-columns">
                <Field
                  label="Country"
                  name="country"
                  value={form.country}
                  autoComplete="country-name"
                  error={errors.country}
                  onChange={(event) => updateField("country", event.target.value)}
                />
                <Field
                  label="State / region"
                  name="stateRegion"
                  value={form.stateRegion}
                  autoComplete="address-level1"
                  onChange={(event) => updateField("stateRegion", event.target.value)}
                />
              </div>

              <div className="settings-form-grid two-columns">
                <Field
                  label="City"
                  name="city"
                  value={form.city}
                  autoComplete="address-level2"
                  error={errors.city}
                  onChange={(event) => updateField("city", event.target.value)}
                />
                <Field
                  label="Postal code"
                  name="postalCode"
                  value={form.postalCode}
                  autoComplete="postal-code"
                  error={errors.postalCode}
                  onChange={(event) => updateField("postalCode", event.target.value)}
                />
              </div>

              <Field
                label="Street"
                name="street"
                value={form.street}
                autoComplete="address-line1"
                error={errors.street}
                onChange={(event) => updateField("street", event.target.value)}
              />
              <Field
                label="Address line 2"
                name="addressLine2"
                value={form.addressLine2}
                autoComplete="address-line2"
                onChange={(event) => updateField("addressLine2", event.target.value)}
              />

              <div className="button-row">
                <Button type="submit" disabled={isSavingDetails}>
                  {isSavingDetails ? "Saving..." : "Save changes"}
                </Button>
                <Button
                  type="button"
                  variant="ghost"
                  disabled={isSavingDetails}
                  onClick={handleCancelDetails}
                >
                  Cancel
                </Button>
              </div>
            </form>
          ) : null}
        </Card>

        <div className="settings-side-stack">
          <Card>
            <h2>Account</h2>
            <dl className="profile-list">
              <div>
                <dt>Email</dt>
                <dd>{auth.user?.email}</dd>
              </div>
              <div>
                <dt>Balance</dt>
                <dd>{formatAmount(auth.user?.balance ?? 0)}</dd>
              </div>
            </dl>
          </Card>
          <Card>
            <h2>Session</h2>
            <Button type="button" variant="danger" onClick={handleLogout}>
              Sign out
            </Button>
          </Card>
        </div>
      </ResponsiveGrid>
      )}
    </PageStack>
  );
}
