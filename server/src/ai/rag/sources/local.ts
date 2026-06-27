/**
 * Local-folder knowledge source (RAG_PLAN.md §4, M1 default).
 *
 * Recursively reads .md/.txt/.markdown files under a directory. The document
 * revision is a content hash, so re-running the sync skips unchanged files. The
 * category is taken from an explicit override, else inferred from the path
 * ('loan' → loan_package, 'policy' → policy).
 */
import { createHash } from "node:crypto";
import { promises as fs } from "node:fs";
import path from "node:path";

import { extractPdfText } from "../pdf.js";
import type { KnowledgeSource, SourceFile } from "./types.js";

const TEXT_EXTENSIONS = new Set([".md", ".markdown", ".txt"]);
const PDF_EXTENSION = ".pdf";
const SUPPORTED_EXTENSIONS = new Set([...TEXT_EXTENSIONS, PDF_EXTENSION]);

function sha256(text: string): string {
  return createHash("sha256").update(text).digest("hex");
}

function inferCategory(relPath: string, override?: string): string | null {
  if (override) return override;
  const lower = relPath.toLowerCase();
  if (lower.includes("loan")) return "loan_package";
  if (lower.includes("policy") || lower.includes("policies")) return "policy";
  return null;
}

function deriveTitle(content: string, relPath: string): string {
  const heading = content.split("\n").find((l) => /^#{1,6}\s+/.test(l.trim()));
  if (heading) return heading.replace(/^#{1,6}\s+/, "").trim();
  return path.basename(relPath, path.extname(relPath)).replace(/[-_]/g, " ");
}

async function walk(dir: string): Promise<string[]> {
  const entries = await fs.readdir(dir, { withFileTypes: true });
  const files: string[] = [];
  for (const entry of entries) {
    const full = path.join(dir, entry.name);
    if (entry.isDirectory()) {
      files.push(...(await walk(full)));
    } else if (SUPPORTED_EXTENSIONS.has(path.extname(entry.name).toLowerCase())) {
      files.push(full);
    }
  }
  return files;
}

export function createLocalSource(rootDir: string, categoryOverride?: string): KnowledgeSource {
  const root = path.resolve(rootDir);
  return {
    kind: "local",
    async list(): Promise<SourceFile[]> {
      let paths: string[];
      try {
        paths = await walk(root);
      } catch (error) {
        throw new Error(
          `Knowledge source directory not readable (${root}): ${
            error instanceof Error ? error.message : "unknown error"
          }`
        );
      }
      const files: SourceFile[] = [];
      for (const full of paths.sort()) {
        const ext = path.extname(full).toLowerCase();
        const isPdf = ext === PDF_EXTENSION;
        // Hash the raw bytes (stable change detection); PDFs are extracted to text.
        const bytes = await fs.readFile(full);
        const content = isPdf
          ? await extractPdfText(new Uint8Array(bytes))
          : bytes.toString("utf8");
        if (!content.trim()) continue;
        const relPath = path.relative(root, full);
        files.push({
          sourceRef: relPath,
          revision: sha256(bytes.toString("latin1")),
          title: deriveTitle(content, relPath),
          mimeType: isPdf
            ? "application/pdf"
            : ext === ".txt"
              ? "text/plain"
              : "text/markdown",
          category: inferCategory(relPath, categoryOverride),
          uri: relPath,
          content
        });
      }
      return files;
    }
  };
}
