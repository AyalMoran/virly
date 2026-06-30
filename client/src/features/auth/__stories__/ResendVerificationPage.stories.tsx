import type { Meta, StoryObj } from "@storybook/react-vite";
import { ResendVerificationPage } from "../ResendVerificationPage";
import { withAuth } from "../../../../.storybook/decorators";

/** Re-request a verification email. Renders a simple form; no fetch on mount. */
const meta = {
  title: "Auth/ResendVerificationPage",
  component: ResendVerificationPage,
  parameters: { layout: "fullscreen" },
  decorators: [withAuth],
} satisfies Meta<typeof ResendVerificationPage>;

export default meta;
type Story = StoryObj<typeof meta>;

export const Default: Story = {};
