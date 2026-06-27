import type { Meta, StoryObj } from "@storybook/react-vite";
import { QuickContacts } from "./QuickContacts";
import { getQuickContacts } from "@/lib/contacts";
import { transactionsFixture } from "../../.storybook/fixtures";

const meta = {
  title: "Shared UI/QuickContacts",
  component: QuickContacts,
  parameters: { layout: "centered" },
  decorators: [
    (Story) => (
      <div style={{ width: 320 }}>
        <Story />
      </div>
    ),
  ],
  args: {
    contacts: getQuickContacts(transactionsFixture),
    onSelectContact: () => {},
  },
} satisfies Meta<typeof QuickContacts>;

export default meta;
type Story = StoryObj<typeof meta>;

export const Default: Story = {};

/** No recent counterparties. */
export const Empty: Story = {
  args: { contacts: [] },
};
