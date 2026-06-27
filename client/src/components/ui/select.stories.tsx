import type { Meta, StoryObj } from "@storybook/react-vite";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "./select";

/** The shadcn/ui select (Radix). Shown closed with a preselected value; opening
 *  the listbox is an interaction. */
const meta = {
  title: "Shared UI/Select",
  component: Select,
  parameters: { layout: "centered" },
} satisfies Meta<typeof Select>;

export default meta;
type Story = StoryObj<typeof meta>;

export const Default: Story = {
  render: () => (
    <div style={{ width: 240 }}>
      <Select defaultValue="ils">
        <SelectTrigger>
          <SelectValue />
        </SelectTrigger>
        <SelectContent>
          <SelectItem value="ils">₪ ILS</SelectItem>
          <SelectItem value="usd">$ USD</SelectItem>
          <SelectItem value="eur">€ EUR</SelectItem>
        </SelectContent>
      </Select>
    </div>
  ),
};
