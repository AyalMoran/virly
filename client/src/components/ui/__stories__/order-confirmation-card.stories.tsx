import type { Meta, StoryObj } from "@storybook/react-vite";
import { OrderConfirmationCard } from "../order-confirmation-card";

/** A transaction-completed confirmation card. Unused registry/demo component
 *  (not wired into the app), cataloged for completeness. */
const meta = {
  title: "Shared UI/OrderConfirmationCard",
  component: OrderConfirmationCard,
  parameters: { layout: "centered" },
  args: {
    orderId: "txn_0001",
    paymentMethod: "maya.cohen@virly.test",
    dateTime: "Jun 26, 2026, 2:32 PM",
    totalAmount: "-₪250.00",
    reason: "Dinner split",
    onGoToAccount: () => {},
  },
} satisfies Meta<typeof OrderConfirmationCard>;

export default meta;
type Story = StoryObj<typeof meta>;

/** A debit (sent) confirmation. */
export const Default: Story = {};

/** A credit (received) confirmation. */
export const Credit: Story = {
  args: { totalAmount: "+₪1,200.00", reason: "June salary" },
};
