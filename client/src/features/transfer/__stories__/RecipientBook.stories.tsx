import type { Meta, StoryObj } from "@storybook/react-vite";
import { RecipientBook } from "../RecipientBook";

const meta = {
  title: "Transfer/RecipientBook",
  component: RecipientBook,
  parameters: { layout: "padded" },
  args: {
    saved: [
      { email: "dan@example.com", avatar: "DL", contactId: "c1", displayName: "Dan Levi" },
      { email: "maya@virly.test", avatar: "MC", contactId: "c2", displayName: "Maya Cohen" }
    ],
    recent: [{ email: "alice@example.com", avatar: "A" }],
    selectedEmail: "dan@example.com",
    onSelect: () => {},
    onSave: () => {},
    onRemove: () => {}
  }
} satisfies Meta<typeof RecipientBook>;

export default meta;
type Story = StoryObj<typeof meta>;

export const Default: Story = {};

/** No saved contacts yet - only the derived recents with save affordances. */
export const RecentOnly: Story = {
  args: { saved: [] }
};
