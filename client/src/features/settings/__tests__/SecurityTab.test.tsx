import React from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { MemoryRouter } from "react-router-dom";
import { ActivityList } from "../SecurityTab.js";
import type { ActivityEventDto } from "../../../lib/types.js";

const LOGIN_TLV: ActivityEventDto = {
  id: "e1", kind: "login", at: "2026-07-01T10:00:00.000Z",
  city: "Tel Aviv", country: "IL", lat: 32.0853, lng: 34.7818, transactionId: null
};
const TRANSFER_UNKNOWN: ActivityEventDto = {
  id: "e2", kind: "transfer", at: "2026-07-01T11:00:00.000Z",
  city: null, country: null, lat: null, lng: null, transactionId: "6867f00000000000000000ab"
};

function render(ui: React.ReactElement): string {
  return renderToStaticMarkup(<MemoryRouter>{ui}</MemoryRouter>);
}

test("renders city and country for a located login", () => {
  const html = render(<ActivityList events={[LOGIN_TLV]} />);
  expect(html).toMatch(/Tel Aviv/);
  expect(html).toMatch(/Login/);
});

test("renders 'Unknown location' when geo is null", () => {
  const html = render(<ActivityList events={[TRANSFER_UNKNOWN]} />);
  expect(html).toMatch(/Unknown location/);
  expect(html).toMatch(/Transfer/);
});

test("empty state explains the stream", () => {
  const html = render(<ActivityList events={[]} />);
  expect(html).toMatch(/No activity yet/i);
});
