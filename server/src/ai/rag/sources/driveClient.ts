/**
 * Real Google Drive client backing the Drive source (RAG_PLAN.md §4, M2).
 *
 * The ONLY module that imports `googleapis`, so the heavy SDK loads only when a
 * Drive sync actually runs (never at app boot). Authenticates with a service
 * account (JSON string or key file) over the read-only Drive scope.
 */
import { google, type drive_v3 } from "googleapis";

import { config } from "../../../config.js";
import { extractPdfText } from "../pdf.js";
import type { DriveClient, DriveFileMeta } from "./drive.js";

const DRIVE_READONLY = "https://www.googleapis.com/auth/drive.readonly";

const LIST_FIELDS =
  "nextPageToken, files(id, name, mimeType, modifiedTime, md5Checksum, version, webViewLink)";

function buildAuth(): InstanceType<typeof google.auth.GoogleAuth> {
  const { serviceAccountJson, serviceAccountFile } = config.rag.drive;
  if (serviceAccountJson) {
    let credentials: Record<string, unknown>;
    try {
      credentials = JSON.parse(serviceAccountJson);
    } catch {
      throw new Error("VIRLY_GOOGLE_SERVICE_ACCOUNT_JSON is not valid JSON.");
    }
    return new google.auth.GoogleAuth({ credentials, scopes: [DRIVE_READONLY] });
  }
  if (serviceAccountFile) {
    return new google.auth.GoogleAuth({ keyFile: serviceAccountFile, scopes: [DRIVE_READONLY] });
  }
  throw new Error(
    "Drive ingestion needs a service account: set VIRLY_GOOGLE_SERVICE_ACCOUNT_JSON or VIRLY_GOOGLE_APPLICATION_CREDENTIALS."
  );
}

export function createGoogleDriveClient(): DriveClient {
  const auth = buildAuth();
  const drive = google.drive({ version: "v3", auth });

  return {
    async listFolder(folderId: string): Promise<DriveFileMeta[]> {
      const files: DriveFileMeta[] = [];
      let pageToken: string | undefined;
      do {
        const res = await drive.files.list({
          q: `'${folderId}' in parents and trashed = false`,
          fields: LIST_FIELDS,
          pageSize: 1000,
          pageToken,
          // Support Shared Drives as well as My Drive folders.
          supportsAllDrives: true,
          includeItemsFromAllDrives: true
        });
        for (const f of res.data.files ?? []) {
          files.push(f as DriveFileMeta);
        }
        pageToken = res.data.nextPageToken ?? undefined;
      } while (pageToken);
      return files;
    },

    async exportDoc(fileId: string, mimeType: string): Promise<string> {
      const res = await drive.files.export(
        { fileId, mimeType },
        { responseType: "text" }
      );
      return typeof res.data === "string" ? res.data : String(res.data);
    },

    async getFileMedia(fileId: string): Promise<string> {
      const res = await drive.files.get(
        { fileId, alt: "media", supportsAllDrives: true },
        { responseType: "text" }
      );
      return typeof res.data === "string" ? res.data : String(res.data);
    },

    async getPdfText(fileId: string): Promise<string> {
      const res = await drive.files.get(
        { fileId, alt: "media", supportsAllDrives: true },
        { responseType: "arraybuffer" }
      );
      return extractPdfText(new Uint8Array(res.data as ArrayBuffer));
    }
  } satisfies DriveClient;
}

export type { drive_v3 };
