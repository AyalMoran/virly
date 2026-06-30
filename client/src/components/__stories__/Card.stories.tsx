import type { Meta, StoryObj } from "@storybook/react-vite";
import { Card } from "../Primitives";

const meta = {
  title: "Shared UI/Card",
  component: Card,
  parameters: { layout: "padded" },
  decorators: [
    (Story) => (
      <div style={{ width: 420 }}>
        <Story />
      </div>
    ),
  ],
  args: {
    children: (
      <>
        <h2>Account</h2>
        <p>Your primary account summary lives inside a Card surface.</p>
      </>
    ),
  },
} satisfies Meta<typeof Card>;

export default meta;
type Story = StoryObj<typeof meta>;

export const Default: Story = {};
