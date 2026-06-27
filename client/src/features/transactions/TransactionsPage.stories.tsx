import type { Meta, StoryObj } from "@storybook/react-vite";
import { http, HttpResponse, delay } from "msw";
import { TransactionsPage } from "./TransactionsPage";
import { defaultHandlers } from "../../../.storybook/msw-handlers";
import {
  emptyTransactionsResponseFixture,
  transactionsResponseFixture,
} from "../../../.storybook/fixtures";

/** The transactions list page (filter + paginated list + details dialog).
 *  Data is mocked per-story via MSW. */
const meta = {
  title: "Transactions/TransactionsPage",
  component: TransactionsPage,
  parameters: { layout: "fullscreen" },
} satisfies Meta<typeof TransactionsPage>;

export default meta;
type Story = StoryObj<typeof meta>;

export const Default: Story = {};

export const Loading: Story = {
  parameters: {
    msw: {
      handlers: [
        http.get("*/api/transactions", async () => {
          await delay("infinite");
          return HttpResponse.json(transactionsResponseFixture);
        }),
        ...defaultHandlers,
      ],
    },
  },
};

export const Empty: Story = {
  parameters: {
    msw: {
      handlers: [
        http.get("*/api/transactions", () =>
          HttpResponse.json(emptyTransactionsResponseFixture),
        ),
        ...defaultHandlers,
      ],
    },
  },
};

export const Error: Story = {
  parameters: {
    msw: {
      handlers: [
        http.get("*/api/transactions", () =>
          HttpResponse.json({ message: "Unable to load transactions." }, { status: 500 }),
        ),
        ...defaultHandlers,
      ],
    },
  },
};
