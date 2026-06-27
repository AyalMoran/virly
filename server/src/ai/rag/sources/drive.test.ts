import assert from "node:assert/strict";
import { describe, test } from "node:test";

import {
  createDriveSource,
  FOLDER_MIME,
  GOOGLE_DOC_MIME,
  type DriveClient,
  type DriveFileMeta
} from "./drive.js";

/** A fake Drive client backed by an in-memory folder tree. */
function fakeClient(
  tree: Record<string, DriveFileMeta[]>,
  bodies: Record<string, string>
): { client: DriveClient; exported: string[]; fetched: string[] } {
  const exported: string[] = [];
  const fetched: string[] = [];
  const client: DriveClient = {
    async listFolder(folderId) {
      return tree[folderId] ?? [];
    },
    async exportDoc(fileId) {
      exported.push(fileId);
      return bodies[fileId] ?? "";
    },
    async getFileMedia(fileId) {
      fetched.push(fileId);
      return bodies[fileId] ?? "";
    }
  };
  return { client, exported, fetched };
}

describe("createDriveSource", () => {
  test("walks subfolders, exports Docs, reads text, and maps fields", async () => {
    const tree: Record<string, DriveFileMeta[]> = {
      root: [
        { id: "sub", name: "loans", mimeType: FOLDER_MIME },
        { id: "f1", name: "policy.md", mimeType: "text/markdown", md5Checksum: "abc" }
      ],
      sub: [
        {
          id: "f2",
          name: "Loan Terms",
          mimeType: GOOGLE_DOC_MIME,
          version: "7",
          modifiedTime: "2026-01-01T00:00:00Z",
          webViewLink: "https://drive.google.com/doc/f2"
        }
      ]
    };
    const bodies = { f1: "# Policy\n\nText.", f2: "# Loan Terms\n\nAPR details." };
    const { client, exported, fetched } = fakeClient(tree, bodies);

    const files = await createDriveSource("root", client).list();
    const byRef = new Map(files.map((f) => [f.sourceRef, f]));

    assert.equal(files.length, 2);
    // text file → getFileMedia, md5 revision, category from path inference
    const f1 = byRef.get("f1")!;
    assert.equal(f1.revision, "abc");
    assert.equal(f1.title, "policy");
    assert.equal(f1.category, "policy");
    assert.deepEqual(fetched, ["f1"]);

    // Google Doc → export to markdown, revision = version:modifiedTime, loan category
    const f2 = byRef.get("f2")!;
    assert.equal(f2.revision, "7:2026-01-01T00:00:00Z");
    assert.equal(f2.category, "loan_package");
    assert.equal(f2.uri, "https://drive.google.com/doc/f2");
    assert.match(f2.content, /APR details/);
    assert.deepEqual(exported, ["f2"]);
  });

  test("skips unsupported mime types and empty files", async () => {
    const skipped: string[] = [];
    const tree: Record<string, DriveFileMeta[]> = {
      root: [
        { id: "pdf", name: "scan.pdf", mimeType: "application/pdf" },
        { id: "empty", name: "blank.md", mimeType: "text/markdown", md5Checksum: "x" }
      ]
    };
    const { client } = fakeClient(tree, { empty: "   " });
    const files = await createDriveSource("root", client, {
      onSkip: (f, reason) => skipped.push(`${f.id}:${reason}`)
    }).list();

    assert.equal(files.length, 0);
    assert.ok(skipped.some((s) => s.startsWith("pdf:")));
    assert.ok(skipped.some((s) => s.startsWith("empty:")));
  });

  test("categoryOverride wins over path inference", async () => {
    const tree: Record<string, DriveFileMeta[]> = {
      root: [{ id: "f1", name: "x.md", mimeType: "text/markdown", md5Checksum: "a" }]
    };
    const { client } = fakeClient(tree, { f1: "content" });
    const files = await createDriveSource("root", client, {
      categoryOverride: "loan_package"
    }).list();
    assert.equal(files[0].category, "loan_package");
  });
});
