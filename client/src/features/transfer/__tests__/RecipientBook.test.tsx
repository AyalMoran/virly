import React from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { RecipientBook } from "../RecipientBook";

const saved = [
  { email: "dan@example.com", avatar: "DL", contactId: "c1", displayName: "Dan Levi" }
];
const recent = [{ email: "alice@example.com", avatar: "A" }];
const noop = () => {};

test("renders saved and recent groups with labels", () => {
  const html = renderToStaticMarkup(
    <RecipientBook
      saved={saved}
      recent={recent}
      selectedEmail=""
      onSelect={noop}
      onSave={noop}
      onRemove={noop}
    />
  );

  expect(html).toMatch(/Saved contacts/);
  expect(html).toMatch(/Recent payees/);
  expect(html).toMatch(/Dan Levi/);
  expect(html).toMatch(/alice@example\.com/);
});

test("saved chips expose a remove action; recent chips expose a save action", () => {
  const html = renderToStaticMarkup(
    <RecipientBook
      saved={saved}
      recent={recent}
      selectedEmail=""
      onSelect={noop}
      onSave={noop}
      onRemove={noop}
    />
  );

  expect(html).toMatch(/aria-label="Remove Dan Levi from contacts"/);
  expect(html).toMatch(/aria-label="Save alice@example\.com as a contact"/);
});

test("marks the selected email and renders nothing when both groups are empty", () => {
  const selected = renderToStaticMarkup(
    <RecipientBook
      saved={saved}
      recent={[]}
      selectedEmail="dan@example.com"
      onSelect={noop}
      onSave={noop}
      onRemove={noop}
    />
  );
  expect(selected).toMatch(/cheque-payee-chip selected/);

  const empty = renderToStaticMarkup(
    <RecipientBook
      saved={[]}
      recent={[]}
      selectedEmail=""
      onSelect={noop}
      onSave={noop}
      onRemove={noop}
    />
  );
  expect(empty).toBe("");
});
