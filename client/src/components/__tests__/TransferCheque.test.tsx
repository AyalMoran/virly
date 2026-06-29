import React from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { MemoryRouter } from "react-router-dom";
import { TransferCheque, type TransferChequeProps } from "../TransferCheque.js";

function render(props: TransferChequeProps): string {
  return renderToStaticMarkup(
    <MemoryRouter>
      <TransferCheque {...props} />
    </MemoryRouter>
  );
}

const baseFormProps: TransferChequeProps = {
  mode: "form",
  chequeNumber: "000042",
  issueDate: "Jun 25, 2026",
  holderEmail: "alice@example.com",
  currency: "ILS",
  payee: "",
  recipientEmail: "",
  amount: "",
  reason: "",
};

const baseReviewProps: TransferChequeProps = {
  ...baseFormProps,
  mode: "review",
  payee: "bob@example.com",
  recipientEmail: "bob@example.com",
  amount: "250",
  reason: "Lunch",
};

const baseSuccessProps: TransferChequeProps = {
  ...baseReviewProps,
  mode: "success",
};

// ---------------------------------------------------------------------------
// Shared structural elements
// ---------------------------------------------------------------------------

describe("TransferCheque — shared structure", () => {
  it("renders article with aria-label Cheque", () => {
    const html = render(baseFormProps);
    expect(html).toMatch(/aria-label="Cheque"/);
  });

  it("renders the cheque number in the header", () => {
    const html = render(baseFormProps);
    expect(html).toMatch(/No\. 000042/);
  });

  it("renders the issue date", () => {
    const html = render(baseFormProps);
    expect(html).toMatch(/Jun 25, 2026/);
  });

  it("renders Virly brand name", () => {
    const html = render(baseFormProps);
    expect(html).toMatch(/Virly/);
  });

  it("renders ILS glyph for ILS currency", () => {
    const html = render(baseFormProps);
    expect(html).toMatch(/₪/);
  });

  it("renders USD glyph for USD currency", () => {
    const html = render({ ...baseFormProps, currency: "USD" });
    expect(html).toMatch(/\$/);
  });

  it("renders EUR glyph for EUR currency", () => {
    const html = render({ ...baseFormProps, currency: "EUR" });
    expect(html).toMatch(/€/);
  });

  it("renders MICR line with cheque number", () => {
    const html = render(baseFormProps);
    expect(html).toMatch(/000042/);
  });
});

// ---------------------------------------------------------------------------
// Form mode
// ---------------------------------------------------------------------------

describe("TransferCheque — form mode", () => {
  it("renders email input for recipient", () => {
    const html = render(baseFormProps);
    expect(html).toMatch(/type="email"/);
    expect(html).toMatch(/id="recipientEmail"/);
  });

  it("renders amount input", () => {
    const html = render(baseFormProps);
    expect(html).toMatch(/type="number"/);
    expect(html).toMatch(/id="amount"/);
  });

  it("renders memo input", () => {
    const html = render(baseFormProps);
    expect(html).toMatch(/id="reason"/);
  });

  it("renders currency select", () => {
    const html = render(baseFormProps);
    expect(html).toMatch(/<select/);
    expect(html).toMatch(/id="transfer-currency"/);
  });

  it("shows ghost sign-on-send placeholder in signature line", () => {
    const html = render(baseFormProps);
    expect(html).toMatch(/sign on send/);
    expect(html).toMatch(/is-ghost/);
  });

  it("shows recipient email error when provided", () => {
    const html = render({
      ...baseFormProps,
      errors: { recipientEmail: "Invalid email" },
    });
    expect(html).toMatch(/Invalid email/);
  });

  it("shows amount error when provided", () => {
    const html = render({
      ...baseFormProps,
      errors: { amount: "Amount required" },
    });
    expect(html).toMatch(/Amount required/);
  });

  it("renders amount-in-words when amount is valid positive number", () => {
    const html = render({ ...baseFormProps, amount: "100" });
    expect(html).toMatch(/One hundred/);
  });

  it("renders dash placeholder when amount is empty", () => {
    const html = render({ ...baseFormProps, amount: "" });
    expect(html).toMatch(/cheque-words-text is-empty/);
  });

  it("marks amount box with has-error when amount error present in form mode", () => {
    const html = render({
      ...baseFormProps,
      errors: { amount: "Too big" },
    });
    expect(html).toMatch(/has-error/);
  });
});

// ---------------------------------------------------------------------------
// Review mode
// ---------------------------------------------------------------------------

describe("TransferCheque — review mode", () => {
  it("renders payee as a link to /users/<encoded-email>", () => {
    const html = render(baseReviewProps);
    expect(html).toMatch(/\/users\/bob%40example\.com/);
    expect(html).toMatch(/bob@example\.com/);
  });

  it("does not render email input in review mode", () => {
    const html = render(baseReviewProps);
    expect(html).not.toMatch(/type="email"/);
  });

  it("renders static amount figure", () => {
    const html = render(baseReviewProps);
    expect(html).toMatch(/250\.00/);
  });

  it("renders amount-in-words for the given amount", () => {
    const html = render(baseReviewProps);
    expect(html).toMatch(/Two hundred fifty/);
  });

  it("renders static memo text", () => {
    const html = render(baseReviewProps);
    expect(html).toMatch(/Lunch/);
  });

  it("renders holder name derived from email in signature", () => {
    const html = render(baseReviewProps);
    // signatureName("alice@example.com") -> "Alice"
    expect(html).toMatch(/Alice/);
  });

  it("does not render currency select in review mode", () => {
    const html = render(baseReviewProps);
    expect(html).not.toMatch(/<select/);
  });

  it("does not render cleared stamp in review mode", () => {
    const html = render(baseReviewProps);
    expect(html).not.toMatch(/Cleared/);
  });
});

// ---------------------------------------------------------------------------
// Success mode
// ---------------------------------------------------------------------------

describe("TransferCheque — success mode", () => {
  it("renders Cleared stamp in success mode", () => {
    const html = render(baseSuccessProps);
    expect(html).toMatch(/Cleared/);
    expect(html).toMatch(/cheque-stamp/);
  });

  it("renders payee link in success mode", () => {
    const html = render(baseSuccessProps);
    expect(html).toMatch(/bob@example\.com/);
  });

  it("renders holder name in signature in success mode", () => {
    const html = render(baseSuccessProps);
    expect(html).toMatch(/Alice/);
  });
});

// ---------------------------------------------------------------------------
// signatureName edge cases (observable via rendered output)
// ---------------------------------------------------------------------------

describe("TransferCheque — signature name derivation", () => {
  it("shows Virly Account when holderEmail is null", () => {
    const html = render({ ...baseReviewProps, holderEmail: null });
    expect(html).toMatch(/Virly Account/);
  });

  it("shows Virly Account when holderEmail is undefined", () => {
    const html = render({ ...baseReviewProps, holderEmail: undefined });
    expect(html).toMatch(/Virly Account/);
  });

  it("capitalizes dot-separated name parts from email", () => {
    const html = render({ ...baseReviewProps, holderEmail: "john.doe@example.com" });
    expect(html).toMatch(/John Doe/);
  });

  it("capitalizes underscore-separated name parts from email", () => {
    const html = render({ ...baseReviewProps, holderEmail: "jane_smith@virly.com" });
    expect(html).toMatch(/Jane Smith/);
  });
});

// ---------------------------------------------------------------------------
// Currency label in words
// ---------------------------------------------------------------------------

describe("TransferCheque — currency words", () => {
  it("shows Dollars for USD currency", () => {
    const html = render({ ...baseFormProps, currency: "USD", amount: "50" });
    expect(html).toMatch(/Dollars/);
  });

  it("shows Euros for EUR currency", () => {
    const html = render({ ...baseFormProps, currency: "EUR", amount: "50" });
    expect(html).toMatch(/Euros/);
  });

  it("shows Shekels for ILS currency", () => {
    const html = render({ ...baseFormProps, currency: "ILS", amount: "50" });
    expect(html).toMatch(/Shekels/);
  });
});
