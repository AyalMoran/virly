import type { Meta, StoryObj } from "@storybook/react-vite";
import { http, HttpResponse, delay } from "msw";
import { SecurityTab } from "../SecurityTab";
import { withAuth } from "../../../../.storybook/decorators";
import { defaultHandlers } from "../../../../.storybook/msw-handlers";

/** Recent logins/transfers plus a map of where located activity came from.
 *  Logged-in via `withAuth`; activity is mocked per-story. */
const events = [
  {
    id: "e1",
    kind: "login",
    at: "2026-07-01T10:00:00.000Z",
    city: "Tel Aviv",
    country: "IL",
    lat: 32.0853,
    lng: 34.7818,
    transactionId: null,
  },
  {
    id: "e2",
    kind: "transfer",
    at: "2026-07-01T10:30:00.000Z",
    city: "Paris",
    country: "FR",
    lat: 48.8566,
    lng: 2.3522,
    transactionId: "6867f00000000000000000ab",
  },
  {
    id: "e3",
    kind: "login",
    at: "2026-06-28T09:00:00.000Z",
    city: null,
    country: null,
    lat: null,
    lng: null,
    transactionId: null,
  },
];

const meta = {
  title: "Dashboard/SecurityTab",
  component: SecurityTab,
  parameters: { layout: "padded" },
  decorators: [withAuth],
} satisfies Meta<typeof SecurityTab>;

export default meta;
type Story = StoryObj<typeof meta>;

/** Located and unlocated activity - the list plus the map with two dots and a
 *  connecting line. */
export const Default: Story = {
  parameters: {
    msw: {
      handlers: [
        http.get("*/api/users/me/activity", () => HttpResponse.json({ events, nextBefore: null })),
        ...defaultHandlers,
      ],
    },
  },
};

/** Activity request never resolves - the skeleton state. */
export const Loading: Story = {
  parameters: {
    msw: {
      handlers: [
        http.get("*/api/users/me/activity", async () => {
          await delay("infinite");
          return HttpResponse.json({ events: [], nextBefore: null });
        }),
        ...defaultHandlers,
      ],
    },
  },
};

/** No activity yet - the empty state, no map. */
export const Empty: Story = {
  parameters: {
    msw: {
      handlers: [
        http.get("*/api/users/me/activity", () => HttpResponse.json({ events: [], nextBefore: null })),
        ...defaultHandlers,
      ],
    },
  },
};

/** The activity request fails - the error banner. */
export const Error: Story = {
  parameters: {
    msw: {
      handlers: [
        http.get("*/api/users/me/activity", () => HttpResponse.json({ message: "boom" }, { status: 500 })),
        ...defaultHandlers,
      ],
    },
  },
};
