import type { Meta, StoryObj } from "@storybook/react-vite";
import { UserProfileHeader } from "../UserProfileHeader";
import { publicUserFixture } from "../../../../.storybook/fixtures";

const meta = {
  title: "Shared UI/UserProfileHeader",
  component: UserProfileHeader,
  parameters: { layout: "padded" },
  decorators: [
    (Story) => (
      <div style={{ maxWidth: 560, width: "100%" }}>
        <Story />
      </div>
    ),
  ],
  args: {
    user: publicUserFixture,
    isSelf: false,
    canSendMoney: true,
    onSendMoney: () => {},
  },
} satisfies Meta<typeof UserProfileHeader>;

export default meta;
type Story = StoryObj<typeof meta>;

/** Verified counterparty you can transfer to. */
export const Default: Story = {};

/** Unverified counterparty. */
export const Unverified: Story = {
  args: { user: { ...publicUserFixture, isVerified: false } },
};

/** Your own profile — no transfer action. */
export const Self: Story = {
  args: { isSelf: true, canSendMoney: false },
};
