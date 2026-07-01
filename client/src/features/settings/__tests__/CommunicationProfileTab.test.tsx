/**
 * Tests for CommunicationProfileTab.
 *
 * useEffect (communication-profile fetch) does not run in renderToStaticMarkup.
 * Initial state is isLoading=true, so we assert the loading render.
 */
import React from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { MemoryRouter } from "react-router-dom";
import { CommunicationProfileTab } from "../CommunicationProfileTab.js";

it("renders the tab heading in its initial loading state", () => {
  const html = renderToStaticMarkup(
    <MemoryRouter>
      <CommunicationProfileTab />
    </MemoryRouter>
  );
  expect(html).toContain("How Virly talks to you");
  expect(html).toContain("Loading your preferences");
});
