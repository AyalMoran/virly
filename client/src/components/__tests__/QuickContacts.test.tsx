import React from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { MemoryRouter } from "react-router-dom";
import { QuickContacts } from "../QuickContacts.js";
import type { QuickContact } from "../../lib/contacts.js";

function render(ui: React.ReactElement) {
  return renderToStaticMarkup(<MemoryRouter>{ui}</MemoryRouter>);
}

const CONTACTS: QuickContact[] = [
  { email: "alice@example.com", avatar: "AL" },
  { email: "bob@example.com", avatar: "BO" },
];

describe("QuickContacts", () => {
  it("renders empty state when contacts array is empty", () => {
    const html = render(
      <QuickContacts contacts={[]} onSelectContact={() => {}} />
    );
    expect(html).toMatch(/No contacts/);
    expect(html).not.toMatch(/quick-contact-list/);
  });

  it("renders each contact email", () => {
    const html = render(
      <QuickContacts contacts={CONTACTS} onSelectContact={() => {}} />
    );
    expect(html).toMatch(/alice@example\.com/);
    expect(html).toMatch(/bob@example\.com/);
  });

  it("renders each contact avatar initials", () => {
    const html = render(
      <QuickContacts contacts={CONTACTS} onSelectContact={() => {}} />
    );
    expect(html).toMatch(/AL/);
    expect(html).toMatch(/BO/);
  });

  it("renders profile links pointing to /users/<encoded-email>", () => {
    const html = render(
      <QuickContacts contacts={CONTACTS} onSelectContact={() => {}} />
    );
    expect(html).toMatch(/\/users\/alice%40example\.com/);
    expect(html).toMatch(/\/users\/bob%40example\.com/);
  });

  it("renders aria-label on each profile link", () => {
    const html = render(
      <QuickContacts contacts={CONTACTS} onSelectContact={() => {}} />
    );
    // The apostrophe is HTML-encoded as &#x27;
    expect(html).toMatch(/View alice@example\.com(&#x27;|')s profile/);
    expect(html).toMatch(/View bob@example\.com(&#x27;|')s profile/);
  });

  it("renders quick-contact-list wrapper when contacts present", () => {
    const html = render(
      <QuickContacts contacts={CONTACTS} onSelectContact={() => {}} />
    );
    expect(html).toMatch(/quick-contact-list/);
  });

  it("renders a single contact correctly", () => {
    const single: QuickContact[] = [{ email: "carol@virly.com", avatar: "CA" }];
    const html = render(
      <QuickContacts contacts={single} onSelectContact={() => {}} />
    );
    expect(html).toMatch(/carol@virly\.com/);
    expect(html).toMatch(/CA/);
  });

  it("renders button with quick-contact class for each contact", () => {
    const html = render(
      <QuickContacts contacts={CONTACTS} onSelectContact={() => {}} />
    );
    const buttons = (html.match(/class="quick-contact"/g) ?? []).length;
    expect(buttons).toBe(CONTACTS.length);
  });
});
