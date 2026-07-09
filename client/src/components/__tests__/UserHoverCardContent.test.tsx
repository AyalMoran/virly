// client/src/components/__tests__/UserHoverCardContent.test.tsx
import React from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { MemoryRouter } from "react-router-dom";
import { UserHoverCardContent } from "../UserHoverCardContent";

const fmt = (n: number) => `₪${n}`;

function render(ui: React.ReactElement): string {
  return renderToStaticMarkup(<MemoryRouter>{ui}</MemoryRouter>);
}

describe("UserHoverCardContent", () => {
  test("loaded card shows name, net label, totals, and a profile link", () => {
    const html = render(
      <UserHoverCardContent
        email="dan@example.com"
        state="loaded"
        formatAmount={fmt}
        summary={{
          name: "Dan",
          netLabel: "Net sent",
          netAmount: 200,
          totalSent: 300,
          totalReceived: 100,
          transactionCount: 4,
          lastInteraction: "2026-06-20T10:00:00Z",
          verified: true
        }}
      />
    );
    expect(html).toMatch(/Dan/);
    expect(html).toMatch(/Net sent/);
    expect(html).toMatch(/₪200/);
    expect(html).toMatch(/\/users\/dan%40example\.com|\/users\/dan@example\.com/);
    expect(html).toMatch(/View full profile/i);
  });

  test("loading state renders a loading affordance", () => {
    const html = render(
      <UserHoverCardContent email="x@y.com" state="loading" formatAmount={fmt} />
    );
    expect(html).toMatch(/loading|…/i);
  });

  test("error state renders a fallback", () => {
    const html = render(
      <UserHoverCardContent email="x@y.com" state="error" formatAmount={fmt} />
    );
    expect(html).toMatch(/couldn.?t|unavailable|try/i);
  });
});
