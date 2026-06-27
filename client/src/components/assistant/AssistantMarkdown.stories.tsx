import type { Meta, StoryObj } from "@storybook/react-vite";
import { AssistantMarkdown } from "./AssistantBlocks";

/**
 * The assistant's lightweight markdown renderer (bold + bullet lists, with
 * LTR isolation for amounts/emails inside RTL text). Read-only display.
 */
const meta = {
  title: "AI Assistant/AssistantMarkdown",
  component: AssistantMarkdown,
  parameters: { layout: "padded" },
  args: {
    text: "Your balance is **₪1,250.00**.\n\nRecent activity:\n- Sent **₪250.00** to maya.cohen@virly.test\n- Received **₪1,200.00** from payroll@acme.test",
  },
} satisfies Meta<typeof AssistantMarkdown>;

export default meta;
type Story = StoryObj<typeof meta>;

export const Default: Story = {};

/** Plain single-line answer with no markup. */
export const PlainText: Story = {
  args: { text: "You have no pending transfers right now." },
};
