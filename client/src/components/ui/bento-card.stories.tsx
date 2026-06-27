import type { Meta, StoryObj } from "@storybook/react-vite";
import BentoCard from "./bento-card";

/** A shadcn-style bento dashboard card. Unused registry/demo component (not
 *  wired into the app), cataloged for completeness. */
const meta = {
  title: "Shared UI/BentoCard",
  component: BentoCard,
  parameters: { layout: "padded" },
} satisfies Meta<typeof BentoCard>;

export default meta;
type Story = StoryObj<typeof meta>;

export const Default: Story = {};
