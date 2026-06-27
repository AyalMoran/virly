import type { Meta, StoryObj } from "@storybook/react-vite";
import { NotFoundSlip } from "./NotFoundSlip";

/** The 404 "declined receipt" surface. Props are pre-formatted so the slip is
 *  deterministic (no live timestamps/random references). */
const meta = {
  title: "Layout/NotFoundSlip",
  component: NotFoundSlip,
  parameters: { layout: "fullscreen" },
  args: {
    requested: "/dashboard/missing",
    printedAt: "2026-06-26 14:32",
    reference: "VRL-7F3A2C",
  },
} satisfies Meta<typeof NotFoundSlip>;

export default meta;
type Story = StoryObj<typeof meta>;

export const Default: Story = {};
