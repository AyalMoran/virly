/**
 * Tests for UserProfilePage.
 *
 * UserProfilePage fetches data inside useEffect. useEffect does not run
 * during renderToStaticMarkup (SSR), so the component always starts in
 * its isLoading=true initial state. This file tests that loading-state HTML
 * and the structural landmarks that are always present.
 *
 * The error and loaded-profile rendering branches are exercised indirectly
 * through the sub-component unit tests in userProfileComponents.test.tsx.
 */
import React from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { MemoryRouter, Route, Routes } from "react-router-dom";
import { UserProfilePage } from "../UserProfilePage.js";

function renderPage(userId = "user-abc") {
  return renderToStaticMarkup(
    <MemoryRouter initialEntries={[`/users/${userId}`]}>
      <Routes>
        <Route path="/users/:userId" element={<UserProfilePage />} />
      </Routes>
    </MemoryRouter>
  );
}

describe("UserProfilePage — loading state (SSR initial render)", () => {
  it("renders a page-stack container", () => {
    const html = renderPage();
    expect(html).toMatch(/class="page-stack/);
  });

  it("shows a loading page header while data is being fetched", () => {
    const html = renderPage();
    expect(html).toMatch(/Loading profile/);
  });

  it("renders the Profile eyebrow text", () => {
    const html = renderPage();
    expect(html).toMatch(/Profile/);
  });

  it("renders a loading placeholder (Skeleton) while data is pending", () => {
    const html = renderPage();
    // Skeleton component renders a "printing" aria-busy element
    expect(html).toMatch(/aria-busy="true"/);
    expect(html).toMatch(/aria-label="Loading"/);
  });

  it("does not render the profile header card during load", () => {
    // user-profile-header only appears when profile data is available
    const html = renderPage();
    expect(html).not.toMatch(/user-profile-header/);
  });

  it("does not render any error banner during load", () => {
    const html = renderPage();
    expect(html).not.toMatch(/role="alert"/);
  });

  it("renders consistently for different user IDs", () => {
    const html1 = renderPage("user-1");
    const html2 = renderPage("user-2");
    // Both should be loading states with the same structure
    expect(html1).toMatch(/Loading profile/);
    expect(html2).toMatch(/Loading profile/);
  });

  it("does not render the relationship summary section during load", () => {
    const html = renderPage();
    expect(html).not.toMatch(/Between you and/);
  });

  it("does not render the recipient status card during load", () => {
    const html = renderPage();
    expect(html).not.toMatch(/Verified recipient/);
  });
});
