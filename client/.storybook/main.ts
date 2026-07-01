import type { StorybookConfig } from "@storybook/react-vite";

/**
 * Storybook for the Virly client.
 *
 * - Stories are colocated next to components as `*.stories.tsx`.
 * - The `@storybook/react-vite` framework automatically loads the project's
 *   `vite.config.ts`, so the `@ -> ./src` alias and the Tailwind v4 plugin
 *   resolve exactly as they do in the app (no duplicated config here).
 * - `staticDirs` serves `public/` so the MSW service worker is reachable.
 */
const config: StorybookConfig = {
  stories: ["../src/**/*.stories.@(ts|tsx)"],
  addons: ["@storybook/addon-docs", "@storybook/addon-a11y"],
  framework: {
    name: "@storybook/react-vite",
    options: {},
  },
  staticDirs: ["../public"],
};

export default config;
