import type { Meta, StoryObj } from "@storybook/react-vite";
import { http, HttpResponse, delay } from "msw";
import { SettingsPage } from "../SettingsPage";
import { withAuth } from "../../../../.storybook/decorators";
import { defaultHandlers } from "../../../../.storybook/msw-handlers";
import {
  emptyPersonalDetailsFixture,
  personalDetailsResponseFixture,
} from "../../../../.storybook/fixtures";

/** Account settings (mapped to the Dashboard area). Logged-in via `withAuth`;
 *  personal details are mocked per-story. */
const meta = {
  title: "Dashboard/SettingsPage",
  component: SettingsPage,
  parameters: { layout: "fullscreen" },
  decorators: [withAuth],
} satisfies Meta<typeof SettingsPage>;

export default meta;
type Story = StoryObj<typeof meta>;

/** Personal details already provided — read-only view. */
export const Default: Story = {};

/** Personal-details request never resolves — the skeleton state. */
export const Loading: Story = {
  parameters: {
    msw: {
      handlers: [
        http.get("*/api/accounts/personal-details", async () => {
          await delay("infinite");
          return HttpResponse.json(personalDetailsResponseFixture);
        }),
        ...defaultHandlers,
      ],
    },
  },
};

/** No details provided yet — every field reads "Not provided". */
export const Empty: Story = {
  parameters: {
    msw: {
      handlers: [
        http.get("*/api/accounts/personal-details", () =>
          HttpResponse.json({ personalDetails: emptyPersonalDetailsFixture }),
        ),
        ...defaultHandlers,
      ],
    },
  },
};

/** The details request fails — the error banner. */
export const Error: Story = {
  parameters: {
    msw: {
      handlers: [
        http.get("*/api/accounts/personal-details", () =>
          HttpResponse.json({ message: "Unable to load personal details." }, { status: 500 }),
        ),
        ...defaultHandlers,
      ],
    },
  },
};
