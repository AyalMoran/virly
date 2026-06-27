import type { Meta, StoryObj } from "@storybook/react-vite";
import { AccountStatement } from "./AccountStatement";
import { formatCurrency } from "@/lib/format";
import { accountSummaryFixture } from "../../../.storybook/fixtures";

const meta = {
  title: "Dashboard/AccountStatement",
  component: AccountStatement,
  parameters: { layout: "padded" },
  args: {
    summary: accountSummaryFixture,
    holderName: "Test User",
    accountNumber: "•••• 4821",
    formatAmount: formatCurrency,
    onSelectTransaction: () => {},
  },
} satisfies Meta<typeof AccountStatement>;

export default meta;
type Story = StoryObj<typeof meta>;

export const Default: Story = {};

/** No ledger entries — the statement's empty state. */
export const Empty: Story = {
  args: {
    summary: { ...accountSummaryFixture, transactions: [], balance: 0 },
  },
};
