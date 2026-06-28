import { promises as fs } from "node:fs";
import os from "node:os";
import path from "node:path";

import { createLocalSource } from "../local.js";

function makeMinimalPdf(text: string): Buffer {
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
  return Buffer.from(pdf, "latin1");
}

describe("createLocalSource (with PDF support)", () => {
  let dir = "";

  beforeEach(async () => {
    dir = await fs.mkdtemp(path.join(os.tmpdir(), "virly-kb-"));
    await fs.mkdir(path.join(dir, "policies"), { recursive: true });
    await fs.mkdir(path.join(dir, "loans"), { recursive: true });
    await fs.writeFile(path.join(dir, "policies", "fees.md"), "# Fees\n\nTransfers are free.");
    await fs.writeFile(
      path.join(dir, "loans", "terms.pdf"),
      makeMinimalPdf("Premium loan APR is 5.9 percent")
    );
  });

  afterEach(async () => {
    await fs.rm(dir, { recursive: true, force: true });
  });

  test("lists markdown and PDF files, extracting PDF text", async () => {
    const files = await createLocalSource(dir).list();
    const byRef = new Map(files.map((f) => [f.sourceRef, f]));
    expect(files.length).toBe(2);

    const md = byRef.get(path.join("policies", "fees.md"));
    expect(md).toBeTruthy();
    expect(md!.mimeType).toBe("text/markdown");
    expect(md!.category).toBe("policy");
    expect(md!.content).toMatch(/Transfers are free/);

    const pdf = byRef.get(path.join("loans", "terms.pdf"));
    expect(pdf).toBeTruthy();
    expect(pdf!.mimeType).toBe("application/pdf");
    expect(pdf!.category).toBe("loan_package");
    expect(pdf!.title).toBe("terms");
    expect(pdf!.content).toMatch(/Premium loan APR is 5\.9 percent/);
  });
});
