import type { Meta, StoryObj } from "@storybook/react-vite";
import { http, HttpResponse, delay } from "msw";
import { Route, Routes } from "react-router-dom";
import { UserProfilePage } from "./UserProfilePage";
import { defaultHandlers } from "../../../.storybook/msw-handlers";
import {
  emptyRelationshipFixture,
  publicUserFixture,
  relationshipFixture,
  relationshipTransactionsFixture,
  userProfileFixture,
} from "../../../.storybook/fixtures";

/**
 * A counterparty profile page (mapped to Shared UI). Reads `:userId` from the
 * route, so a Routes decorator + a `/users/...` initial entry are provided;
 * the profile payload is mocked per-story.
 */
const meta = {
  title: "Shared UI/UserProfilePage",
  component: UserProfilePage,
  parameters: {
    layout: "fullscreen",
    router: { initialEntries: ["/users/maya.cohen@virly.test"] },
  },
  decorators: [
    (Story) => (
      <Routes>
        <Route path="/users/:userId" element={<Story />} />
      </Routes>
    ),
  ],
} satisfies Meta<typeof UserProfilePage>;

export default meta;
type Story = StoryObj<typeof meta>;

/** Verified counterparty with shared history. */
export const Default: Story = {};

/** Profile request never resolves — loading skeleton. */
export const Loading: Story = {
  parameters: {
    msw: {
      handlers: [
        http.get("*/api/users/:idOrEmail/profile", async () => {
          await delay("infinite");
          return HttpResponse.json(userProfileFixture);
        }),
        ...defaultHandlers,
      ],
    },
  },
};

/** No shared history yet — the empty-relationship state. */
export const Empty: Story = {
  parameters: {
    msw: {
      handlers: [
        http.get("*/api/users/:idOrEmail/profile", () =>
          HttpResponse.json({
            user: { ...publicUserFixture, displayName: "Dana Levi" },
            relationship: emptyRelationshipFixture,
            recentTransactions: [],
          }),
        ),
        ...defaultHandlers,
      ],
    },
  },
};

/** The user does not exist — the 404 "not available" state. */
export const NotFound: Story = {
  parameters: {
    msw: {
      handlers: [
        http.get("*/api/users/:idOrEmail/profile", () =>
          HttpResponse.json({ message: "User not found." }, { status: 404 }),
        ),
        ...defaultHandlers,
      ],
    },
  },
};

/** A non-404 failure — the retry error state. */
export const Error: Story = {
  parameters: {
    msw: {
      handlers: [
        http.get("*/api/users/:idOrEmail/profile", () =>
          HttpResponse.json({ message: "Unable to load this profile." }, { status: 500 }),
        ),
        ...defaultHandlers,
      ],
    },
  },
};

/** Viewing your own profile. */
export const Self: Story = {
  parameters: {
    msw: {
      handlers: [
        http.get("*/api/users/:idOrEmail/profile", () =>
          HttpResponse.json({
            user: publicUserFixture,
            relationship: { ...relationshipFixture, relationshipStatus: "self" },
            recentTransactions: relationshipTransactionsFixture,
          }),
        ),
        ...defaultHandlers,
      ],
    },
  },
};
