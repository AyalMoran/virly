import type { Meta, StoryObj } from "@storybook/react-vite";
import { CurrencySelector } from "../CurrencySelector";

/** Display-currency dropdown. Uncontrolled it binds to the currency context;
 *  it also accepts controlled `currency` / `onCurrencyChange` props. */
const meta = {
  title: "Shared UI/CurrencySelector",
  component: CurrencySelector,
  parameters: { layout: "centered" },
} satisfies Meta<typeof CurrencySelector>;

export default meta;
type Story = StoryObj<typeof meta>;

/** Bound to the context (ILS by default). */
export const Default: Story = {};

/** Context set to USD. */
export const UsdContext: Story = {
  parameters: { currency: "USD" },
};

/** Controlled to EUR via props. */
export const ControlledEur: Story = {
  args: { currency: "EUR", onCurrencyChange: () => {} },
};
