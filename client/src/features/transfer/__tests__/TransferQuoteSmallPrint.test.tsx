/**
 * Tests for TransferQuoteSmallPrint.
 *
 * This is a pure display component with no hooks or router dependency.
 * It renders null for ILS quotes and a disclosure line for foreign-currency quotes.
 */
import React from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { TransferQuoteSmallPrint } from "../TransferQuoteSmallPrint.js";
import type { TransferQuote } from "../../../lib/types.js";

function makeQuote(overrides: Partial<TransferQuote> = {}): TransferQuote {
  return {
    enteredAmount: 100,
    enteredCurrency: "USD",
    amountIls: 370,
    rate: 3.7,
    rateFetchedAt: "2024-06-01T10:00:00Z",
    rateValidForDate: "2024-06-01",
    baseCurrency: "ILS",
    provider: "test-provider",
    ...overrides
  };
}

describe("TransferQuoteSmallPrint", () => {
  describe("ILS quote", () => {
    it("renders nothing for an ILS quote", () => {
      const html = renderToStaticMarkup(
        <TransferQuoteSmallPrint quote={makeQuote({ enteredCurrency: "ILS" })} />
      );
      expect(html).toBe("");
    });
  });

  describe("USD quote", () => {
    it("renders the paragraph element", () => {
      const html = renderToStaticMarkup(
        <TransferQuoteSmallPrint quote={makeQuote()} />
      );
      expect(html).toMatch(/<p[^>]*>/);
    });

    it("includes the transfer-quote-small-print class", () => {
      const html = renderToStaticMarkup(
        <TransferQuoteSmallPrint quote={makeQuote()} />
      );
      expect(html).toMatch(/transfer-quote-small-print/);
    });

    it("includes the entered currency label", () => {
      const html = renderToStaticMarkup(
        <TransferQuoteSmallPrint quote={makeQuote({ enteredCurrency: "USD" })} />
      );
      expect(html).toMatch(/USD/);
    });

    it("includes the rate value", () => {
      const html = renderToStaticMarkup(
        <TransferQuoteSmallPrint quote={makeQuote({ rate: 3.7 })} />
      );
      expect(html).toMatch(/3\.7/);
    });

    it("includes ILS in the disclosure text", () => {
      const html = renderToStaticMarkup(
        <TransferQuoteSmallPrint quote={makeQuote()} />
      );
      expect(html).toMatch(/ILS/);
    });

    it("uses rateValidForDate when present", () => {
      const html = renderToStaticMarkup(
        <TransferQuoteSmallPrint
          quote={makeQuote({ rateValidForDate: "2024-06-01", rateFetchedAt: "2024-05-30T12:00:00Z" })}
        />
      );
      expect(html).toMatch(/2024-06-01/);
      // Should prefer rateValidForDate over the rateFetchedAt date
      expect(html).not.toMatch(/2024-05-30/);
    });

    it("falls back to rateFetchedAt date prefix when rateValidForDate is null", () => {
      const html = renderToStaticMarkup(
        <TransferQuoteSmallPrint
          quote={makeQuote({ rateValidForDate: null, rateFetchedAt: "2024-07-15T08:30:00Z" })}
        />
      );
      expect(html).toMatch(/2024-07-15/);
    });

    it("falls back to 'today' when both rateValidForDate and rateFetchedAt are null", () => {
      const html = renderToStaticMarkup(
        <TransferQuoteSmallPrint
          quote={makeQuote({ rateValidForDate: null, rateFetchedAt: null })}
        />
      );
      expect(html).toMatch(/today/);
    });
  });

  describe("EUR quote", () => {
    it("renders disclosure for EUR currency", () => {
      const html = renderToStaticMarkup(
        <TransferQuoteSmallPrint
          quote={makeQuote({ enteredCurrency: "EUR", rate: 3.9, amountIls: 390 })}
        />
      );
      expect(html).toMatch(/EUR/);
      expect(html).toMatch(/ILS/);
      expect(html).toMatch(/3\.9/);
    });
  });

  describe("amountIls formatting", () => {
    it("includes the amountIls value in the output", () => {
      const html = renderToStaticMarkup(
        <TransferQuoteSmallPrint quote={makeQuote({ amountIls: 1234.56 })} />
      );
      // formatCurrency formats in ILS — just check for the numeric content
      expect(html).toMatch(/1[,.]?234/);
    });
  });
});
