import React from "react";
import { renderToStaticMarkup } from "react-dom/server";
import BentoCard from "../bento-card.js";

describe("BentoCard", () => {
  describe("basic rendering", () => {
    it("renders without throwing", () => {
      expect(() => renderToStaticMarkup(<BentoCard />)).not.toThrow();
    });

    it("renders the bento-card-shell wrapper", () => {
      const html = renderToStaticMarkup(<BentoCard />);
      expect(html).toMatch(/bento-card-shell/);
    });

    it("renders the heading text", () => {
      const html = renderToStaticMarkup(<BentoCard />);
      expect(html).toContain("Project Dashboard");
    });

    it("renders the descriptive subtitle text", () => {
      const html = renderToStaticMarkup(<BentoCard />);
      expect(html).toContain("High-performance analytics");
    });
  });

  describe("default tab state", () => {
    it("renders the Dashboard tab label", () => {
      const html = renderToStaticMarkup(<BentoCard />);
      expect(html).toContain("Dashboard");
    });

    it("renders the Management tab label", () => {
      const html = renderToStaticMarkup(<BentoCard />);
      expect(html).toContain("Management");
    });

    it("renders the Threads tab label", () => {
      const html = renderToStaticMarkup(<BentoCard />);
      expect(html).toContain("Threads");
    });

    it("renders the Resources tab label", () => {
      const html = renderToStaticMarkup(<BentoCard />);
      expect(html).toContain("Resources");
    });

    it("renders initial Dashboard tab content (Project Overview header)", () => {
      const html = renderToStaticMarkup(<BentoCard />);
      expect(html).toContain("Project Overview");
    });

    it("renders initial dashboard content with performance metric", () => {
      const html = renderToStaticMarkup(<BentoCard />);
      expect(html).toContain("94.2%");
    });
  });

  describe("tab badges", () => {
    it("renders the Management badge count", () => {
      const html = renderToStaticMarkup(<BentoCard />);
      expect(html).toContain("10");
    });

    it("renders the Threads badge count", () => {
      const html = renderToStaticMarkup(<BentoCard />);
      expect(html).toContain("12");
    });
  });

  describe("window chrome", () => {
    it("renders the bento-card-window element", () => {
      const html = renderToStaticMarkup(<BentoCard />);
      expect(html).toMatch(/bento-card-window/);
    });

    it("renders the bento-card-stage element", () => {
      const html = renderToStaticMarkup(<BentoCard />);
      expect(html).toMatch(/bento-card-stage/);
    });

    it("renders the Workspace label in the chrome header", () => {
      const html = renderToStaticMarkup(<BentoCard />);
      expect(html).toContain("Workspace");
    });
  });
});
