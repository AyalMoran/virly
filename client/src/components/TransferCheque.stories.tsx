import type { Meta, StoryObj } from "@storybook/react-vite";
import { TransferCheque } from "./TransferCheque";

/**
 * Virly's signature transfer surface, authored around the confirmation gate:
 * `form` (pre-confirm, editable) -> `review` (awaiting confirmation, read-only)
 * -> `success` (confirmed, "Cleared" stamp). Props only; never executes a
 * transfer.
 */
const meta = {
  title: "Transfers/TransferCheque",
  component: TransferCheque,
  parameters: { layout: "padded" },
  args: {
    chequeNumber: "48217",
    issueDate: "Jun 26, 2026",
    holderEmail: "test.user@virly.test",
    currency: "ILS",
    payee: "maya.cohen@virly.test",
    recipientEmail: "maya.cohen@virly.test",
    amount: "250.00",
    reason: "Dinner split",
  },
} satisfies Meta<typeof TransferCheque>;

export default meta;
type Story = StoryObj<typeof meta>;

/** Pre-confirm: editable cheque (the form step), nothing filled in yet. */
export const Default: Story = {
  args: { mode: "form", recipientEmail: "", amount: "", reason: "" },
};

/** Awaiting confirmation: read-only review of the prepared cheque. */
export const AwaitingConfirmation: Story = {
  args: { mode: "review" },
};

/** Confirmed: the cleared cheque with its "Cleared" stamp. */
export const Success: Story = {
  args: { mode: "success" },
};

/** Validation errors surfaced on the editable cheque. */
export const Error: Story = {
  args: {
    mode: "form",
    recipientEmail: "not-an-email",
    amount: "0",
    errors: {
      recipientEmail: "Enter a valid recipient email.",
      amount: "Amount must be greater than 0.",
    },
  },
};

/** A large, foreign-currency review to stress the amount-in-words line. */
export const LargeAmount: Story = {
  args: {
    mode: "review",
    currency: "USD",
    amount: "125000.00",
    reason: "Property deposit",
  },
};
