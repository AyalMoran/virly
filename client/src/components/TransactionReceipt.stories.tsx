import type { Meta, StoryObj } from "@storybook/react-vite";
import { TransactionReceipt } from "./TransactionReceipt";
import { fxTransactionFixture, transactionsFixture } from "../../.storybook/fixtures";

/** The printed receipt for a single cleared transaction. Read-only; `onClose`
 *  just dismisses the surface. */
const meta = {
  title: "Transactions/TransactionReceipt",
  component: TransactionReceipt,
  parameters: { layout: "fullscreen" },
  args: {
    onClose: () => {},
  },
} satisfies Meta<typeof TransactionReceipt>;

export default meta;
type Story = StoryObj<typeof meta>;

/** Money sent (debit): "Paid" stamp. */
export const Default: Story = {
  args: { transaction: transactionsFixture[0] },
};

/** Money received (credit): "Received" stamp. */
export const Credit: Story = {
  args: { transaction: transactionsFixture[1] },
};

/** A transfer entered in a foreign currency — shows the "Entered as" row. */
export const ForeignCurrency: Story = {
  args: { transaction: fxTransactionFixture },
};
