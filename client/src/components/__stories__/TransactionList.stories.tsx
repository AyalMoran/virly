import type { Meta, StoryObj } from "@storybook/react-vite";
import { TransactionList } from "../TransactionList";
import {
  emptyTransactionsFixture,
  manyPagesPaginationFixture,
  paginationFixture,
  transactionsFixture,
} from "../../../.storybook/fixtures";

const meta = {
  title: "Transactions/TransactionList",
  component: TransactionList,
  parameters: { layout: "padded" },
  args: {
    transactions: transactionsFixture,
  },
} satisfies Meta<typeof TransactionList>;

export default meta;
type Story = StoryObj<typeof meta>;

export const Default: Story = {};

/** No transactions yet — renders the EmptyState with a "Transfer" CTA. */
export const Empty: Story = {
  args: { transactions: emptyTransactionsFixture },
};

/** Dense variant used inside narrower surfaces (e.g. the dashboard). */
export const Compact: Story = {
  args: { compact: true },
};

/** Rows become buttons that emit `onTransactionSelect`. */
export const Selectable: Story = {
  args: { onTransactionSelect: () => {} },
};

/** Single page of results still hides the pager (totalPages = 1). */
export const WithPagination: Story = {
  args: {
    pagination: paginationFixture,
    page: 1,
    onPageChange: () => {},
  },
};

/** Many pages: windowed page buttons, ellipses, and the jump input. */
export const ManyPages: Story = {
  args: {
    pagination: manyPagesPaginationFixture,
    page: 3,
    onPageChange: () => {},
  },
};
