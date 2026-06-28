import React from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { OrderConfirmationCard } from "../order-confirmation-card.js";

const baseProps = {
  orderId: "TXN-001",
  paymentMethod: "alice@example.com",
  dateTime: "2024-01-15 14:30",
  totalAmount: "100.00 ILS",
  onGoToAccount: () => {},
};

describe("OrderConfirmationCard", () => {
  describe("required fields", () => {
    it("renders the orderId in the card", () => {
      const html = renderToStaticMarkup(<OrderConfirmationCard {...baseProps} />);
      expect(html).toContain("TXN-001");
    });

    it("renders the payment method (counterparty)", () => {
      const html = renderToStaticMarkup(<OrderConfirmationCard {...baseProps} />);
      expect(html).toContain("alice@example.com");
    });

    it("renders the dateTime", () => {
      const html = renderToStaticMarkup(<OrderConfirmationCard {...baseProps} />);
      expect(html).toContain("2024-01-15 14:30");
    });

    it("renders the totalAmount", () => {
      const html = renderToStaticMarkup(<OrderConfirmationCard {...baseProps} />);
      expect(html).toContain("100.00 ILS");
    });
  });

  describe("default values", () => {
    it("renders default title when title prop is omitted", () => {
      const html = renderToStaticMarkup(<OrderConfirmationCard {...baseProps} />);
      expect(html).toContain("Transaction completed successfully");
    });

    it("renders default button text when buttonText prop is omitted", () => {
      const html = renderToStaticMarkup(<OrderConfirmationCard {...baseProps} />);
      expect(html).toContain("Close");
    });

    it("shows 'No reason provided' when reason is not given", () => {
      const html = renderToStaticMarkup(<OrderConfirmationCard {...baseProps} />);
      expect(html).toContain("No reason provided");
    });
  });

  describe("custom props", () => {
    it("renders a custom title", () => {
      const html = renderToStaticMarkup(
        <OrderConfirmationCard {...baseProps} title="Payment Sent" />
      );
      expect(html).toContain("Payment Sent");
    });

    it("renders a custom buttonText", () => {
      const html = renderToStaticMarkup(
        <OrderConfirmationCard {...baseProps} buttonText="Back to Dashboard" />
      );
      expect(html).toContain("Back to Dashboard");
    });

    it("renders the reason when provided", () => {
      const html = renderToStaticMarkup(
        <OrderConfirmationCard {...baseProps} reason="Rent payment" />
      );
      expect(html).toContain("Rent payment");
    });

    it("shows 'No reason provided' when reason is null", () => {
      const html = renderToStaticMarkup(
        <OrderConfirmationCard {...baseProps} reason={null} />
      );
      expect(html).toContain("No reason provided");
    });

    it("shows 'No reason provided' when reason is whitespace only", () => {
      const html = renderToStaticMarkup(
        <OrderConfirmationCard {...baseProps} reason="   " />
      );
      expect(html).toContain("No reason provided");
    });

    it("renders a custom icon", () => {
      const html = renderToStaticMarkup(
        <OrderConfirmationCard
          {...baseProps}
          icon={<span data-testid="custom-icon">CHECK</span>}
        />
      );
      expect(html).toContain("CHECK");
    });

    it("applies custom className to the card container", () => {
      const html = renderToStaticMarkup(
        <OrderConfirmationCard {...baseProps} className="my-card" />
      );
      expect(html).toContain("my-card");
      expect(html).toMatch(/order-confirmation-card/);
    });
  });

  describe("amount CSS class", () => {
    it("applies amount-debit class for negative amounts (starting with -)", () => {
      const html = renderToStaticMarkup(
        <OrderConfirmationCard {...baseProps} totalAmount="-50.00 ILS" />
      );
      expect(html).toContain("amount-debit");
      expect(html).not.toContain("amount-credit");
    });

    it("applies amount-credit class for positive amounts", () => {
      const html = renderToStaticMarkup(
        <OrderConfirmationCard {...baseProps} totalAmount="+50.00 ILS" />
      );
      expect(html).toContain("amount-credit");
      expect(html).not.toContain("amount-debit");
    });

    it("applies amount-credit class for amounts without sign", () => {
      const html = renderToStaticMarkup(
        <OrderConfirmationCard {...baseProps} totalAmount="200.00 ILS" />
      );
      expect(html).toContain("amount-credit");
      expect(html).not.toContain("amount-debit");
    });

    it("applies amount-debit class for amount starting with - after trim", () => {
      const html = renderToStaticMarkup(
        <OrderConfirmationCard {...baseProps} totalAmount="  -10.00 ILS" />
      );
      // trim().startsWith("-") -> true only if starts with - after trim
      expect(html).toContain("amount-debit");
    });
  });

  describe("row labels", () => {
    it("renders all detail row labels", () => {
      const html = renderToStaticMarkup(<OrderConfirmationCard {...baseProps} />);
      expect(html).toContain("Transaction ID");
      expect(html).toContain("Counterparty");
      expect(html).toContain("Reason");
      expect(html).toContain("Date &amp; Time");
      expect(html).toContain("Total");
    });
  });

  describe("accessibility", () => {
    it("has aria-live polite region", () => {
      const html = renderToStaticMarkup(<OrderConfirmationCard {...baseProps} />);
      expect(html).toMatch(/aria-live="polite"/);
    });
  });
});
