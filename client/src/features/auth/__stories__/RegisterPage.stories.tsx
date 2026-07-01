import type { Meta, StoryObj } from "@storybook/react-vite";
import { RegisterPage } from "../RegisterPage";
import { withAuth } from "../../../../.storybook/decorators";

/** The registration route (AuthLayout + SignInCard2 in register mode). */
const meta = {
  title: "Auth/RegisterPage",
  component: RegisterPage,
  parameters: { layout: "fullscreen" },
  decorators: [withAuth],
} satisfies Meta<typeof RegisterPage>;

export default meta;
type Story = StoryObj<typeof meta>;

export const Default: Story = {};
