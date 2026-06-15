const emailPattern = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
const phonePattern = /^\+?[0-9]{9,15}$/;

export type FieldErrors<T extends string> = Partial<Record<T, string>>;

export function validateEmail(value: string) {
  if (!value.trim()) {
    return "Email is required.";
  }

  if (!emailPattern.test(value.trim())) {
    return "Enter a valid email address.";
  }

  return undefined;
}

export function validatePassword(value: string, mode: "login" | "register") {
  if (!value) {
    return "Password is required.";
  }

  if (mode === "register" && value.length < 8) {
    return "Password must be at least 8 characters.";
  }

  return undefined;
}

export function validatePhone(value: string) {
  if (!value.trim()) {
    return "Phone number is required.";
  }

  if (!phonePattern.test(value.trim())) {
    return "Phone number must contain 9-15 digits.";
  }

  return undefined;
}

export function validateAmount(value: string, balance?: number) {
  if (!value.trim()) {
    return "Amount is required.";
  }

  const amount = Number(value);
  if (!Number.isFinite(amount) || amount <= 0) {
    return "Amount must be greater than 0.";
  }

  if (balance !== undefined && amount > balance) {
    return "Amount exceeds your available balance.";
  }

  return undefined;
}

export function validateReason(value: string) {
  if (value.length > 200) {
    return "Reason must be at most 200 characters.";
  }

  return undefined;
}

export function validateRequiredText(value: string, label: string) {
  if (!value.trim()) {
    return `${label} is required.`;
  }

  if (value.trim().length > 120) {
    return `${label} must be at most 120 characters.`;
  }

  return undefined;
}

export function validateDateOfBirth(value: string) {
  if (!value.trim()) {
    return "Date of birth is required.";
  }

  const date = new Date(value);
  if (!Number.isFinite(date.getTime()) || date.getTime() >= Date.now()) {
    return "Date of birth must be a valid past date.";
  }

  return undefined;
}
