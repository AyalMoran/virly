import type { Meta, StoryObj } from "@storybook/react-vite";
import { TransactionDetailsDialog } from "../TransactionDetailsDialog";
import { transactionsFixture } from "../../../.storybook/fixtures";

/** A modal wrapper around TransactionReceipt with a focus trap. With
 *  `transaction = null` it renders nothing, so the only meaningful state is open. */
const meta = {
  title: "Transactions/TransactionDetailsDialog",
  component: TransactionDetailsDialog,
  parameters: { layout: "fullscreen" },
  args: {
    onClose: () => {},
  },
} satisfies Meta<typeof TransactionDetailsDialog>;

export default meta;
type Story = StoryObj<typeof meta>;

export const Default: Story = {
  args: { transaction: transactionsFixture[0] },
};
