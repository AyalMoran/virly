import React from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { Avatar, AvatarImage, AvatarFallback } from "../avatar.js";

// Note: Radix Avatar renders AvatarImage only on the client side (it waits for image
// load status which is a browser event). In SSR/static markup, only AvatarFallback
// is rendered. Tests below reflect this SSR behaviour.

describe("Avatar", () => {
  it("renders with default wrapper classes", () => {
    const html = renderToStaticMarkup(<Avatar />);
    expect(html).toMatch(/rounded-full/);
    expect(html).toMatch(/h-10/);
    expect(html).toMatch(/w-10/);
    expect(html).toMatch(/overflow-hidden/);
  });

  it("accepts and merges a custom className", () => {
    const html = renderToStaticMarkup(<Avatar className="border-2" />);
    expect(html).toContain("border-2");
    expect(html).toMatch(/rounded-full/);
  });

  it("renders children inside the avatar root", () => {
    const html = renderToStaticMarkup(
      <Avatar>
        <span className="inner">inner</span>
      </Avatar>
    );
    expect(html).toContain("inner");
  });
});

describe("AvatarFallback", () => {
  it("renders fallback content inside Avatar", () => {
    const html = renderToStaticMarkup(
      <Avatar>
        <AvatarFallback>AB</AvatarFallback>
      </Avatar>
    );
    expect(html).toContain("AB");
  });

  it("includes expected layout and background classes", () => {
    const html = renderToStaticMarkup(
      <Avatar>
        <AvatarFallback>XY</AvatarFallback>
      </Avatar>
    );
    expect(html).toMatch(/flex/);
    expect(html).toMatch(/items-center/);
    expect(html).toMatch(/justify-center/);
    expect(html).toMatch(/rounded-full/);
    expect(html).toMatch(/bg-muted/);
  });

  it("merges a custom className", () => {
    const html = renderToStaticMarkup(
      <Avatar>
        <AvatarFallback className="text-primary">AI</AvatarFallback>
      </Avatar>
    );
    expect(html).toContain("text-primary");
    expect(html).toMatch(/bg-muted/);
  });
});

describe("Avatar composition", () => {
  it("renders Avatar with Fallback content", () => {
    const html = renderToStaticMarkup(
      <Avatar className="h-8 w-8">
        <AvatarFallback>JD</AvatarFallback>
      </Avatar>
    );
    expect(html).toContain("JD");
    expect(html).toMatch(/rounded-full/);
    expect(html).toMatch(/h-8/);
  });

  it("renders fallback when both Image and Fallback are present (SSR behaviour)", () => {
    // In SSR, Radix Avatar always shows the Fallback because image load
    // state is not known yet.
    const html = renderToStaticMarkup(
      <Avatar>
        <AvatarImage src="photo.jpg" alt="John" />
        <AvatarFallback>JD</AvatarFallback>
      </Avatar>
    );
    expect(html).toContain("JD");
  });

  it("renders Avatar with custom size class", () => {
    const html = renderToStaticMarkup(
      <Avatar className="h-12 w-12">
        <AvatarFallback>MN</AvatarFallback>
      </Avatar>
    );
    expect(html).toMatch(/h-12/);
    expect(html).toMatch(/w-12/);
    expect(html).toContain("MN");
  });

  it("renders Avatar with border classes", () => {
    const html = renderToStaticMarkup(
      <Avatar className="border-2 border-background shadow-sm">
        <AvatarFallback>PR</AvatarFallback>
      </Avatar>
    );
    expect(html).toMatch(/border-2/);
    expect(html).toMatch(/shadow-sm/);
  });
});
