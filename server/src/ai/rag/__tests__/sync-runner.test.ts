import { config } from "../../../config.js";
import { buildKnowledgeSource, type KnowledgeSourceKind } from "../sync-runner.js";

describe("buildKnowledgeSource", () => {
  const cleanups: Array<() => void> = [];
  afterEach(() => {
    for (const c of cleanups.splice(0).reverse()) c();
  });

  function setLocalDir(value: string | undefined) {
    const original = config.rag.localDir;
    config.rag.localDir = value;
    cleanups.push(() => {
      config.rag.localDir = original;
    });
  }

  function setDriveFolderId(value: string | undefined) {
    const original = config.rag.drive.folderId;
    config.rag.drive.folderId = value;
    cleanups.push(() => {
      config.rag.drive.folderId = original;
    });
  }

  test("local source without a dir throws a helpful error", async () => {
    setLocalDir(undefined);
    await expect(buildKnowledgeSource({ kind: "local" })).rejects.toThrow(
      /VIRLY_RAG_LOCAL_DIR/
    );
  });

  test("drive source without a folder id throws a helpful error", async () => {
    setDriveFolderId(undefined);
    await expect(buildKnowledgeSource({ kind: "drive" })).rejects.toThrow(
      /VIRLY_RAG_DRIVE_FOLDER_ID/
    );
  });

  test("an unknown source kind throws", async () => {
    await expect(
      buildKnowledgeSource({ kind: "bogus" as KnowledgeSourceKind })
    ).rejects.toThrow(/Unknown source kind=bogus/);
  });

  test("a local dir argument resolves to an absolute path label", async () => {
    const { label } = await buildKnowledgeSource({ kind: "local", dir: "some/rel/dir" });
    expect(label).toMatch(/^local dir=\//); // path.resolve made it absolute
  });
});
