import React from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { MemoryRouter } from "react-router-dom";
import { CurrencyProvider } from "../../features/currency/CurrencyProvider.js";
import { ShellTopbar } from "../ShellTopbar.js";

// CurrencySelector uses useCurrency() which requires CurrencyProvider context.
// We provide an initialCurrency of "ILS" with no rates so formatAmount falls
// back to ILS formatting, keeping all tests deterministic.

function render(props: {
  displayName: string;
  email: string;
  balance: number;
  enteredFromAuth: boolean;
}): string {
  return renderToStaticMarkup(
    <MemoryRouter>
      <CurrencyProvider initialCurrency="ILS" initialRates={null}>
        <ShellTopbar {...props} />
      </CurrencyProvider>
    </MemoryRouter>
  );
}

const BASE = {
  displayName: "Alice Smith",
  email: "alice.smith@example.com",
  balance: 1000,
  enteredFromAuth: false,
};

describe("ShellTopbar", () => {
  it("renders Virly home link", () => {
    const html = render(BASE);
    expect(html).toMatch(/href="\/dashboard"/);
    expect(html).toMatch(/aria-label="Virly home"/);
  });

  it("renders the Virly wordmark text", () => {
    const html = render(BASE);
    expect(html).toMatch(/Virly/);
  });

  it("renders the display name", () => {
    const html = render(BASE);
    expect(html).toMatch(/Alice Smith/);
  });

  it("renders avatar initials from email (first two chars, uppercased)", () => {
    const html = render(BASE);
    // email.slice(0, 2).toUpperCase() = "AL"
    expect(html).toMatch(/AL/);
  });

  it("renders the formatted balance", () => {
    const html = render(BASE);
    // With ILS currency and no rates, formatAmount falls back to ILS formatting
    // which should include the balance value somewhere
    expect(html).toMatch(/1,000|1000/);
  });

  it("renders sr-only text for balance accessibility", () => {
    const html = render(BASE);
    expect(html).toMatch(/sr-only/);
    expect(html).toMatch(/Current balance/);
  });

  it("renders topbar landmark element", () => {
    const html = render(BASE);
    expect(html).toMatch(/class="topbar"/);
  });

  it("renders with a different display name", () => {
    const html = render({ ...BASE, displayName: "John Doe", email: "john@example.com" });
    expect(html).toMatch(/John Doe/);
    // Avatar: "JO"
    expect(html).toMatch(/JO/);
  });

  it("renders zero balance", () => {
    const html = render({ ...BASE, balance: 0 });
    // Should render 0.00 or similar
    expect(html).toMatch(/0\.00|0,00/);
  });

  it("renders the topbar-user-meta section", () => {
    const html = render(BASE);
    expect(html).toMatch(/topbar-user-meta/);
    expect(html).toMatch(/topbar-user-name/);
    expect(html).toMatch(/topbar-user-balance/);
  });
});
