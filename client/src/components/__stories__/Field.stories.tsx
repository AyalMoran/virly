import type { Meta, StoryObj } from "@storybook/react-vite";
import { Field } from "../Primitives";

const meta = {
  title: "Shared UI/Field",
  component: Field,
  parameters: { layout: "centered" },
  decorators: [
    (Story) => (
      <div style={{ width: 320 }}>
        <Story />
      </div>
    ),
  ],
  args: {
    label: "Recipient email",
    name: "recipientEmail",
    placeholder: "recipient@example.com",
  },
} satisfies Meta<typeof Field>;

export default meta;
type Story = StoryObj<typeof meta>;

export const Default: Story = {};

export const WithHint: Story = {
  args: { hint: "We'll never share this address." },
};

export const Error: Story = {
  args: { defaultValue: "not-an-email", error: "Enter a valid email address." },
};

export const Disabled: Story = {
  args: { defaultValue: "test.user@virly.test", disabled: true },
};
