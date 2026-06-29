import React from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { NotFoundSlip } from "../NotFoundSlip.js";

describe("NotFoundSlip", () => {
  const defaultProps = {
    requested: "/no/such/page",
    printedAt: "2026-06-25 14:32",
    reference: "VRL-7F3A2C",
  };

  it("renders 404 headline", () => {
    const html = renderToStaticMarkup(<NotFoundSlip {...defaultProps} />);
    expect(html).toMatch(/404/);
  });

  it("renders the requested path in the ledger", () => {
    const html = renderToStaticMarkup(<NotFoundSlip {...defaultProps} />);
    expect(html).toMatch(/\/no\/such\/page/);
  });

  it("renders the printedAt timestamp in the ledger", () => {
    const html = renderToStaticMarkup(<NotFoundSlip {...defaultProps} />);
    expect(html).toMatch(/2026-06-25 14:32/);
  });

  it("renders the reference number in the ledger", () => {
    const html = renderToStaticMarkup(<NotFoundSlip {...defaultProps} />);
    expect(html).toMatch(/VRL-7F3A2C/);
  });

  it("renders brand name Virly", () => {
    const html = renderToStaticMarkup(<NotFoundSlip {...defaultProps} />);
    expect(html).toMatch(/Virly/);
  });

  it("renders Declined stamp text", () => {
    const html = renderToStaticMarkup(<NotFoundSlip {...defaultProps} />);
    expect(html).toMatch(/Declined/);
    expect(html).toMatch(/No Such Route/);
  });

  it("renders the totals section with 0 pages found", () => {
    const html = renderToStaticMarkup(<NotFoundSlip {...defaultProps} />);
    expect(html).toMatch(/Pages found/);
    expect(html).toMatch(/Balance of luck/);
  });

  it("renders barcode caption", () => {
    const html = renderToStaticMarkup(<NotFoundSlip {...defaultProps} />);
    expect(html).toMatch(/4 0 4/);
    expect(html).toMatch(/N O T/);
  });

  it("renders the nf-receipt-shadow wrapper", () => {
    const html = renderToStaticMarkup(<NotFoundSlip {...defaultProps} />);
    expect(html).toMatch(/nf-receipt-shadow/);
  });

  it("renders footer no-charge message", () => {
    const html = renderToStaticMarkup(<NotFoundSlip {...defaultProps} />);
    expect(html).toMatch(/No pages were charged/);
  });

  it("renders with a different requested path", () => {
    const html = renderToStaticMarkup(
      <NotFoundSlip
        requested="/admin/secret"
        printedAt="2026-01-01 00:00"
        reference="VRL-000000"
      />
    );
    expect(html).toMatch(/\/admin\/secret/);
    expect(html).toMatch(/VRL-000000/);
  });

  it("renders barcode elements (nf-bar spans)", () => {
    const html = renderToStaticMarkup(<NotFoundSlip {...defaultProps} />);
    expect(html).toMatch(/nf-bar/);
    expect(html).toMatch(/nf-space/);
  });
});
