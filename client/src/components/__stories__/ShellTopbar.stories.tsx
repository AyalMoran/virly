import type { Meta, StoryObj } from "@storybook/react-vite";
import { ShellTopbar } from "../ShellTopbar";

/** The app top bar: wordmark, currency selector, user identity + balance.
 *  Props-only (the surrounding AppShell passes the live values). */
const meta = {
  title: "Layout/ShellTopbar",
  component: ShellTopbar,
  parameters: { layout: "fullscreen" },
  args: {
    displayName: "Test User",
    email: "test.user@virly.test",
    balance: 1250.0,
    enteredFromAuth: false,
  },
} satisfies Meta<typeof ShellTopbar>;

export default meta;
type Story = StoryObj<typeof meta>;

export const Default: Story = {};

/** A high balance, to check the figure doesn't crowd the user block. */
export const LargeBalance: Story = {
  args: { balance: 1250000.0 },
};

/** Balance shown in a non-ILS display currency (via the currency provider). */
export const UsdDisplay: Story = {
  parameters: { currency: "USD" },
};
