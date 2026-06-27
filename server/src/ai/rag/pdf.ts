/**
 * PDF text extraction for knowledge-base ingestion (RAG_PLAN.md, M2 follow-up).
 *
 * Used by both the local and Drive sources to turn PDF bytes into plain text that
 * the chunker can split. pdf-parse v2 appends a "-- N of M --" page-separator
 * line per page; we strip those so they don't pollute chunks/embeddings.
 */
import { PDFParse } from "pdf-parse";

const PAGE_MARKER = /^\s*--\s*\d+\s*of\s*\d+\s*--\s*$/;

export async function extractPdfText(data: Uint8Array): Promise<string> {
  const parser = new PDFParse({ data });
  try {
    const { text } = await parser.getText();
    return (text ?? "")
      .split("\n")
      .filter((line) => !PAGE_MARKER.test(line))
      .join("\n")
      .trim();
  } finally {
    await parser.destroy().catch(() => {});
  }
}
