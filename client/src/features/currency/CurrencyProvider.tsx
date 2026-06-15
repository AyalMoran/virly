import {
  ReactNode,
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useState
} from "react";
import { api } from "../../lib/api";
import {
  formatIlsAmount,
  readStoredCurrency,
  storeCurrency
} from "../../lib/currency";
import type { DisplayCurrency, ExchangeRatesResponse } from "../../lib/types";

export type CurrencyContextValue = {
  /** Selected display currency; all ledger amounts stay ILS underneath. */
  currency: DisplayCurrency;
  setCurrency: (currency: DisplayCurrency) => void;
  rates: ExchangeRatesResponse | null;
  /** False while rates are missing — display falls back to ILS. */
  conversionAvailable: boolean;
  /** Formats an authoritative ILS amount in the selected display currency. */
  formatAmount: (amountIls: number) => string;
};

const defaultValue: CurrencyContextValue = {
  currency: "ILS",
  setCurrency: () => {},
  rates: null,
  conversionAvailable: false,
  formatAmount: (amountIls: number) => formatIlsAmount(amountIls, "ILS", null)
};

const CurrencyContext = createContext<CurrencyContextValue>(defaultValue);

export function CurrencyProvider({
  children,
  initialCurrency,
  initialRates = null
}: {
  children: ReactNode;
  /** Test/seed overrides; production use reads storage and fetches rates. */
  initialCurrency?: DisplayCurrency;
  initialRates?: ExchangeRatesResponse | null;
}) {
  const [currency, setCurrencyState] = useState<DisplayCurrency>(
    () => initialCurrency ?? readStoredCurrency()
  );
  const [rates, setRates] = useState<ExchangeRatesResponse | null>(initialRates);

  useEffect(() => {
    if (initialRates) {
      return;
    }

    let active = true;

    api
      .exchangeRates()
      .then((response) => {
        if (active) {
          setRates(response);
        }
      })
      .catch(() => {
        // Conversion unavailable: amounts keep rendering in ILS.
        if (active) {
          setRates(null);
        }
      });

    return () => {
      active = false;
    };
  }, []);

  const setCurrency = useCallback((next: DisplayCurrency) => {
    setCurrencyState(next);
    storeCurrency(next);
  }, []);

  const formatAmount = useCallback(
    (amountIls: number) => formatIlsAmount(amountIls, currency, rates),
    [currency, rates]
  );

  const value = useMemo(
    () => ({
      currency,
      setCurrency,
      rates,
      conversionAvailable: rates !== null,
      formatAmount
    }),
    [currency, setCurrency, rates, formatAmount]
  );

  return <CurrencyContext.Provider value={value}>{children}</CurrencyContext.Provider>;
}

export function useCurrency() {
  return useContext(CurrencyContext);
}
