import type { Meta, StoryObj } from "@storybook/react-vite";
import { SuccessBanner } from "../Primitives";

const meta = {
  title: "Shared UI/SuccessBanner",
  component: SuccessBanner,
  parameters: { layout: "centered" },
  decorators: [
    (Story) => (
      <div style={{ width: 420 }}>
        <Story />
      </div>
    ),
  ],
  args: {
    message: "Transfer sent — your new balance is ₪1,000.00.",
  },
} satisfies Meta<typeof SuccessBanner>;

export default meta;
type Story = StoryObj<typeof meta>;

export const Default: Story = {};
