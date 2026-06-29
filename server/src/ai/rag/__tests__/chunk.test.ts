import { approxTokens, chunkDocument } from "../chunk.js";

describe("chunkDocument", () => {
  test("returns [] for empty / whitespace input", () => {
    expect(chunkDocument("")).toStrictEqual([]);
    expect(chunkDocument("   \n\n  ")).toStrictEqual([]);
  });

  test("keeps a short document as a single chunk with sequential index", () => {
    const chunks = chunkDocument("# Title\n\nA short paragraph about loans.");
    expect(chunks.length).toBe(1);
    expect(chunks[0].chunkIndex).toBe(0);
    expect(chunks[0].content).toMatch(/short paragraph/);
    expect(chunks[0].heading).toBe("Title");
  });

  test("splits a long document into multiple bounded chunks", () => {
    const para = "Virly offers competitive loan terms to verified customers. ";
    const body = `# Loans\n\n${para.repeat(120)}`; // well over the token budget
    const chunks = chunkDocument(body, { maxTokens: 200, overlapTokens: 40 });
    expect(chunks.length).toBeGreaterThan(1);
    // every chunk respects the budget (with a small allowance for overlap glue)
    for (const c of chunks) {
      expect(approxTokens(c.content)).toBeLessThanOrEqual(200 + 60);
    }
    // chunk indices are contiguous from 0
    chunks.forEach((c, i) => expect(c.chunkIndex).toBe(i));
  });

  test("carries overlap text from one chunk into the next", () => {
    const sentences = Array.from({ length: 40 }, (_, i) => `Sentence number ${i} about policy.`).join(" ");
    const chunks = chunkDocument(sentences, { maxTokens: 80, overlapTokens: 30 });
    expect(chunks.length).toBeGreaterThanOrEqual(2);
    const tailOfFirst = chunks[0].content.slice(-20);
    // some text from the end of chunk 0 should reappear at the start of chunk 1
    const overlapFound = chunks[1].content.includes(tailOfFirst.split(" ").slice(-2).join(" "));
    expect(overlapFound).toBeTruthy();
  });

  test("attaches the nearest preceding heading to chunks", () => {
    const doc = "# Intro\n\nIntro text.\n\n## Fees\n\nFees text about charges.";
    const chunks = chunkDocument(doc, { maxTokens: 10, overlapTokens: 2 });
    const headings = new Set(chunks.map((c) => c.heading));
    expect(headings.has("Intro") || headings.has("Fees")).toBeTruthy();
  });
});
