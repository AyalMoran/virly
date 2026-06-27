import type { Meta, StoryObj } from "@storybook/react-vite";
import { RecentRelationshipTransactions } from "./RecentRelationshipTransactions";
import { relationshipTransactionsFixture } from "../../../.storybook/fixtures";

/** Renders its `initialTransactions` without fetching; paging only fetches once
 *  the user advances, so the default states are deterministic. */
const meta = {
  title: "Shared UI/RecentRelationshipTransactions",
  component: RecentRelationshipTransactions,
  parameters: { layout: "padded" },
  decorators: [
    (Story) => (
      <div style={{ maxWidth: 560, width: "100%" }}>
        <Story />
      </div>
    ),
  ],
  args: {
    idOrEmail: "maya.cohen@virly.test",
    initialTransactions: relationshipTransactionsFixture,
    totalCount: relationshipTransactionsFixture.length,
    viewedName: "Maya Cohen",
    viewedEmail: "maya.cohen@virly.test",
  },
} satisfies Meta<typeof RecentRelationshipTransactions>;

export default meta;
type Story = StoryObj<typeof meta>;

export const Default: Story = {};

/** More shared transactions exist than were preloaded — "View all" appears. */
export const WithMore: Story = {
  args: { totalCount: 7 },
};
