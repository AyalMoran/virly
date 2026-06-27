import type { Meta, StoryObj } from "@storybook/react-vite";
import { AnimatedText } from "./animated-text";

/** Letter-stagger headline with an animated underline (frozen at its final
 *  frame under the global reduced-motion decorator). */
const meta = {
  title: "Shared UI/AnimatedText",
  component: AnimatedText,
  parameters: { layout: "centered" },
  args: {
    text: "Virly",
  },
} satisfies Meta<typeof AnimatedText>;

export default meta;
type Story = StoryObj<typeof meta>;

export const Default: Story = {};

/** A longer phrase rendered as a smaller heading element. */
export const Phrase: Story = {
  args: { text: "Money, simplified", as: "h2" },
};
