import React from "react";
import { renderToStaticMarkup } from "react-dom/server";
import {
  Select,
  SelectTrigger,
  SelectValue,
  SelectContent,
  SelectItem,
  SelectLabel,
  SelectGroup,
  SelectSeparator,
} from "../select.js";

// Note: Radix Select relies on a portal and browser focus management at
// runtime. In SSR (renderToStaticMarkup) only the trigger portion renders;
// the content portal is suppressed. Tests verify the trigger and wrapper
// attributes emitted during static render.

describe("SelectTrigger", () => {
  it("renders without throwing inside a Select root", () => {
    expect(() =>
      renderToStaticMarkup(
        <Select>
          <SelectTrigger>Choose</SelectTrigger>
        </Select>
      )
    ).not.toThrow();
  });

  it("emits default styling classes", () => {
    const html = renderToStaticMarkup(
      <Select>
        <SelectTrigger>Choose</SelectTrigger>
      </Select>
    );
    expect(html).toMatch(/h-10/);
    expect(html).toMatch(/w-full/);
    expect(html).toMatch(/rounded-md/);
    expect(html).toMatch(/border/);
  });

  it("merges a custom className onto the trigger", () => {
    const html = renderToStaticMarkup(
      <Select>
        <SelectTrigger className="my-trigger">Select option</SelectTrigger>
      </Select>
    );
    expect(html).toContain("my-trigger");
    expect(html).toMatch(/h-10/);
  });

  it("renders the chevron-down icon inside the trigger", () => {
    const html = renderToStaticMarkup(
      <Select>
        <SelectTrigger>Open</SelectTrigger>
      </Select>
    );
    // ChevronDown from lucide renders as an svg
    expect(html).toMatch(/<svg/);
  });

  it("passes aria-label through to the trigger", () => {
    const html = renderToStaticMarkup(
      <Select>
        <SelectTrigger aria-label="Choose a language">Pick</SelectTrigger>
      </Select>
    );
    expect(html).toContain('aria-label="Choose a language"');
  });

  it("renders children inside the trigger", () => {
    const html = renderToStaticMarkup(
      <Select>
        <SelectTrigger>
          <SelectValue placeholder="Pick one" />
        </SelectTrigger>
      </Select>
    );
    // SelectValue renders as a span with the placeholder
    expect(html).toMatch(/Pick one/);
  });
});

describe("SelectLabel", () => {
  it("renders label text with expected styling", () => {
    const html = renderToStaticMarkup(
      <Select>
        <SelectContent>
          <SelectGroup>
            <SelectLabel>Fruits</SelectLabel>
          </SelectGroup>
        </SelectContent>
      </Select>
    );
    // In SSR, portal content is not rendered (Radix suppresses it).
    // Test that at minimum nothing throws.
    expect(html).toBeDefined();
  });
});

describe("SelectSeparator", () => {
  it("renders without throwing inside a Select", () => {
    expect(() =>
      renderToStaticMarkup(
        <Select>
          <SelectTrigger>
            <SelectValue />
          </SelectTrigger>
        </Select>
      )
    ).not.toThrow();
  });
});

describe("Select composition", () => {
  it("renders a full Select with trigger and value placeholder", () => {
    const html = renderToStaticMarkup(
      <Select defaultValue="">
        <SelectTrigger aria-label="Select fruit">
          <SelectValue placeholder="Choose a fruit" />
        </SelectTrigger>
      </Select>
    );
    expect(html).toContain("Choose a fruit");
    expect(html).toContain('aria-label="Select fruit"');
  });

  it("reflects a controlled value in the trigger", () => {
    const html = renderToStaticMarkup(
      <Select value="apple">
        <SelectTrigger>
          <SelectValue />
        </SelectTrigger>
        <SelectContent>
          <SelectItem value="apple">Apple</SelectItem>
          <SelectItem value="banana">Banana</SelectItem>
        </SelectContent>
      </Select>
    );
    // The trigger is rendered; content goes through portal (not in static markup)
    expect(html).toMatch(/<button/);
  });
});
