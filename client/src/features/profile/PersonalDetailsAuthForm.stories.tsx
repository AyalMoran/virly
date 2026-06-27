import type { Meta, StoryObj } from "@storybook/react-vite";
import { PersonalDetailsAuthForm } from "./PersonalDetailsAuthForm";
import { withAuth } from "../../../.storybook/decorators";

/** The post-signup KYC card (collect personal details or skip). Wrapped in
 *  AuthProvider for `useAuth()`; submit/skip are no-ops without a backend. */
const meta = {
  title: "Auth/PersonalDetailsAuthForm",
  component: PersonalDetailsAuthForm,
  parameters: { layout: "centered" },
  decorators: [withAuth],
  args: {
    onComplete: () => {},
  },
} satisfies Meta<typeof PersonalDetailsAuthForm>;

export default meta;
type Story = StoryObj<typeof meta>;

export const Default: Story = {};
