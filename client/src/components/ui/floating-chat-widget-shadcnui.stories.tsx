import type { Meta, StoryObj } from "@storybook/react-vite";
import { within, userEvent } from "storybook/test";
import { FloatingChatWidget } from "./floating-chat-widget-shadcnui";
import { withAuth } from "../../../.storybook/decorators";

/**
 * The AI assistant launcher (fixed bottom-right). Closed by default; the `Open`
 * story clicks the launcher to reveal the read-only chat surface (agent picker
 * + greeting). It never sends a message on its own.
 */
const meta = {
  title: "AI Assistant/FloatingChatWidget",
  component: FloatingChatWidget,
  parameters: { layout: "fullscreen" },
  decorators: [withAuth],
} satisfies Meta<typeof FloatingChatWidget>;

export default meta;
type Story = StoryObj<typeof meta>;

/** Collapsed launcher button. */
export const Default: Story = {};

/** Opened chat window with the agent picker and greeting. */
export const Open: Story = {
  play: async ({ canvasElement }) => {
    const canvas = within(canvasElement);
    await userEvent.click(await canvas.findByLabelText("Open chat"));
  },
};
