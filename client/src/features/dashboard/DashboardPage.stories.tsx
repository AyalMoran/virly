import type { Meta, StoryObj } from "@storybook/react-vite";
import { http, HttpResponse, delay } from "msw";
import { DashboardPage } from "./DashboardPage";
import { withAuth } from "../../../.storybook/decorators";
import { defaultHandlers } from "../../../.storybook/msw-handlers";
import { accountSummaryFixture } from "../../../.storybook/fixtures";

/** The account dashboard. Logged-in via `withAuth` (+ the global /api/auth/me
 *  handler); the account summary is mocked per-story. */
const meta = {
  title: "Dashboard/DashboardPage",
  component: DashboardPage,
  parameters: { layout: "fullscreen" },
  decorators: [withAuth],
} satisfies Meta<typeof DashboardPage>;

export default meta;
type Story = StoryObj<typeof meta>;

/** Loaded account with recent activity (default summary handler). */
export const Default: Story = {};

/** Summary request never resolves — the skeleton state. */
export const Loading: Story = {
  parameters: {
    msw: {
      handlers: [
        http.get("*/api/accounts/me", async () => {
          await delay("infinite");
          return HttpResponse.json(accountSummaryFixture);
        }),
        ...defaultHandlers,
      ],
    },
  },
};

/** A brand-new account with no transactions yet. */
export const Empty: Story = {
  parameters: {
    msw: {
      handlers: [
        http.get("*/api/accounts/me", () =>
          HttpResponse.json({
            ...accountSummaryFixture,
            balance: 0,
            transactions: [],
          }),
        ),
        ...defaultHandlers,
      ],
    },
  },
};

/** The summary request fails — the error banner. */
export const Error: Story = {
  parameters: {
    msw: {
      handlers: [
        http.get("*/api/accounts/me", () =>
          HttpResponse.json({ message: "Unable to load account." }, { status: 500 }),
        ),
        ...defaultHandlers,
      ],
    },
  },
};
