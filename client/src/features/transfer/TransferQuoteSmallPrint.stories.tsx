import type { Meta, StoryObj } from "@storybook/react-vite";
import { TransferQuoteSmallPrint } from "./TransferQuoteSmallPrint";
import { transferQuoteFixture } from "../../../.storybook/fixtures";

/** The FX small-print under a non-ILS transfer review. (An ILS quote renders
 *  nothing, so only the foreign-currency state is meaningful.) */
const meta = {
  title: "Transfers/TransferQuoteSmallPrint",
  component: TransferQuoteSmallPrint,
  parameters: { layout: "padded" },
  args: {
    quote: transferQuoteFixture,
  },
} satisfies Meta<typeof TransferQuoteSmallPrint>;

export default meta;
type Story = StoryObj<typeof meta>;

export const Default: Story = {};
