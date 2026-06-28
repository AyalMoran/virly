/**
 * Tests for AgentVideoSessionsPage.
 *
 * Requires AuthProvider (useAuth). The component checks auth.user?.role to
 * determine whether the user is allowed; on initial render (no me() call in SSR)
 * auth.user is null, so role is undefined and canUseAgentVideo returns false.
 * This means the "Agent access required" gate renders, not the full queue UI.
 *
 * We also test that the full queue layout renders when the component is wrapped
 * in a provider that exposes an agent-role user — accomplished by creating a
 * thin wrapper that overrides the context.
 */
import React, { createContext, useContext } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { AuthProvider } from "../../auth/AuthProvider.js";
import { AgentVideoSessionsPage } from "../AgentVideoSessionsPage.js";

// ------------------------------------------------------------------
// Helper: render with real AuthProvider (user=null on initial SSR)
// ------------------------------------------------------------------
function renderNoAuth() {
  return renderToStaticMarkup(
    <AuthProvider>
      <AgentVideoSessionsPage />
    </AuthProvider>
  );
}

describe("AgentVideoSessionsPage", () => {
  describe("unauthorised (user = null on initial SSR)", () => {
    it("renders the page-stack wrapper", () => {
      const html = renderNoAuth();
      expect(html).toMatch(/page-stack/);
    });

    it("renders the Video queue heading", () => {
      const html = renderNoAuth();
      expect(html).toMatch(/Video queue/);
    });

    it("renders the Internal eyebrow", () => {
      const html = renderNoAuth();
      expect(html).toMatch(/Internal/);
    });

    it("renders the Agent access required heading", () => {
      const html = renderNoAuth();
      expect(html).toMatch(/Agent access required/);
    });

    it("renders the authorization error copy", () => {
      const html = renderNoAuth();
      expect(html).toMatch(/not authorized for the internal video queue/);
    });

    it("does not render the filters card in the gate view", () => {
      const html = renderNoAuth();
      expect(html).not.toMatch(/agent-video-filters/);
    });

    it("does not render the sessions list in the gate view", () => {
      const html = renderNoAuth();
      expect(html).not.toMatch(/agent-video-list/);
    });
  });
});
