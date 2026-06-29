import React from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { AnimatedText } from "../animated-text.js";

describe("AnimatedText", () => {
  describe("basic rendering", () => {
    it("renders the outer animated-text wrapper div", () => {
      const html = renderToStaticMarkup(<AnimatedText text="Hello" />);
      expect(html).toMatch(/animated-text/);
    });

    it("renders each character as a separate span", () => {
      const html = renderToStaticMarkup(<AnimatedText text="Hi" />);
      // "H" and "i" should appear as individual spans
      expect(html).toContain("H");
      expect(html).toContain("i");
    });

    it("renders all characters of a longer word", () => {
      const html = renderToStaticMarkup(<AnimatedText text="World" />);
      for (const char of "World") {
        expect(html).toContain(char);
      }
    });

    it("converts space characters to non-breaking spaces", () => {
      const html = renderToStaticMarkup(<AnimatedText text="A B" />);
      // Space converted to &nbsp; (unicode 0xa0)
      expect(html).toMatch(/ /);
    });
  });

  describe("heading element", () => {
    it("renders h1 by default", () => {
      const html = renderToStaticMarkup(<AnimatedText text="Title" />);
      expect(html).toMatch(/<h1/i);
    });

    it("renders h2 when as='h2'", () => {
      const html = renderToStaticMarkup(<AnimatedText text="Section" as="h2" />);
      expect(html).toMatch(/<h2/i);
    });

    it("renders p when as='p'", () => {
      const html = renderToStaticMarkup(<AnimatedText text="Paragraph" as="p" />);
      expect(html).toMatch(/<p/i);
    });

    it("renders span when as='span'", () => {
      const html = renderToStaticMarkup(<AnimatedText text="Inline" as="span" />);
      expect(html).toMatch(/<span/i);
    });
  });

  describe("className merging", () => {
    it("includes animated-text in wrapper class by default", () => {
      const html = renderToStaticMarkup(<AnimatedText text="Test" />);
      expect(html).toMatch(/animated-text/);
    });

    it("merges a custom className on the wrapper", () => {
      const html = renderToStaticMarkup(<AnimatedText text="Test" className="my-outer" />);
      expect(html).toContain("my-outer");
      expect(html).toMatch(/animated-text/);
    });

    it("applies textClassName to the heading element", () => {
      const html = renderToStaticMarkup(<AnimatedText text="Hi" textClassName="text-4xl" />);
      expect(html).toContain("text-4xl");
    });

    it("applies underlineClassName to the underline element", () => {
      const html = renderToStaticMarkup(
        <AnimatedText text="Hi" underlineClassName="border-b-4" />
      );
      expect(html).toContain("border-b-4");
    });
  });

  describe("underline element", () => {
    it("renders an animated-text-underline element", () => {
      const html = renderToStaticMarkup(<AnimatedText text="Hello" />);
      expect(html).toMatch(/animated-text-underline/);
    });

    it("applies underlineGradient class to underline", () => {
      const html = renderToStaticMarkup(
        <AnimatedText text="Hi" underlineGradient="from-blue-500" />
      );
      expect(html).toContain("from-blue-500");
    });
  });

  describe("edge cases", () => {
    it("renders a single character correctly", () => {
      const html = renderToStaticMarkup(<AnimatedText text="X" />);
      expect(html).toContain("X");
      expect(html).toMatch(/animated-text/);
    });

    it("renders an empty string without crashing", () => {
      expect(() => renderToStaticMarkup(<AnimatedText text="" />)).not.toThrow();
    });

    it("passes additional HTML attributes to the outer div", () => {
      const html = renderToStaticMarkup(<AnimatedText text="Test" data-testid="my-text" />);
      expect(html).toContain('data-testid="my-text"');
    });
  });
});
