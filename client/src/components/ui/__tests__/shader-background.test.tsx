import React from "react";
import { renderToStaticMarkup } from "react-dom/server";
import ShaderBackground from "../shader-background.js";

// ShaderBackground uses WebGL via useEffect on the canvas ref. In SSR
// (renderToStaticMarkup) the canvas is rendered but effects don't run.
// Tests verify the canvas element is emitted with the right attributes.

describe("ShaderBackground", () => {
  it("renders without throwing", () => {
    expect(() => renderToStaticMarkup(<ShaderBackground />)).not.toThrow();
  });

  it("renders a canvas element", () => {
    const html = renderToStaticMarkup(<ShaderBackground />);
    expect(html).toMatch(/<canvas/);
  });

  it("emits the shader-background-canvas class", () => {
    const html = renderToStaticMarkup(<ShaderBackground />);
    expect(html).toContain("shader-background-canvas");
  });

  it("is aria-hidden (decorative canvas)", () => {
    const html = renderToStaticMarkup(<ShaderBackground />);
    expect(html).toContain('aria-hidden="true"');
  });

  it("applies fixed positioning classes", () => {
    const html = renderToStaticMarkup(<ShaderBackground />);
    expect(html).toMatch(/fixed/);
    expect(html).toMatch(/left-0/);
    expect(html).toMatch(/top-0/);
  });

  it("applies full-width and full-height classes", () => {
    const html = renderToStaticMarkup(<ShaderBackground />);
    expect(html).toMatch(/h-full/);
    expect(html).toMatch(/w-full/);
  });
});
