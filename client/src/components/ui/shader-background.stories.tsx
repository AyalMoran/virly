import type { Meta, StoryObj } from "@storybook/react-vite";
import ShaderBackground from "./shader-background";

/**
 * The app's full-screen WebGL backdrop. It stops its animation loop and paints
 * a single static frame under reduced motion (active in the catalog), so it
 * renders a stable frame rather than animating forever.
 */
const meta = {
  title: "Layout/ShaderBackground",
  component: ShaderBackground,
  parameters: { layout: "fullscreen" },
} satisfies Meta<typeof ShaderBackground>;

export default meta;
type Story = StoryObj<typeof meta>;

export const Default: Story = {};
