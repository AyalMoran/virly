import type { Meta, StoryObj } from "@storybook/react-vite";
import { EmptyState } from "../Primitives";

const meta = {
  title: "Shared UI/EmptyState",
  component: EmptyState,
  parameters: { layout: "centered" },
  args: {
    title: "No transactions",
    message:
      "Money you send or receive will show up here. Start by sending your first transfer.",
  },
} satisfies Meta<typeof EmptyState>;

export default meta;
type Story = StoryObj<typeof meta>;

export const Default: Story = {};

/** With a call-to-action in the action slot. */
export const WithAction: Story = {
  args: {
    children: <button className="button button-primary">Transfer</button>,
  },
};
