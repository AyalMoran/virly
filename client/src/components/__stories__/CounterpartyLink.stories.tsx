import type { Meta, StoryObj } from "@storybook/react-vite";
import { userProfileFixture, emptyRelationshipFixture } from "../../../.storybook/fixtures";
import { __setProfileFetcher, __resetUserProfileCache } from "../../lib/user-profile-cache";
import { CounterpartyLink } from "../CounterpartyLink";

// Global decorators (withRouter, withCurrency) are applied via preview.tsx,
// so no per-story MemoryRouter or CurrencyProvider wrapper is needed.

const meta = {
  title: "Shared UI/CounterpartyLink",
  component: CounterpartyLink,
  parameters: { layout: "centered" },
  args: {
    email: "maya.cohen@virly.test",
  },
} satisfies Meta<typeof CounterpartyLink>;

export default meta;
type Story = StoryObj<typeof meta>;

/** Hover or focus the link to see the loaded card. */
export const WithHistory: Story = {
  render: () => {
    __resetUserProfileCache();
    __setProfileFetcher(async () => userProfileFixture);
    return <CounterpartyLink email="maya.cohen@virly.test" />;
  },
};

/** Simulates a user with no shared transaction history. */
export const NoHistory: Story = {
  render: () => {
    __resetUserProfileCache();
    __setProfileFetcher(async () => ({
      ...userProfileFixture,
      relationship: emptyRelationshipFixture,
    }));
    return <CounterpartyLink email="maya.cohen@virly.test" />;
  },
};

/** Simulates a slow or failing fetch. */
export const FetchError: Story = {
  render: () => {
    __resetUserProfileCache();
    __setProfileFetcher(() => Promise.reject(new Error("Network error")));
    return <CounterpartyLink email="maya.cohen@virly.test" />;
  },
};
