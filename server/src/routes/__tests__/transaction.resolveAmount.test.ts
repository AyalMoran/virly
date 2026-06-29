import { resolveTransferAmount } from "../transaction.routes.js";
import { AppError } from "../../utils/app-error.js";
import type { TransferFxQuote } from "../../services/fx.service.js";

// resolveTransferAmount is a pure function with no DB or network access.

function makeQuote(overrides?: Partial<TransferFxQuote>): TransferFxQuote {
  return {
    enteredAmount: 50,
    enteredCurrency: "USD",
    amountIls: 185.19,
    rate: 3.7038,
    rateFetchedAt: "2026-06-11T06:00:00.000Z",
    rateValidForDate: "2026-06-11",
    baseCurrency: "ILS",
    provider: "exchangerate-api",
    ...overrides
  };
}

describe("resolveTransferAmount — ILS pass-through", () => {
  test("ILS currency returns the entered amount as amountIls with null fx", () => {
    const result = resolveTransferAmount(
      { amount: 100, currency: "ILS" },
      null
    );
    expect(result.amountIls).toBe(100);
    expect(result.fx).toBeNull();
  });

  test("ILS with a non-zero amount round-trips correctly", () => {
    const result = resolveTransferAmount(
      { amount: 0.01, currency: "ILS" },
      null
    );
    expect(result.amountIls).toBe(0.01);
    expect(result.fx).toBeNull();
  });

  test("ILS with a provided quote still returns the entered amount (quote ignored for ILS)", () => {
    const result = resolveTransferAmount(
      { amount: 75, currency: "ILS", quote: { rate: 1, fetchedAt: "2026-06-11T06:00:00.000Z" } },
      null
    );
    expect(result.amountIls).toBe(75);
    expect(result.fx).toBeNull();
  });
});

describe("resolveTransferAmount — non-ILS happy paths", () => {
  test("USD with a matching quote returns the quote's amountIls and fx metadata", () => {
    const quote = makeQuote();
    const result = resolveTransferAmount(
      {
        amount: 50,
        currency: "USD",
        quote: { rate: quote.rate, fetchedAt: quote.rateFetchedAt }
      },
      quote
    );
    expect(result.amountIls).toBe(185.19);
    expect(result.fx).not.toBeNull();
    expect(result.fx!.enteredCurrency).toBe("USD");
    expect(result.fx!.enteredAmount).toBe(50);
    expect(result.fx!.exchangeRateUsed).toBe(quote.rate);
    expect(result.fx!.exchangeRateFetchedAt).toBeInstanceOf(Date);
  });

  test("EUR with a matching quote carries EUR metadata", () => {
    const quote = makeQuote({
      enteredCurrency: "EUR",
      enteredAmount: 30,
      amountIls: 120,
      rate: 4,
      rateFetchedAt: "2026-06-11T06:00:00.000Z"
    });
    const result = resolveTransferAmount(
      {
        amount: 30,
        currency: "EUR",
        quote: { rate: 4, fetchedAt: "2026-06-11T06:00:00.000Z" }
      },
      quote
    );
    expect(result.amountIls).toBe(120);
    expect(result.fx!.enteredCurrency).toBe("EUR");
  });
});

describe("resolveTransferAmount — error conditions", () => {
  test("throws 503 AppError when currency is non-ILS and currentQuote is null", () => {
    expect(() =>
      resolveTransferAmount({ amount: 50, currency: "USD" }, null)
    ).toThrow(AppError);

    try {
      resolveTransferAmount({ amount: 50, currency: "USD" }, null);
    } catch (err) {
      expect(err).toBeInstanceOf(AppError);
      expect((err as AppError).status).toBe(503);
    }
  });

  test("throws 400 AppError with QUOTE_REQUIRED when no quote is supplied for non-ILS", () => {
    const quote = makeQuote();
    try {
      resolveTransferAmount({ amount: 50, currency: "USD" }, quote);
      throw new Error("expected to throw");
    } catch (err) {
      expect(err).toBeInstanceOf(AppError);
      expect((err as AppError).status).toBe(400);
      expect((err as AppError).code).toBe("QUOTE_REQUIRED");
    }
  });

  test("throws 409 AppError with QUOTE_RATE_CHANGED when the rate has changed", () => {
    const quote = makeQuote({ rate: 3.9 });
    try {
      resolveTransferAmount(
        {
          amount: 50,
          currency: "USD",
          quote: { rate: 3.7, fetchedAt: quote.rateFetchedAt }
        },
        quote
      );
      throw new Error("expected to throw");
    } catch (err) {
      expect(err).toBeInstanceOf(AppError);
      expect((err as AppError).status).toBe(409);
      expect((err as AppError).code).toBe("QUOTE_RATE_CHANGED");
    }
  });

  test("throws 409 AppError with QUOTE_RATE_CHANGED when fetchedAt has changed", () => {
    const quote = makeQuote({ rateFetchedAt: "2026-06-11T06:00:00.000Z" });
    try {
      resolveTransferAmount(
        {
          amount: 50,
          currency: "USD",
          quote: { rate: quote.rate, fetchedAt: "2026-06-10T06:00:00.000Z" }
        },
        quote
      );
      throw new Error("expected to throw");
    } catch (err) {
      expect(err).toBeInstanceOf(AppError);
      expect((err as AppError).status).toBe(409);
      expect((err as AppError).code).toBe("QUOTE_RATE_CHANGED");
    }
  });
});
