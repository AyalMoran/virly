import type { Meta, StoryObj } from "@storybook/react-vite";
import { Button } from "./Primitives";

/** The app's primary button primitive (class-based variants). The shadcn
 *  variant lives under "Shared UI/ButtonShadcn". */
const meta = {
  title: "Shared UI/Button",
  component: Button,
  parameters: { layout: "centered" },
  args: { children: "Send money", variant: "primary" },
} satisfies Meta<typeof Button>;

export default meta;
type Story = StoryObj<typeof meta>;

export const Default: Story = {};
export const Secondary: Story = { args: { variant: "secondary" } };
export const Ghost: Story = { args: { variant: "ghost" } };
export const Danger: Story = { args: { variant: "danger", children: "Sign out" } };
export const Disabled: Story = { args: { disabled: true } };
