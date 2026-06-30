import type { Meta, StoryObj } from "@storybook/react-vite";
import { SignInCard2 } from "../sign-in-card-2";

/**
 * The animated auth card. Fully controlled — login mode by default; passing
 * `onConfirmPasswordChange`/`onPhoneChange` switches it to register mode.
 */
const meta = {
  title: "Auth/SignInCard2",
  component: SignInCard2,
  parameters: { layout: "centered" },
  args: {
    email: "",
    password: "",
    isLoading: false,
    onEmailChange: () => {},
    onPasswordChange: () => {},
    onRememberMeChange: () => {},
    onSubmit: () => {},
  },
} satisfies Meta<typeof SignInCard2>;

export default meta;
type Story = StoryObj<typeof meta>;

/** Sign-in mode. */
export const Default: Story = {};

/** Register mode (confirm password + phone fields appear). */
export const Register: Story = {
  args: {
    title: "Create account",
    submitLabel: "Create account",
    footerLabel: "Sign in",
    footerTo: "/login",
    confirmPassword: "",
    phone: "",
    onConfirmPasswordChange: () => {},
    onPhoneChange: () => {},
  },
};

/** Validation + form errors surfaced. */
export const Error: Story = {
  args: {
    email: "not-an-email",
    password: "short",
    emailError: "Enter a valid email address.",
    passwordError: "Password must be at least 8 characters.",
    formError: "We couldn't sign you in. Check your details and try again.",
  },
};

/** Submission in flight — spinner, disabled submit. */
export const Loading: Story = {
  args: {
    email: "test.user@virly.test",
    password: "correct-horse",
    isLoading: true,
  },
};
