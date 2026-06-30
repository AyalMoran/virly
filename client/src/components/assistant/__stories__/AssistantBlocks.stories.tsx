import type { Meta, StoryObj } from "@storybook/react-vite";
import { AssistantBlocks } from "../AssistantBlocks";
import {
  assistantAccountSummaryBlock,
  assistantEmptyStateBlock,
  assistantNoticeBlock,
  assistantPendingTransfersBlock,
  assistantShowcaseBlocks,
  assistantTransactionListBlock,
  assistantTransferConfirmationBlock,
  assistantTransferQuoteBlock,
} from "../../../../.storybook/fixtures";

/**
 * The assistant's structured response surface. Every state here is read-only or
 * a *prepared* action: the transfer_confirmation block always asks the user to
 * confirm/deny — the assistant never moves money on its own. `onConfirmTransfer`
 * / `onDenyTransfer` are inert no-ops in the catalog.
 */
const meta = {
  title: "AI Assistant/AssistantBlocks",
  component: AssistantBlocks,
  parameters: { layout: "padded" },
  decorators: [
    (Story) => (
      <div style={{ maxWidth: 380, width: "100%" }}>
        <Story />
      </div>
    ),
  ],
  args: {
    blocks: assistantShowcaseBlocks,
    locale: "en-US",
    onConfirmTransfer: () => {},
    onDenyTransfer: () => {},
  },
} satisfies Meta<typeof AssistantBlocks>;

export default meta;
type Story = StoryObj<typeof meta>;

/** A typical multi-block answer (text + account summary + recent transactions). */
export const Default: Story = {};

export const AccountSummary: Story = {
  args: { blocks: [assistantAccountSummaryBlock] },
};

export const TransactionList: Story = {
  args: { blocks: [assistantTransactionListBlock] },
};

export const PendingTransfers: Story = {
  args: { blocks: [assistantPendingTransfersBlock] },
};

export const TransferQuote: Story = {
  args: { blocks: [assistantTransferQuoteBlock] },
};

export const Notice: Story = {
  args: { blocks: [assistantNoticeBlock] },
};

export const Empty: Story = {
  args: { blocks: [assistantEmptyStateBlock] },
};

/* ----- Confirmation gate (prepared action awaiting the user) ------------- */

/** Suggested transfer awaiting the user's confirmation — Confirm/Deny enabled. */
export const ConfirmationPending: Story = {
  args: {
    blocks: [assistantTransferConfirmationBlock],
    confirmationStatus: "pending",
  },
};

/** The user pressed Confirm; the action is in flight ("Sending"), buttons locked. */
export const ConfirmationSending: Story = {
  args: {
    blocks: [assistantTransferConfirmationBlock],
    confirmationStatus: "confirming",
  },
};

/** Confirmed by the user. */
export const ConfirmationConfirmed: Story = {
  args: {
    blocks: [assistantTransferConfirmationBlock],
    confirmationStatus: "confirmed",
  },
};

/** Denied by the user. */
export const ConfirmationDenied: Story = {
  args: {
    blocks: [assistantTransferConfirmationBlock],
    confirmationStatus: "denied",
  },
};

/** The confirmation failed and needs a retry. */
export const Error: Story = {
  args: {
    blocks: [assistantTransferConfirmationBlock],
    confirmationStatus: "failed",
  },
};
