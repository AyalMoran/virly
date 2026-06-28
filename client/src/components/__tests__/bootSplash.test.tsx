import assert from "node:assert/strict";
import test from "node:test";
import React from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { BootSplashView } from "../../components/BootSplash";

test("boot splash view is an accessible split-flap phrase board", () => {
  const html = renderToStaticMarkup(<BootSplashView phase="visible" />);

  assert.match(html, /role="status"/);
  assert.match(html, /aria-label="Loading"/);
  assert.match(html, /boot-flap-board/);

  // The board renders a fixed-width row of cells (the first phrase, centered).
  const cells = (html.match(/boot-flap-cell/g) ?? []).length;
  assert.ok(cells >= 12, `expected the full board width, got ${cells} cells`);

  // At least one cell carries a settled letter (not all blank padding).
  assert.match(html, /class="boot-flap-char">[A-Z]</);
});

test("the exiting phase adds the fade-out class", () => {
  const html = renderToStaticMarkup(<BootSplashView phase="exiting" />);

  assert.match(html, /boot-splash-exiting/);
});
