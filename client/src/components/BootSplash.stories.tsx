import type { Meta, StoryObj } from "@storybook/react-vite";
import { BootSplashView } from "./BootSplash";

/**
 * The split-flap boot splash shown during the initial session check. NOTE: the
 * flap board runs a JS animation loop (and picks random phrases), so this story
 * is intentionally NOT pixel-deterministic — capture it with care.
 */
const meta = {
  title: "Layout/BootSplash",
  component: BootSplashView,
  parameters: { layout: "fullscreen" },
  args: { phase: "visible" },
} satisfies Meta<typeof BootSplashView>;

export default meta;
type Story = StoryObj<typeof meta>;

export const Default: Story = {};
