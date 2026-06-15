import { CURRENCY_LABELS, SUPPORTED_DISPLAY_CURRENCIES, isDisplayCurrency } from "../../lib/currency";
import type { DisplayCurrency } from "../../lib/types";
import { useCurrency } from "./CurrencyProvider";

type CurrencySelectorProps = {
  currency?: DisplayCurrency;
  onCurrencyChange?: (currency: DisplayCurrency) => void;
};

/**
 * Display-currency dropdown for the top-right of the app header. Controlled
 * props are optional; by default it binds to the global currency context.
 */
export function CurrencySelector({ currency, onCurrencyChange }: CurrencySelectorProps) {
  const context = useCurrency();
  const selected = currency ?? context.currency;
  const onChange = onCurrencyChange ?? context.setCurrency;

  return (
    <label className="currency-selector">
      <span className="sr-only">Display currency</span>
      <select
        className="currency-selector-input"
        aria-label="Display currency"
        value={selected}
        onChange={(event) => {
          const next = event.target.value;
          if (isDisplayCurrency(next)) {
            onChange(next);
          }
        }}
      >
        {SUPPORTED_DISPLAY_CURRENCIES.map((code) => (
          <option key={code} value={code}>
            {CURRENCY_LABELS[code]}
          </option>
        ))}
      </select>
    </label>
  );
}
