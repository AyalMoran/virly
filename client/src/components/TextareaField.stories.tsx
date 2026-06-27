import type { Meta, StoryObj } from "@storybook/react-vite";
import { TextareaField } from "./Primitives";

const meta = {
  title: "Shared UI/TextareaField",
  component: TextareaField,
  parameters: { layout: "centered" },
  decorators: [
    (Story) => (
      <div style={{ width: 360 }}>
        <Story />
      </div>
    ),
  ],
  args: {
    label: "Topic",
    name: "topic",
    value: "Question about a recent transfer",
    maxLength: 200,
    onChange: () => {},
  },
} satisfies Meta<typeof TextareaField>;

export default meta;
type Story = StoryObj<typeof meta>;

export const Default: Story = {};

export const WithHint: Story = {
  args: { value: "", hint: "Optional. Keep it short — don't include private details." },
};

export const Error: Story = {
  args: { value: "x".repeat(40), error: "Please keep this under 200 characters." },
};
