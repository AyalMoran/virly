import type { Meta, StoryObj } from "@storybook/react-vite";
import { AuthLayout } from "../AuthLayout";

/** The split-panel auth shell (brand visual + content panel). */
const meta = {
  title: "Auth/AuthLayout",
  component: AuthLayout,
  parameters: { layout: "fullscreen" },
  args: {
    title: "Sign in",
    subtitle: "Welcome back to Virly.",
    children: (
      <form className="form-stack">
        <p>Auth content (form) renders inside the panel.</p>
        <button className="button button-primary" type="button">
          Continue
        </button>
      </form>
    ),
  },
} satisfies Meta<typeof AuthLayout>;

export default meta;
type Story = StoryObj<typeof meta>;

/** Card panel with a title + the balance visual (no `visualText`). */
export const Default: Story = {};

/** Animated brand wordmark in the visual panel. */
export const WithBrandVisual: Story = {
  args: { visualText: "Virly" },
};

/** Bare panel (children render without the card chrome). */
export const BarePanel: Story = {
  args: { barePanel: true },
};
