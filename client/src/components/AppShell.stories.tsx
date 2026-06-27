import type { Meta, StoryObj } from "@storybook/react-vite";
import { Route, Routes } from "react-router-dom";
import { AppShell } from "./AppShell";
import { withAuth } from "../../.storybook/decorators";

/** Sample routed content for the shell's outlet. */
function SampleOutlet() {
  return (
    <div className="page-stack">
      <h1>Page content</h1>
      <p>The active route renders here, inside the app shell.</p>
    </div>
  );
}

/**
 * The authenticated app frame: sidebar + top bar + routed outlet + floating
 * assistant. Mounted as a layout route (with a sample index child) so its
 * `<Outlet/>` has content; logged-in via `withAuth`.
 */
const meta = {
  title: "Layout/AppShell",
  component: AppShell,
  parameters: { layout: "fullscreen" },
  decorators: [
    withAuth,
    (Story) => (
      <Routes>
        <Route element={<Story />}>
          <Route index element={<SampleOutlet />} />
        </Route>
      </Routes>
    ),
  ],
} satisfies Meta<typeof AppShell>;

export default meta;
type Story = StoryObj<typeof meta>;

export const Default: Story = {};
