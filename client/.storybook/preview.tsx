import type { Preview } from "@storybook/react-vite";
import { initialize, mswLoader } from "msw-storybook-addon";
import "@/index.css";
import "@/styles/global.css";
import "./sb-deterministic.css";
import { withCurrency, withMotion, withRouter } from "./decorators";
import { defaultHandlers } from "./msw-handlers";

// Start the MSW worker once. Unhandled requests are bypassed so no story ever
// reaches a real backend (the console stays clean).
initialize({ onUnhandledRequest: "bypass" });

const preview: Preview = {
  // Generate a Docs page for every component in the catalog.
  tags: ["autodocs"],
  parameters: {
    layout: "centered",
    controls: {
      matchers: {
        color: /(background|color)$/i,
        date: /Date$/i,
      },
    },
    a11y: {
      // 'todo' surfaces violations in the addon panel without failing the run.
      test: "todo",
    },
    msw: { handlers: defaultHandlers },
  },
  loaders: [mswLoader],
  decorators: [withMotion, withRouter, withCurrency],
};

export default preview;
