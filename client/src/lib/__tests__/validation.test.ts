import {
  validateAmount,
  validateDateOfBirth,
  validateEmail,
  validatePassword,
  validatePhone,
  validateReason,
  validateRequiredText
} from "../validation";

describe("validateEmail", () => {
  test("requires a value", () => {
    expect(validateEmail("")).toBe("Email is required.");
    expect(validateEmail("   ")).toBe("Email is required.");
  });
  test("rejects malformed addresses", () => {
    expect(validateEmail("not-an-email")).toBe("Enter a valid email address.");
    expect(validateEmail("a@b")).toBe("Enter a valid email address.");
  });
  test("accepts a valid address", () => {
    expect(validateEmail("alice@example.com")).toBeUndefined();
  });
});

describe("validatePassword", () => {
  test("requires a value", () => {
    expect(validatePassword("", "login")).toBe("Password is required.");
  });
  test("enforces an 8-char minimum only on register", () => {
    expect(validatePassword("short", "register")).toBe(
      "Password must be at least 8 characters."
    );
    expect(validatePassword("short", "login")).toBeUndefined();
  });
  test("accepts a long enough register password", () => {
    expect(validatePassword("longenough", "register")).toBeUndefined();
  });
});

describe("validatePhone", () => {
  test("requires a value", () => {
    expect(validatePhone("")).toBe("Phone number is required.");
  });
  test("enforces 9-15 digits with optional leading plus", () => {
    expect(validatePhone("123")).toBe("Phone number must contain 9-15 digits.");
    expect(validatePhone("+972500000000")).toBeUndefined();
    expect(validatePhone("0500000000")).toBeUndefined();
  });
});

describe("validateAmount", () => {
  test("requires a value", () => {
    expect(validateAmount("")).toBe("Amount is required.");
  });
  test("rejects non-positive or non-numeric amounts", () => {
    expect(validateAmount("0")).toBe("Amount must be greater than 0.");
    expect(validateAmount("-5")).toBe("Amount must be greater than 0.");
    expect(validateAmount("abc")).toBe("Amount must be greater than 0.");
  });
  test("rejects amounts above the balance", () => {
    expect(validateAmount("150", 100)).toBe(
      "Amount exceeds your available balance."
    );
  });
  test("accepts a valid amount within balance", () => {
    expect(validateAmount("50", 100)).toBeUndefined();
    expect(validateAmount("50")).toBeUndefined();
  });
});

describe("validateReason", () => {
  test("allows up to 200 characters", () => {
    expect(validateReason("x".repeat(200))).toBeUndefined();
    expect(validateReason("")).toBeUndefined();
  });
  test("rejects over-long reasons", () => {
    expect(validateReason("x".repeat(201))).toBe(
      "Reason must be at most 200 characters."
    );
  });
});

describe("validateRequiredText", () => {
  test("requires a value with a labelled message", () => {
    expect(validateRequiredText("", "City")).toBe("City is required.");
  });
  test("enforces a 120-char maximum", () => {
    expect(validateRequiredText("x".repeat(121), "City")).toBe(
      "City must be at most 120 characters."
    );
  });
  test("accepts valid text", () => {
    expect(validateRequiredText("Tel Aviv", "City")).toBeUndefined();
  });
});

describe("validateDateOfBirth", () => {
  test("requires a value", () => {
    expect(validateDateOfBirth("")).toBe("Date of birth is required.");
  });
  test("rejects an invalid or future date", () => {
    expect(validateDateOfBirth("not-a-date")).toBe(
      "Date of birth must be a valid past date."
    );
    const future = new Date(Date.now() + 86400000).toISOString();
    expect(validateDateOfBirth(future)).toBe(
      "Date of birth must be a valid past date."
    );
  });
  test("accepts a valid past date", () => {
    expect(validateDateOfBirth("1990-01-01")).toBeUndefined();
  });
});
