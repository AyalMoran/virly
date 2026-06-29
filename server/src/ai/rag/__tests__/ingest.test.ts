import { syncKnowledgeBase } from "../ingest.js";
import type { KnowledgeSource, SourceFile } from "../sources/types.js";
import type {
  KnowledgeChunkInput,
  KnowledgeDocumentRecord,
  KnowledgeRepository,
  KnowledgeSearchHit
} from "../../../repositories/vector/types.js";

function file(overrides: Partial<SourceFile> = {}): SourceFile {
  return {
    sourceRef: "a.md",
    revision: "rev-1",
    title: "A",
    mimeType: "text/markdown",
    category: "policy",
    uri: "a.md",
    content: "# A\n\nSome policy content here.",
    ...overrides
  };
}

function fakeSource(files: SourceFile[]): KnowledgeSource {
  return { kind: "local", list: async () => files };
}

/** In-memory repository capturing the calls the orchestrator makes. */
function fakeRepo(seed: Array<{ id: string; sourceRef: string; revision: string }> = []) {
  const docs = new Map(seed.map((d) => [d.sourceRef, d]));
  const chunksByDoc = new Map<string, KnowledgeChunkInput[]>();
  const deleted: string[] = [];
  const repo: KnowledgeRepository = {
    async upsertDocument(input) {
      const existing = docs.get(input.sourceRef);
      const id = existing?.id ?? `id-${input.sourceRef}`;
      docs.set(input.sourceRef, { id, sourceRef: input.sourceRef, revision: input.revision });
      return {
        id,
        source: input.source,
        sourceRef: input.sourceRef,
        revision: input.revision,
        title: input.title,
        mimeType: input.mimeType ?? null,
        category: input.category ?? null,
        uri: input.uri ?? null,
        createdAt: new Date(),
        updatedAt: new Date()
      } satisfies KnowledgeDocumentRecord;
    },
    async replaceChunks(documentId, chunks) {
      chunksByDoc.set(documentId, chunks);
    },
    async search(): Promise<KnowledgeSearchHit[]> {
      return [];
    },
    async listDocumentRefs() {
      return [...docs.values()];
    },
    async deleteBySourceRef(_source, sourceRef) {
      deleted.push(sourceRef);
      docs.delete(sourceRef);
    }
  };
  return { repo, chunksByDoc, deleted };
}

const embed = async (texts: string[]) => texts.map(() => Array(1536).fill(0.1));

describe("syncKnowledgeBase", () => {
  test("creates new documents and embeds their chunks", async () => {
    const { repo, chunksByDoc } = fakeRepo();
    const summary = await syncKnowledgeBase(fakeSource([file()]), { repository: repo, embed });
    expect(summary.created).toBe(1);
    expect(summary.updated).toBe(0);
    expect(summary.chunks).toBeGreaterThanOrEqual(1);
    expect(chunksByDoc.get("id-a.md")?.length).toBe(summary.chunks);
  });

  test("skips unchanged files (same revision) without embedding", async () => {
    const { repo } = fakeRepo([{ id: "id-a.md", sourceRef: "a.md", revision: "rev-1" }]);
    let embedCalls = 0;
    const countingEmbed = async (texts: string[]) => {
      embedCalls += 1;
      return embed(texts);
    };
    const summary = await syncKnowledgeBase(fakeSource([file({ revision: "rev-1" })]), {
      repository: repo,
      embed: countingEmbed
    });
    expect(summary.skipped).toBe(1);
    expect(summary.created).toBe(0);
    expect(embedCalls).toBe(0);
  });

  test("updates a file whose revision changed", async () => {
    const { repo } = fakeRepo([{ id: "id-a.md", sourceRef: "a.md", revision: "old" }]);
    const summary = await syncKnowledgeBase(fakeSource([file({ revision: "new" })]), {
      repository: repo,
      embed
    });
    expect(summary.updated).toBe(1);
    expect(summary.created).toBe(0);
  });

  test("removes documents that vanished from the source", async () => {
    const { repo, deleted } = fakeRepo([
      { id: "id-a.md", sourceRef: "a.md", revision: "rev-1" },
      { id: "id-gone.md", sourceRef: "gone.md", revision: "rev-1" }
    ]);
    const summary = await syncKnowledgeBase(fakeSource([file({ revision: "rev-1" })]), {
      repository: repo,
      embed
    });
    expect(summary.removed).toBe(1);
    expect(deleted).toStrictEqual(["gone.md"]);
  });

  test("dry-run writes nothing but reports the plan", async () => {
    const { repo, chunksByDoc } = fakeRepo();
    let embedCalls = 0;
    const summary = await syncKnowledgeBase(fakeSource([file()]), {
      repository: repo,
      embed: async (t) => {
        embedCalls += 1;
        return embed(t);
      },
      dryRun: true
    });
    expect(summary.created).toBe(1);
    expect(embedCalls).toBe(0);
    expect(chunksByDoc.size).toBe(0);
  });
});
