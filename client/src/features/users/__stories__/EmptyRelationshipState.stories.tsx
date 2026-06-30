import type { Meta, StoryObj } from "@storybook/react-vite";
import { EmptyRelationshipState } from "../EmptyRelationshipState";

const meta = {
  title: "Shared UI/EmptyRelationshipState",
  component: EmptyRelationshipState,
  parameters: { layout: "centered" },
  args: {
    viewedName: "Dana Levi",
    canSendMoney: true,
    onSendMoney: () => {},
  },
} satisfies Meta<typeof EmptyRelationshipState>;

export default meta;
type Story = StoryObj<typeof meta>;

export const Default: Story = {};

/** Same empty history, but transfers to this user aren't allowed. */
export const CannotSend: Story = {
  args: { canSendMoney: false },
};
