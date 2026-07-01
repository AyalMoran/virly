import type { Meta, StoryObj } from "@storybook/react-vite";
import { Button } from "../button";

/** The shadcn/ui button (cva variants + sizes). Distinct from the app's
 *  class-based "Shared UI/Button" primitive. */
const meta = {
  title: "Shared UI/ButtonShadcn",
  component: Button,
  parameters: { layout: "centered" },
  args: { children: "Continue" },
} satisfies Meta<typeof Button>;

export default meta;
type Story = StoryObj<typeof meta>;

export const Default: Story = {};
export const Destructive: Story = { args: { variant: "destructive", children: "Delete" } };
export const Outline: Story = { args: { variant: "outline" } };
export const Secondary: Story = { args: { variant: "secondary" } };
export const Ghost: Story = { args: { variant: "ghost" } };
export const Disabled: Story = { args: { disabled: true } };
