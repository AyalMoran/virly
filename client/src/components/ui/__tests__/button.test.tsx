import React from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { Button, buttonVariants } from "../button.js";

describe("Button", () => {
  describe("default rendering", () => {
    it("renders a button element with default variant classes", () => {
      const html = renderToStaticMarkup(<Button>Click me</Button>);
      expect(html).toMatch(/<button/);
      expect(html).toMatch(/bg-primary/);
      expect(html).toMatch(/text-primary-foreground/);
      expect(html).toContain("Click me");
    });

    it("renders children correctly", () => {
      const html = renderToStaticMarkup(<Button>Submit</Button>);
      expect(html).toContain("Submit");
    });
  });

  describe("variant classes", () => {
    it("applies destructive variant classes", () => {
      const html = renderToStaticMarkup(<Button variant="destructive">Delete</Button>);
      expect(html).toMatch(/bg-red-600/);
    });

    it("applies outline variant classes", () => {
      const html = renderToStaticMarkup(<Button variant="outline">Outline</Button>);
      expect(html).toMatch(/border/);
      expect(html).toMatch(/bg-background/);
    });

    it("applies secondary variant classes", () => {
      const html = renderToStaticMarkup(<Button variant="secondary">Secondary</Button>);
      expect(html).toMatch(/bg-muted/);
    });

    it("applies ghost variant classes", () => {
      const html = renderToStaticMarkup(<Button variant="ghost">Ghost</Button>);
      expect(html).toMatch(/hover:bg-muted/);
    });

    it("applies link variant classes", () => {
      const html = renderToStaticMarkup(<Button variant="link">Link</Button>);
      expect(html).toMatch(/text-primary/);
      expect(html).toMatch(/underline-offset-4/);
    });
  });

  describe("size classes", () => {
    it("applies default size classes", () => {
      const html = renderToStaticMarkup(<Button size="default">Default</Button>);
      expect(html).toMatch(/h-11/);
      expect(html).toMatch(/px-4/);
    });

    it("applies sm size classes", () => {
      const html = renderToStaticMarkup(<Button size="sm">Small</Button>);
      expect(html).toMatch(/h-10/);
      expect(html).toMatch(/px-3/);
    });

    it("applies lg size classes", () => {
      const html = renderToStaticMarkup(<Button size="lg">Large</Button>);
      expect(html).toMatch(/h-12/);
      expect(html).toMatch(/px-8/);
    });

    it("applies icon size classes", () => {
      const html = renderToStaticMarkup(<Button size="icon">X</Button>);
      expect(html).toMatch(/h-11/);
      expect(html).toMatch(/w-11/);
    });
  });

  describe("disabled state", () => {
    it("renders disabled attribute when disabled prop is set", () => {
      const html = renderToStaticMarkup(<Button disabled>Disabled</Button>);
      expect(html).toMatch(/disabled/);
      expect(html).toMatch(/disabled:opacity-50/);
    });
  });

  describe("custom className", () => {
    it("merges custom className with variant classes", () => {
      const html = renderToStaticMarkup(<Button className="my-custom-class">Button</Button>);
      expect(html).toContain("my-custom-class");
      expect(html).toMatch(/bg-primary/);
    });
  });

  describe("asChild prop", () => {
    it("renders as a Slot (child element) when asChild is true", () => {
      const html = renderToStaticMarkup(
        <Button asChild>
          <a href="/home">Home</a>
        </Button>
      );
      expect(html).toMatch(/<a /);
      expect(html).toContain("Home");
      expect(html).not.toMatch(/<button/);
    });
  });

  describe("buttonVariants helper", () => {
    it("returns correct classes for default variant and size", () => {
      const classes = buttonVariants({ variant: "default", size: "default" });
      expect(classes).toMatch(/bg-primary/);
      expect(classes).toMatch(/h-11/);
    });

    it("returns correct classes for ghost variant and sm size", () => {
      const classes = buttonVariants({ variant: "ghost", size: "sm" });
      expect(classes).toMatch(/hover:bg-muted/);
      expect(classes).toMatch(/h-10/);
    });

    it("returns base classes when no variants provided", () => {
      const classes = buttonVariants({});
      expect(classes).toMatch(/inline-flex/);
      expect(classes).toMatch(/items-center/);
    });
  });
});
