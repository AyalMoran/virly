import assert from "node:assert/strict";
import { describe, test } from "node:test";

import { extractPdfText } from "../pdf.js";

/** Build a tiny but valid single-page PDF containing `text` (computed xref offsets). */
function makeMinimalPdf(text: string): Uint8Array {
  const objs = [
    "<</Type/Catalog/Pages 2 0 R>>",
    "<</Type/Pages/Kids[3 0 R]/Count 1>>",
    "<</Type/Page/Parent 2 0 R/MediaBox[0 0 612 792]/Contents 4 0 R/Resources<</Font<</F1 5 0 R>>>>>>"
  ];
  const stream = `BT /F1 24 Tf 72 700 Td (${text}) Tj ET`;
  objs.push(`<</Length ${stream.length}>>\nstream\n${stream}\nendstream`);
  objs.push("<</Type/Font/Subtype/Type1/BaseFont/Helvetica>>");

  let pdf = "%PDF-1.4\n";
  const offsets: number[] = [];
  objs.forEach((body, i) => {
    offsets.push(pdf.length);
    pdf += `${i + 1} 0 obj\n${body}\nendobj\n`;
  });
  const xrefStart = pdf.length;
  pdf += `xref\n0 ${objs.length + 1}\n0000000000 65535 f \n`;
  offsets.forEach((o) => {
    pdf += `${String(o).padStart(10, "0")} 00000 n \n`;
  });
  pdf += `trailer\n<</Size ${objs.length + 1}/Root 1 0 R>>\nstartxref\n${xrefStart}\n%%EOF`;
  return new Uint8Array(Buffer.from(pdf, "latin1"));
}

describe("extractPdfText", () => {
  test("extracts the document text from a PDF", async () => {
    const text = await extractPdfText(makeMinimalPdf("Premium loan APR is 5.9 percent"));
    assert.match(text, /Premium loan APR is 5\.9 percent/);
  });

  test("strips pdf-parse page-separator markers", async () => {
    const text = await extractPdfText(makeMinimalPdf("Eligibility policy"));
    assert.doesNotMatch(text, /--\s*\d+\s*of\s*\d+\s*--/);
    assert.match(text, /Eligibility policy/);
  });
});
