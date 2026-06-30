import type { Meta, StoryObj } from "@storybook/react-vite";
import { RecipientStatusCard } from "../RecipientStatusCard";
import {
  emptyRelationshipFixture,
  relationshipFixture,
} from "../../../../.storybook/fixtures";

const meta = {
  title: "Shared UI/RecipientStatusCard",
  component: RecipientStatusCard,
  parameters: { layout: "centered" },
  decorators: [
    (Story) => (
      <div style={{ width: 340 }}>
        <Story />
      </div>
    ),
  ],
  args: {
    relationship: relationshipFixture,
    viewedName: "Maya Cohen",
    onSendMoney: () => {},
  },
} satisfies Meta<typeof RecipientStatusCard>;

export default meta;
type Story = StoryObj<typeof meta>;

/** Verified recipient — Transfer button shown. */
export const Default: Story = {};

/** Not-yet-verified recipient (transfers still allowed). */
export const NotVerified: Story = {
  args: { relationship: emptyRelationshipFixture, viewedName: "Dana Levi" },
};

/** Viewing your own profile — no transfer action. */
export const Self: Story = {
  args: {
    relationship: {
      ...relationshipFixture,
      relationshipStatus: "self",
      canTransferToUser: false,
    },
    viewedName: "Test User",
  },
};
