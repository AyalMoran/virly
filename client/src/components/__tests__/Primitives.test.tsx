import React from "react";
import { renderToStaticMarkup } from "react-dom/server";
import {
  Button,
  Card,
  PageStack,
  ResponsiveGrid,
  Field,
  TextareaField,
  PageHeader,
  ErrorBanner,
  SuccessBanner,
  EmptyState,
  Skeleton,
} from "../Primitives.js";

// ---------------------------------------------------------------------------
// Button
// ---------------------------------------------------------------------------

describe("Button", () => {
  it("renders primary variant by default", () => {
    const html = renderToStaticMarkup(<Button>Pay</Button>);
    expect(html).toMatch(/button-primary/);
    expect(html).toMatch(/>Pay</);
  });

  it("renders each explicit variant class", () => {
    const variants = ["primary", "secondary", "ghost", "danger"] as const;
    for (const variant of variants) {
      const html = renderToStaticMarkup(<Button variant={variant}>x</Button>);
      expect(html).toMatch(new RegExp(`button-${variant}`));
    }
  });

  it("merges extra className", () => {
    const html = renderToStaticMarkup(<Button className="extra-cls">x</Button>);
    expect(html).toMatch(/extra-cls/);
    expect(html).toMatch(/button-primary/);
  });

  it("passes through disabled attribute", () => {
    const html = renderToStaticMarkup(<Button disabled>x</Button>);
    expect(html).toMatch(/disabled/);
  });

  it("passes through type attribute", () => {
    const html = renderToStaticMarkup(<Button type="submit">x</Button>);
    expect(html).toMatch(/type="submit"/);
  });
});

// ---------------------------------------------------------------------------
// Card
// ---------------------------------------------------------------------------

describe("Card", () => {
  it("renders children inside a section with card class", () => {
    const html = renderToStaticMarkup(<Card>Content</Card>);
    expect(html).toMatch(/<section[^>]*class="card "/);
    expect(html).toMatch(/Content/);
  });

  it("merges extra className", () => {
    const html = renderToStaticMarkup(<Card className="my-card">C</Card>);
    expect(html).toMatch(/card my-card/);
  });
});

// ---------------------------------------------------------------------------
// PageStack
// ---------------------------------------------------------------------------

describe("PageStack", () => {
  it("renders with page-stack class and children", () => {
    const html = renderToStaticMarkup(<PageStack>child</PageStack>);
    expect(html).toMatch(/page-stack/);
    expect(html).toMatch(/child/);
  });

  it("trims combined class when no extra className", () => {
    const html = renderToStaticMarkup(<PageStack>x</PageStack>);
    // Should not have trailing space from trim
    expect(html).not.toMatch(/page-stack /);
  });

  it("merges extra className", () => {
    const html = renderToStaticMarkup(<PageStack className="extra">x</PageStack>);
    expect(html).toMatch(/page-stack extra/);
  });
});

// ---------------------------------------------------------------------------
// ResponsiveGrid
// ---------------------------------------------------------------------------

describe("ResponsiveGrid", () => {
  it("defaults to sidebar variant", () => {
    const html = renderToStaticMarkup(<ResponsiveGrid>x</ResponsiveGrid>);
    expect(html).toMatch(/responsive-grid-sidebar/);
  });

  it("applies requested variant", () => {
    const variants = ["sidebar", "dashboard", "split", "filters"] as const;
    for (const variant of variants) {
      const html = renderToStaticMarkup(
        <ResponsiveGrid variant={variant}>x</ResponsiveGrid>
      );
      expect(html).toMatch(new RegExp(`responsive-grid-${variant}`));
    }
  });

  it("merges extra className", () => {
    const html = renderToStaticMarkup(
      <ResponsiveGrid className="override">x</ResponsiveGrid>
    );
    expect(html).toMatch(/override/);
  });
});

// ---------------------------------------------------------------------------
// Field
// ---------------------------------------------------------------------------

describe("Field", () => {
  it("renders label text and input", () => {
    const html = renderToStaticMarkup(
      <Field label="Email" name="email" type="email" />
    );
    expect(html).toMatch(/Email/);
    expect(html).toMatch(/<input/);
    expect(html).toMatch(/type="email"/);
  });

  it("uses name as id when id is absent", () => {
    const html = renderToStaticMarkup(
      <Field label="Name" name="full_name" />
    );
    expect(html).toMatch(/id="full_name"/);
    expect(html).toMatch(/htmlFor="full_name"|for="full_name"/);
  });

  it("prefers explicit id over name", () => {
    const html = renderToStaticMarkup(
      <Field label="Name" name="full_name" id="name-field" />
    );
    expect(html).toMatch(/id="name-field"/);
  });

  it("shows hint when no error", () => {
    const html = renderToStaticMarkup(
      <Field label="Amount" name="amount" hint="In ILS" />
    );
    expect(html).toMatch(/In ILS/);
    expect(html).toMatch(/field-hint/);
  });

  it("shows error instead of hint when both present", () => {
    const html = renderToStaticMarkup(
      <Field label="Amount" name="amount" hint="In ILS" error="Required" />
    );
    expect(html).toMatch(/Required/);
    expect(html).toMatch(/field-error/);
    expect(html).not.toMatch(/In ILS/);
  });

  it("sets aria-invalid when error present", () => {
    const html = renderToStaticMarkup(
      <Field label="Amount" name="amount" error="Bad" />
    );
    expect(html).toMatch(/aria-invalid="true"/);
  });

  it("aria-invalid is false when no error", () => {
    const html = renderToStaticMarkup(
      <Field label="Amount" name="amount" />
    );
    expect(html).toMatch(/aria-invalid="false"/);
  });
});

// ---------------------------------------------------------------------------
// TextareaField
// ---------------------------------------------------------------------------

describe("TextareaField", () => {
  const noop = () => {};

  it("renders label and textarea", () => {
    const html = renderToStaticMarkup(
      <TextareaField label="Memo" name="memo" value="" onChange={noop} />
    );
    expect(html).toMatch(/Memo/);
    expect(html).toMatch(/<textarea/);
  });

  it("uses name as id when id absent", () => {
    const html = renderToStaticMarkup(
      <TextareaField label="Memo" name="memo" value="" onChange={noop} />
    );
    expect(html).toMatch(/id="memo"/);
  });

  it("sets aria-invalid when error present", () => {
    const html = renderToStaticMarkup(
      <TextareaField
        label="Memo"
        name="memo"
        value=""
        onChange={noop}
        error="Too long"
      />
    );
    expect(html).toMatch(/aria-invalid="true"/);
    expect(html).toMatch(/Too long/);
  });

  it("shows hint when no error", () => {
    const html = renderToStaticMarkup(
      <TextareaField
        label="Memo"
        name="memo"
        value=""
        onChange={noop}
        hint="Max 200 chars"
      />
    );
    expect(html).toMatch(/Max 200 chars/);
  });

  it("applies maxLength attribute", () => {
    const html = renderToStaticMarkup(
      <TextareaField
        label="Memo"
        name="memo"
        value=""
        onChange={noop}
        maxLength={200}
      />
    );
    expect(html).toMatch(/maxlength="200"|maxLength="200"/i);
  });
});

// ---------------------------------------------------------------------------
// PageHeader
// ---------------------------------------------------------------------------

describe("PageHeader", () => {
  it("renders eyebrow and title", () => {
    const html = renderToStaticMarkup(
      <PageHeader eyebrow="Step 1" title="Transfer" />
    );
    expect(html).toMatch(/Step 1/);
    expect(html).toMatch(/<h1>Transfer<\/h1>/);
  });

  it("omits eyebrow element when empty string", () => {
    const html = renderToStaticMarkup(
      <PageHeader eyebrow="" title="Transfer" />
    );
    expect(html).not.toMatch(/eyebrow/);
  });

  it("renders children in actions slot", () => {
    const html = renderToStaticMarkup(
      <PageHeader eyebrow="EY" title="T">
        <button>Action</button>
      </PageHeader>
    );
    expect(html).toMatch(/page-header-actions/);
    expect(html).toMatch(/Action/);
  });

  it("omits actions slot when no children", () => {
    const html = renderToStaticMarkup(
      <PageHeader eyebrow="EY" title="T" />
    );
    expect(html).not.toMatch(/page-header-actions/);
  });
});

// ---------------------------------------------------------------------------
// ErrorBanner
// ---------------------------------------------------------------------------

describe("ErrorBanner", () => {
  it("renders message with role=alert", () => {
    const html = renderToStaticMarkup(
      <ErrorBanner message="Something went wrong" />
    );
    expect(html).toMatch(/role="alert"/);
    expect(html).toMatch(/Something went wrong/);
    expect(html).toMatch(/banner-error/);
  });

  it("renders an empty message without crashing", () => {
    const html = renderToStaticMarkup(<ErrorBanner message="" />);
    expect(html).toMatch(/banner-error/);
  });
});

// ---------------------------------------------------------------------------
// SuccessBanner
// ---------------------------------------------------------------------------

describe("SuccessBanner", () => {
  it("renders message with role=status", () => {
    const html = renderToStaticMarkup(
      <SuccessBanner message="Transfer complete" />
    );
    expect(html).toMatch(/role="status"/);
    expect(html).toMatch(/Transfer complete/);
    expect(html).toMatch(/banner-success/);
  });
});

// ---------------------------------------------------------------------------
// EmptyState
// ---------------------------------------------------------------------------

describe("EmptyState", () => {
  it("renders title and message", () => {
    const html = renderToStaticMarkup(
      <EmptyState title="Nothing here" message="Start by creating one." />
    );
    expect(html).toMatch(/<h2>Nothing here<\/h2>/);
    expect(html).toMatch(/Start by creating one/);
  });

  it("renders custom icon when provided", () => {
    const html = renderToStaticMarkup(
      <EmptyState title="T" message="M" icon={<span data-testid="custom-icon" />} />
    );
    expect(html).toMatch(/custom-icon/);
  });

  it("falls back to Inbox icon when no icon prop", () => {
    const html = renderToStaticMarkup(
      <EmptyState title="T" message="M" />
    );
    // Lucide renders an svg
    expect(html).toMatch(/<svg/);
  });

  it("renders children in actions slot", () => {
    const html = renderToStaticMarkup(
      <EmptyState title="T" message="M">
        <button>Go</button>
      </EmptyState>
    );
    expect(html).toMatch(/empty-state-actions/);
    expect(html).toMatch(/Go/);
  });

  it("omits actions slot when no children", () => {
    const html = renderToStaticMarkup(
      <EmptyState title="T" message="M" />
    );
    expect(html).not.toMatch(/empty-state-actions/);
  });

  it("omits message paragraph when message is empty string", () => {
    const html = renderToStaticMarkup(
      <EmptyState title="T" message="" />
    );
    // The conditional `{message ? <p>...` means no <p> for empty string
    const paragraphs = (html.match(/<p>/g) ?? []).length;
    expect(paragraphs).toBe(0);
  });
});

// ---------------------------------------------------------------------------
// Skeleton
// ---------------------------------------------------------------------------

describe("Skeleton", () => {
  it("renders default 3 lines with role=status", () => {
    const html = renderToStaticMarkup(<Skeleton />);
    expect(html).toMatch(/role="status"/);
    expect(html).toMatch(/aria-busy="true"/);
    expect(html).toMatch(/aria-label="Loading"/);
    // Match the exact class (with trailing quote to avoid matching "printing-lines")
    const lines = (html.match(/printing-line"/g) ?? []).length;
    expect(lines).toBe(3);
  });

  it("renders requested number of lines", () => {
    const html = renderToStaticMarkup(<Skeleton rows={6} />);
    const lines = (html.match(/printing-line"/g) ?? []).length;
    expect(lines).toBe(6);
  });

  it("renders zero lines when rows=0", () => {
    const html = renderToStaticMarkup(<Skeleton rows={0} />);
    // "printing-line"" (with quote) is the span class; printing-lines is the wrapper
    expect(html).not.toMatch(/printing-line"/);
  });

  it("renders printing caption text", () => {
    const html = renderToStaticMarkup(<Skeleton />);
    expect(html).toMatch(/Printing/);
  });
});
