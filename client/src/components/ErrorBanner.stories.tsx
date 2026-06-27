import type { Meta, StoryObj } from "@storybook/react-vite";
import { ErrorBanner } from "./Primitives";

const meta = {
  title: "Shared UI/ErrorBanner",
  component: ErrorBanner,
  parameters: { layout: "centered" },
  decorators: [
    (Story) => (
      <div style={{ width: 420 }}>
        <Story />
      </div>
    ),
  ],
  args: {
    message: "We couldn't complete that transfer. Please try again.",
  },
} satisfies Meta<typeof ErrorBanner>;

export default meta;
type Story = StoryObj<typeof meta>;

export const Default: Story = {};
