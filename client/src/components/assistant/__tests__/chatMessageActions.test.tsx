import React from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { ChatMessageActions } from "../ChatMessageActions";

test("renders resend and edit buttons with accessible labels", () => {
  const html = renderToStaticMarkup(
    <ChatMessageActions disabled={false} onResend={() => {}} onEdit={() => {}} />
  );

  expect(html).toMatch(/aria-label="Resend this message"/);
  expect(html).toMatch(/aria-label="Edit and resend this message"/);
  expect(html).toMatch(/type="button"/);
  expect(html).not.toMatch(/disabled/);
});

test("disables both buttons while a send is in flight", () => {
  const html = renderToStaticMarkup(
    <ChatMessageActions disabled onResend={() => {}} onEdit={() => {}} />
  );

  const disabledCount = (html.match(/disabled/g) ?? []).length;
  expect(disabledCount).toBe(2);
});
