import assert from "node:assert/strict";
import { describe, test } from "node:test";

import { approxTokens, chunkDocument } from "../chunk.js";

describe("chunkDocument", () => {
  test("returns [] for empty / whitespace input", () => {
    assert.deepEqual(chunkDocument(""), []);
    assert.deepEqual(chunkDocument("   \n\n  "), []);
  });

  test("keeps a short document as a single chunk with sequential index", () => {
    const chunks = chunkDocument("# Title\n\nA short paragraph about loans.");
    assert.equal(chunks.length, 1);
    assert.equal(chunks[0].chunkIndex, 0);
    assert.match(chunks[0].content, /short paragraph/);
    assert.equal(chunks[0].heading, "Title");
  });

  test("splits a long document into multiple bounded chunks", () => {
    const para = "Virly offers competitive loan terms to verified customers. ";
    const body = `# Loans\n\n${para.repeat(120)}`; // well over the token budget
    const chunks = chunkDocument(body, { maxTokens: 200, overlapTokens: 40 });
    assert.ok(chunks.length > 1, "expected multiple chunks");
    // every chunk respects the budget (with a small allowance for overlap glue)
    for (const c of chunks) {
      assert.ok(approxTokens(c.content) <= 200 + 60, `chunk too big: ${approxTokens(c.content)}`);
    }
    // chunk indices are contiguous from 0
    chunks.forEach((c, i) => assert.equal(c.chunkIndex, i));
  });

  test("carries overlap text from one chunk into the next", () => {
    const sentences = Array.from({ length: 40 }, (_, i) => `Sentence number ${i} about policy.`).join(" ");
    const chunks = chunkDocument(sentences, { maxTokens: 80, overlapTokens: 30 });
    assert.ok(chunks.length >= 2);
    const tailOfFirst = chunks[0].content.slice(-20);
    // some text from the end of chunk 0 should reappear at the start of chunk 1
    const overlapFound = chunks[1].content.includes(tailOfFirst.split(" ").slice(-2).join(" "));
    assert.ok(overlapFound, "expected overlap between consecutive chunks");
  });

  test("attaches the nearest preceding heading to chunks", () => {
    const doc = "# Intro\n\nIntro text.\n\n## Fees\n\nFees text about charges.";
    const chunks = chunkDocument(doc, { maxTokens: 10, overlapTokens: 2 });
    const headings = new Set(chunks.map((c) => c.heading));
    assert.ok(headings.has("Intro") || headings.has("Fees"));
  });
});
