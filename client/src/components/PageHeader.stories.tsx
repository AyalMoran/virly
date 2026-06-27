import type { Meta, StoryObj } from "@storybook/react-vite";
import { PageHeader } from "./Primitives";

const meta = {
  title: "Shared UI/PageHeader",
  component: PageHeader,
  parameters: { layout: "padded" },
  args: {
    eyebrow: "Transfer",
    title: "Write a cheque",
  },
} satisfies Meta<typeof PageHeader>;

export default meta;
type Story = StoryObj<typeof meta>;

export const Default: Story = {};

/** With a trailing action in the header. */
export const WithActions: Story = {
  args: {
    children: <button className="button button-secondary">New transfer</button>,
  },
};
