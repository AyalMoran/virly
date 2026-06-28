import React from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { BootSplashView } from "../../components/BootSplash";

test("boot splash view is an accessible split-flap phrase board", () => {
  const html = renderToStaticMarkup(<BootSplashView phase="visible" />);

  expect(html).toMatch(/role="status"/);
  expect(html).toMatch(/aria-label="Loading"/);
  expect(html).toMatch(/boot-flap-board/);

  // The board renders a fixed-width row of cells (the first phrase, centered).
  const cells = (html.match(/boot-flap-cell/g) ?? []).length;
  expect(cells).toBeGreaterThanOrEqual(12);

  // At least one cell carries a settled letter (not all blank padding).
  expect(html).toMatch(/class="boot-flap-char">[A-Z]</);
});

test("the exiting phase adds the fade-out class", () => {
  const html = renderToStaticMarkup(<BootSplashView phase="exiting" />);

  expect(html).toMatch(/boot-splash-exiting/);
});
