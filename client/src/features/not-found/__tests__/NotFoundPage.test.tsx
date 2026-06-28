/**
 * Tests for NotFoundPage.
 *
 * Uses react-router MemoryRouter so useLocation/useNavigate have a provider.
 * useEffect does not fire during renderToStaticMarkup, so the Framer Motion
 * animation (which starts "hidden") is irrelevant — we assert on rendered markup.
 */
import React from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { MemoryRouter } from "react-router-dom";
import { NotFoundPage } from "../NotFoundPage.js";

function render(initialEntry = "/some-page") {
  return renderToStaticMarkup(
    <MemoryRouter initialEntries={[initialEntry]}>
      <NotFoundPage />
    </MemoryRouter>
  );
}

describe("NotFoundPage", () => {
  describe("structure", () => {
    it("renders a <main> element", () => {
      const html = render();
      expect(html).toMatch(/<main/);
    });

    it("has aria-label indicating 404", () => {
      const html = render();
      expect(html).toMatch(/Page not found/i);
      expect(html).toMatch(/404/);
    });

    it("renders the nf-screen class", () => {
      const html = render();
      expect(html).toMatch(/nf-screen/);
    });
  });

  describe("navigation actions", () => {
    it("renders a Back to dashboard link pointing to /", () => {
      const html = render();
      expect(html).toMatch(/href="\/"/);
      expect(html).toMatch(/Back to dashboard/);
    });

    it("renders a Go back button", () => {
      const html = render();
      expect(html).toMatch(/Go back/);
    });
  });

  describe("embedded NotFoundSlip", () => {
    it("renders the requested path in the slip", () => {
      const html = render("/missing-page");
      expect(html).toMatch(/missing-page/);
    });

    it("renders a VRL- reference number", () => {
      const html = render("/anything");
      expect(html).toMatch(/VRL-/);
    });

    it("renders the print timestamp", () => {
      const html = render();
      // The timestamp is YYYY-MM-DD HH:MM format
      expect(html).toMatch(/\d{4}-\d{2}-\d{2} \d{2}:\d{2}/);
    });

    it("produces the same reference number for the same path across renders", () => {
      const html1 = render("/stable-path");
      const html2 = render("/stable-path");
      const ref1 = html1.match(/VRL-[A-Z0-9]+/)?.[0];
      const ref2 = html2.match(/VRL-[A-Z0-9]+/)?.[0];
      expect(ref1).toBeDefined();
      expect(ref1).toBe(ref2);
    });

    it("produces different reference numbers for different paths", () => {
      const html1 = render("/path-a");
      const html2 = render("/path-b");
      const ref1 = html1.match(/VRL-[A-Z0-9]+/)?.[0];
      const ref2 = html2.match(/VRL-[A-Z0-9]+/)?.[0];
      expect(ref1).not.toBe(ref2);
    });
  });
});
