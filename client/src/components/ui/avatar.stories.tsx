import type { Meta, StoryObj } from "@storybook/react-vite";
import { Avatar, AvatarFallback, AvatarImage } from "./avatar";
import { getUserAvatarUrl } from "@/lib/user-avatar";

/** The shadcn/ui avatar (Radix) — image with a text fallback. */
const meta = {
  title: "Shared UI/Avatar",
  component: Avatar,
  parameters: { layout: "centered" },
} satisfies Meta<typeof Avatar>;

export default meta;
type Story = StoryObj<typeof meta>;

export const Default: Story = {
  render: () => (
    <Avatar>
      <AvatarImage src={getUserAvatarUrl("Maya Cohen")} alt="Maya Cohen" />
      <AvatarFallback>MC</AvatarFallback>
    </Avatar>
  ),
};

/** No image — the initials fallback. */
export const Fallback: Story = {
  render: () => (
    <Avatar>
      <AvatarFallback>MC</AvatarFallback>
    </Avatar>
  ),
};
