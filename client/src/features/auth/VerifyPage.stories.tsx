import type { Meta, StoryObj } from "@storybook/react-vite";
import { http, HttpResponse, delay } from "msw";
import { VerifyPage } from "./VerifyPage";
import { withAuth } from "../../../.storybook/decorators";
import { defaultHandlers } from "../../../.storybook/msw-handlers";

/** Email-verification landing page. The token is read from the URL, so each
 *  story sets an initial route entry. */
const meta = {
  title: "Auth/VerifyPage",
  component: VerifyPage,
  parameters: { layout: "fullscreen" },
  decorators: [withAuth],
} satisfies Meta<typeof VerifyPage>;

export default meta;
type Story = StoryObj<typeof meta>;

/** No token in the URL — the "token is missing" error + resend link. */
export const Default: Story = {
  parameters: { router: { initialEntries: ["/verify"] } },
};

/** A token is present and the verify request is in flight — "Checking token…". */
export const Checking: Story = {
  parameters: {
    router: { initialEntries: ["/verify?token=storybook-token"] },
    msw: {
      handlers: [
        http.get("*/api/auth/verify", async () => {
          await delay("infinite");
          return HttpResponse.json({ user: null });
        }),
        ...defaultHandlers,
      ],
    },
  },
};

/** The token is invalid/expired — verification error + resend link. */
export const Error: Story = {
  parameters: {
    router: { initialEntries: ["/verify?token=expired-token"] },
    msw: {
      handlers: [
        http.get("*/api/auth/verify", () =>
          HttpResponse.json({ message: "This verification link has expired." }, { status: 400 }),
        ),
        ...defaultHandlers,
      ],
    },
  },
};
