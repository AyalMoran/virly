import type { Meta, StoryObj } from "@storybook/react-vite";
import { Skeleton } from "../Primitives";

/** The "Printing…" loading placeholder used while a surface fetches. */
const meta = {
  title: "Shared UI/Skeleton",
  component: Skeleton,
  parameters: { layout: "centered" },
  args: { rows: 3 },
} satisfies Meta<typeof Skeleton>;

export default meta;
type Story = StoryObj<typeof meta>;

export const Default: Story = {};

export const ManyRows: Story = {
  args: { rows: 6 },
};
