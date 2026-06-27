import assert from "node:assert/strict";
import test from "node:test";
import React, { isValidElement, type ReactElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { MemoryRouter } from "react-router-dom";
import {
  TransactionList,
  TransactionsPagination,
  buildPaginationItems,
  clampPage
} from "../src/components/TransactionList";
import type { Pagination, Transaction } from "../src/lib/types";

function makePagination(page: number, totalPages: number): Pagination {
  return { page, limit: 10, total: totalPages * 10, totalPages };
}

const sampleTransaction: Transaction = {
  id: "tx-1",
  amount: 120,
  counterpartyEmail: "daniel@example.com",
  reason: "Lunch",
  date: "2026-06-03T12:00:00.000Z"
};

/** Minimal spy: records the arguments of every call for later assertions. */
function createSpy() {
  const calls: number[][] = [];
  const fn = (...args: number[]) => {
    calls.push(args);
  };
  return Object.assign(fn, { calls });
}

/**
 * Walks a React element tree, returning every element. Lets us assert on a
 * hook-free component's props (onClick, aria-*) without a DOM renderer.
 */
function collectElements(node: unknown, acc: ReactElement[] = []): ReactElement[] {
  if (Array.isArray(node)) {
    for (const child of node) {
      collectElements(child, acc);
    }
    return acc;
  }
  if (isValidElement(node)) {
    acc.push(node);
    collectElements((node.props as { children?: unknown }).children, acc);
  }
  return acc;
}

function pageButtonsOf(page: number, totalPages: number): ReactElement[] {
  const tree = TransactionsPagination({
    pagination: makePagination(page, totalPages),
    page,
    onPageChange: () => {}
  });
  return collectElements(tree).filter(
    (el) => typeof el.props.children === "number"
  );
}

// --- Pure windowing logic -------------------------------------------------

test("buildPaginationItems shows every page when the count is small", () => {
  assert.deepEqual(buildPaginationItems(1, 1), [1]);
  assert.deepEqual(buildPaginationItems(3, 5), [1, 2, 3, 4, 5]);
  assert.deepEqual(buildPaginationItems(4, 7), [1, 2, 3, 4, 5, 6, 7]);
});

test("buildPaginationItems truncates a large count around the current page", () => {
  assert.deepEqual(buildPaginationItems(6, 20), [
    1,
    "ellipsis",
    5,
    6,
    7,
    "ellipsis",
    20
  ]);
});

test("buildPaginationItems drops the leading ellipsis near the start", () => {
  assert.deepEqual(buildPaginationItems(2, 20), [1, 2, 3, "ellipsis", 20]);
});

test("buildPaginationItems drops the trailing ellipsis near the end", () => {
  assert.deepEqual(buildPaginationItems(19, 20), [1, "ellipsis", 18, 19, 20]);
});

test("buildPaginationItems fills a single-page gap instead of an ellipsis", () => {
  assert.deepEqual(buildPaginationItems(4, 20), [
    1,
    2,
    3,
    4,
    5,
    "ellipsis",
    20
  ]);
});

test("buildPaginationItems clamps an out-of-range current page", () => {
  assert.deepEqual(buildPaginationItems(99, 10), [1, "ellipsis", 9, 10]);
});

test("clampPage keeps requests inside 1..totalPages", () => {
  assert.equal(clampPage(5, 10), 5);
  assert.equal(clampPage(0, 10), 1);
  assert.equal(clampPage(99, 10), 10);
  assert.equal(clampPage(3.7, 10), 3);
  assert.equal(clampPage(Number.NaN, 10), 1);
  assert.equal(clampPage(2, 0), 1);
});

// --- Rendered markup ------------------------------------------------------

test("numbered page buttons render for the given totalPages", () => {
  const html = renderToStaticMarkup(
    <TransactionsPagination
      pagination={makePagination(1, 4)}
      page={1}
      onPageChange={() => {}}
    />
  );

  assert.match(html, /aria-label="Go to page 2"/);
  assert.match(html, /aria-label="Go to page 3"/);
  assert.match(html, /aria-label="Go to page 4"/);
  // Page 1 is current: marked, not an actionable "Go to page" target.
  assert.match(html, /aria-current="page"/);
  assert.match(html, /aria-label="Page 1, current page"/);
  // A short list needs no truncation.
  assert.doesNotMatch(html, /pagination-gap/);
});

test("ellipsis truncation appears for a large page count", () => {
  const html = renderToStaticMarkup(
    <TransactionsPagination
      pagination={makePagination(6, 20)}
      page={6}
      onPageChange={() => {}}
    />
  );

  assert.match(html, /class="pagination-gap"[^>]*aria-hidden="true"/);
  assert.match(html, /…/);
  // First and last pages stay reachable.
  assert.match(html, /aria-label="Go to page 1"/);
  assert.match(html, /aria-label="Go to page 20"/);
  // Current page is page 6 and marked accordingly.
  assert.match(html, /aria-label="Page 6, current page"/);
  // A direct "Go to page" jump appears once the list truncates.
  assert.match(html, /Go to page<\/label>/);
  assert.match(html, /name="page"/);
});

test("a small page count omits the go-to-page jump input", () => {
  const html = renderToStaticMarkup(
    <TransactionsPagination
      pagination={makePagination(2, 4)}
      page={2}
      onPageChange={() => {}}
    />
  );

  assert.doesNotMatch(html, /name="page"/);
});

// --- Click behaviour ------------------------------------------------------

test("clicking page N calls onPageChange(N)", () => {
  const onPageChange = createSpy();
  const tree = TransactionsPagination({
    pagination: makePagination(5, 10),
    page: 5,
    onPageChange
  });
  const buttons = collectElements(tree).filter(
    (el) => typeof el.props.children === "number"
  );

  const sixth = buttons.find((el) => el.props.children === 6);
  assert.ok(sixth, "expected page 6 to be rendered");
  sixth.props.onClick();
  assert.deepEqual(onPageChange.calls, [[6]]);

  const first = buttons.find((el) => el.props.children === 1);
  assert.ok(first, "expected page 1 to be rendered");
  first.props.onClick();
  assert.deepEqual(onPageChange.calls, [[6], [1]]);
});

test("the current page is marked and does not fire onPageChange", () => {
  const buttons = pageButtonsOf(5, 10);
  const current = buttons.find((el) => el.props["aria-current"] === "page");

  assert.ok(current, "expected a current-page button");
  assert.equal(current.props.children, 5);
  assert.equal(current.props["aria-disabled"], true);
  // No handler is wired, so a click (or Enter) is a no-op.
  assert.equal(current.props.onClick, undefined);
});

test("Previous is disabled on the first page and Next advances", () => {
  const onPageChange = createSpy();
  const tree = TransactionsPagination({
    pagination: makePagination(1, 10),
    page: 1,
    onPageChange
  });
  const elements = collectElements(tree);
  const previous = elements.find((el) => el.props.children === "Previous");
  const next = elements.find((el) => el.props.children === "Next");

  assert.ok(previous && next);
  assert.equal(previous.props.disabled, true);
  assert.equal(next.props.disabled, false);

  next.props.onClick();
  assert.deepEqual(onPageChange.calls, [[2]]);
});

test("Next is disabled on the last page and Previous goes back", () => {
  const onPageChange = createSpy();
  const tree = TransactionsPagination({
    pagination: makePagination(10, 10),
    page: 10,
    onPageChange
  });
  const elements = collectElements(tree);
  const previous = elements.find((el) => el.props.children === "Previous");
  const next = elements.find((el) => el.props.children === "Next");

  assert.ok(previous && next);
  assert.equal(next.props.disabled, true);
  assert.equal(previous.props.disabled, false);

  previous.props.onClick();
  assert.deepEqual(onPageChange.calls, [[9]]);
});

// --- Compact / no-pagination paths ---------------------------------------

test("TransactionList renders no pagination controls without pagination props", () => {
  const html = renderToStaticMarkup(
    <MemoryRouter>
      <TransactionList transactions={[sampleTransaction]} />
    </MemoryRouter>
  );

  assert.match(html, /daniel@example\.com/);
  assert.doesNotMatch(html, /aria-label="Transactions pages"/);
  assert.doesNotMatch(html, /class="pagination"/);
});

test("TransactionList renders no pagination controls for a single page", () => {
  const html = renderToStaticMarkup(
    <MemoryRouter>
      <TransactionList
        transactions={[sampleTransaction]}
        pagination={makePagination(1, 1)}
        page={1}
        onPageChange={() => {}}
      />
    </MemoryRouter>
  );

  assert.doesNotMatch(html, /aria-label="Transactions pages"/);
});
