import type { Meta, StoryObj } from "@storybook/react-vite";
import { ChatMessageActions } from "../ChatMessageActions";

const meta = {
  title: "AI Assistant/ChatMessageActions",
  component: ChatMessageActions,
  parameters: { layout: "centered" },
  args: {
    disabled: false,
    onResend: () => {},
    onEdit: () => {},
  },
} satisfies Meta<typeof ChatMessageActions>;

export default meta;
type Story = StoryObj<typeof meta>;

export const Default: Story = {};

/** While a send is in flight both actions are disabled. */
export const Disabled: Story = {
  args: { disabled: true },
};
