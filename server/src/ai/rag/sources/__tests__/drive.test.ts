import {
  createDriveSource,
  FOLDER_MIME,
  GOOGLE_DOC_MIME,
  PDF_MIME,
  type DriveClient,
  type DriveFileMeta
} from "../drive.js";

/** A fake Drive client backed by an in-memory folder tree. */
function fakeClient(
  tree: Record<string, DriveFileMeta[]>,
  bodies: Record<string, string>
): { client: DriveClient; exported: string[]; fetched: string[]; pdfFetched: string[] } {
  const exported: string[] = [];
  const fetched: string[] = [];
  const pdfFetched: string[] = [];
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
    },
    async getPdfText(fileId) {
      pdfFetched.push(fileId);
      return bodies[fileId] ?? "";
    }
  };
  return { client, exported, fetched, pdfFetched };
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

    expect(files.length).toBe(2);
    // text file → getFileMedia, md5 revision, category from path inference
    const f1 = byRef.get("f1")!;
    expect(f1.revision).toBe("abc");
    expect(f1.title).toBe("policy");
    expect(f1.category).toBe("policy");
    expect(fetched).toStrictEqual(["f1"]);

    // Google Doc → export to markdown, revision = version:modifiedTime, loan category
    const f2 = byRef.get("f2")!;
    expect(f2.revision).toBe("7:2026-01-01T00:00:00Z");
    expect(f2.category).toBe("loan_package");
    expect(f2.uri).toBe("https://drive.google.com/doc/f2");
    expect(f2.content).toMatch(/APR details/);
    expect(exported).toStrictEqual(["f2"]);
  });

  test("routes PDF files through getPdfText (extracted text)", async () => {
    const tree: Record<string, DriveFileMeta[]> = {
      root: [{ id: "p1", name: "terms.pdf", mimeType: PDF_MIME, md5Checksum: "pdfhash" }]
    };
    const { client, pdfFetched } = fakeClient(tree, { p1: "Extracted loan terms text." });
    const files = await createDriveSource("root", client).list();
    expect(files.length).toBe(1);
    expect(pdfFetched).toStrictEqual(["p1"]);
    expect(files[0].title).toBe("terms");
    expect(files[0].mimeType).toBe(PDF_MIME);
    expect(files[0].content).toMatch(/Extracted loan terms/);
  });

  test("skips unsupported mime types and empty files", async () => {
    const skipped: string[] = [];
    const tree: Record<string, DriveFileMeta[]> = {
      root: [
        { id: "img", name: "logo.png", mimeType: "image/png" },
        { id: "empty", name: "blank.md", mimeType: "text/markdown", md5Checksum: "x" }
      ]
    };
    const { client } = fakeClient(tree, { empty: "   " });
    const files = await createDriveSource("root", client, {
      onSkip: (f, reason) => skipped.push(`${f.id}:${reason}`)
    }).list();

    expect(files.length).toBe(0);
    expect(skipped.some((s) => s.startsWith("img:"))).toBeTruthy();
    expect(skipped.some((s) => s.startsWith("empty:"))).toBeTruthy();
  });

  test("categoryOverride wins over path inference", async () => {
    const tree: Record<string, DriveFileMeta[]> = {
      root: [{ id: "f1", name: "x.md", mimeType: "text/markdown", md5Checksum: "a" }]
    };
    const { client } = fakeClient(tree, { f1: "content" });
    const files = await createDriveSource("root", client, {
      categoryOverride: "loan_package"
    }).list();
    expect(files[0].category).toBe("loan_package");
  });
});
