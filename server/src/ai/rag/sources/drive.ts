/**
 * Google Drive knowledge source (RAG_PLAN.md §4, M2).
 *
 * Drive is the source of truth for the knowledge base. This adapter walks a Drive
 * folder (recursively), exporting Google Docs to markdown and reading text files
 * directly, and yields {@link SourceFile}s for the same ingestion pipeline the
 * local adapter feeds. The document revision is Drive's md5Checksum (binary
 * files) or version+modifiedTime (native Docs), so re-sync stays idempotent.
 *
 * The Drive API is abstracted behind {@link DriveClient} so the walk + mapping
 * logic is unit-testable without network/credentials; the real client lives in
 * `driveClient.ts` and is the only place that imports `googleapis`.
 */
import type { KnowledgeSource, SourceFile } from "./types.js";

export const FOLDER_MIME = "application/vnd.google-apps.folder";
export const GOOGLE_DOC_MIME = "application/vnd.google-apps.document";

/** Drive file metadata the adapter relies on (a subset of the API resource). */
export type DriveFileMeta = {
  id: string;
  name: string;
  mimeType: string;
  modifiedTime?: string | null;
  md5Checksum?: string | null;
  version?: string | null;
  webViewLink?: string | null;
};

export type DriveClient = {
  /** Files + subfolders directly under `folderId` (not trashed). */
  listFolder(folderId: string): Promise<DriveFileMeta[]>;
  /** Export a native Google Doc to the given mime type, returning text. */
  exportDoc(fileId: string, mimeType: string): Promise<string>;
  /** Download a binary/text file's content as a UTF-8 string. */
  getFileMedia(fileId: string): Promise<string>;
};

/** Mime types we can turn into text today. PDFs etc. are skipped (logged) for now. */
function isIngestibleText(mimeType: string): boolean {
  return (
    mimeType === GOOGLE_DOC_MIME ||
    mimeType === "text/markdown" ||
    mimeType === "text/plain" ||
    mimeType === "text/x-markdown"
  );
}

/** Stable revision: md5 when Drive provides it, else version+modifiedTime. */
function revisionOf(file: DriveFileMeta): string {
  if (file.md5Checksum) return file.md5Checksum;
  return `${file.version ?? "0"}:${file.modifiedTime ?? ""}`;
}

function inferCategory(folderPath: string[], override?: string): string | null {
  if (override) return override;
  const joined = folderPath.join("/").toLowerCase();
  if (joined.includes("loan")) return "loan_package";
  if (joined.includes("policy") || joined.includes("policies")) return "policy";
  return null;
}

export type DriveSourceOptions = {
  categoryOverride?: string;
  /** Called for files that can't be turned into text yet (e.g. PDFs). */
  onSkip?: (file: DriveFileMeta, reason: string) => void;
};

export function createDriveSource(
  folderId: string,
  client: DriveClient,
  options: DriveSourceOptions = {}
): KnowledgeSource {
  async function walk(currentId: string, folderPath: string[]): Promise<SourceFile[]> {
    const entries = await client.listFolder(currentId);
    const out: SourceFile[] = [];
    for (const entry of entries) {
      if (entry.mimeType === FOLDER_MIME) {
        out.push(...(await walk(entry.id, [...folderPath, entry.name])));
        continue;
      }
      if (!isIngestibleText(entry.mimeType)) {
        options.onSkip?.(entry, `unsupported mime ${entry.mimeType}`);
        continue;
      }
      const content =
        entry.mimeType === GOOGLE_DOC_MIME
          ? await client.exportDoc(entry.id, "text/markdown")
          : await client.getFileMedia(entry.id);
      if (!content.trim()) {
        options.onSkip?.(entry, "empty content");
        continue;
      }
      out.push({
        sourceRef: entry.id,
        revision: revisionOf(entry),
        title: entry.name.replace(/\.(md|markdown|txt)$/i, ""),
        mimeType: entry.mimeType,
        // Infer from folder names AND the file name (mirrors the local adapter).
        category: inferCategory([...folderPath, entry.name], options.categoryOverride),
        uri: entry.webViewLink ?? `https://drive.google.com/file/d/${entry.id}/view`,
        content
      });
    }
    return out;
  }

  return {
    kind: "drive",
    async list(): Promise<SourceFile[]> {
      return walk(folderId, []);
    }
  };
}
