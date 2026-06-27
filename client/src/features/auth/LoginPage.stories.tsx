import type { Meta, StoryObj } from "@storybook/react-vite";
import { LoginPage } from "./LoginPage";
import { withAuth } from "../../../.storybook/decorators";

/** The login route (AuthLayout + SignInCard2). Wrapped in AuthProvider so
 *  `useAuth()` resolves; it renders the sign-in form, not a real session. */
const meta = {
  title: "Auth/LoginPage",
  component: LoginPage,
  parameters: { layout: "fullscreen" },
  decorators: [withAuth],
} satisfies Meta<typeof LoginPage>;

export default meta;
type Story = StoryObj<typeof meta>;

export const Default: Story = {};
