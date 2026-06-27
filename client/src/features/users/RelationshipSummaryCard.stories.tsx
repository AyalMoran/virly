import type { Meta, StoryObj } from "@storybook/react-vite";
import { RelationshipSummaryCard } from "./RelationshipSummaryCard";
import { relationshipFixture } from "../../../.storybook/fixtures";

const meta = {
  title: "Shared UI/RelationshipSummaryCard",
  component: RelationshipSummaryCard,
  parameters: { layout: "padded" },
  decorators: [
    (Story) => (
      <div style={{ maxWidth: 520, width: "100%" }}>
        <Story />
      </div>
    ),
  ],
  args: {
    relationship: relationshipFixture,
    viewedName: "Maya Cohen",
  },
} satisfies Meta<typeof RelationshipSummaryCard>;

export default meta;
type Story = StoryObj<typeof meta>;

/** You are net-positive (sent more than received). */
export const Default: Story = {};

/** Net received (you received more than you sent). */
export const NetReceived: Story = {
  args: {
    relationship: {
      ...relationshipFixture,
      totalSentToUser: 200,
      totalReceivedFromUser: 1000,
      netAmount: -800,
    },
  },
};
