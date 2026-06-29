// Contract test for the pgvector KnowledgeRepository (RAG_PLAN.md §6).
//
// Self-skips unless an AI Postgres URL is provided. The database MUST have the
// `vector` extension available (use the pgvector/pgvector image). Run with:
//   CONTRACT_VECTOR_URL=postgres://virly:virly@localhost:5433/virly \
//     npm run test:contract

const url = process.env.CONTRACT_VECTOR_URL ?? process.env.VIRLY_AI_PG_URL;

const DIM = 1536;
/** A unit vector with `1` at `pos`, zero elsewhere — gives predictable cosine. */
function unit(pos: number): number[] {
  const v = new Array(DIM).fill(0);
  v[pos] = 1;
  return v;
}

(url ? describe : describe.skip)("[pgvector] KnowledgeRepository", () => {
  let knowledgeRepository: typeof import("../../src/repositories/vector/knowledge.repository.js")["knowledgeRepository"];
  let db: Awaited<ReturnType<typeof import("../../src/db/vector.js")["getAiDb"]>>;
  let closeAiPool: typeof import("../../src/db/vector.js")["closeAiPool"];

  const reset = async () => {
    await db.execute("TRUNCATE knowledge_chunks, knowledge_documents CASCADE");
  };

  beforeAll(async () => {
    process.env.VIRLY_AI_PG_URL = url;
    const vector = await import("../../src/db/vector.js");
    const repo = await import("../../src/repositories/vector/knowledge.repository.js");
    knowledgeRepository = repo.knowledgeRepository;
    db = vector.getAiDb();
    closeAiPool = vector.closeAiPool;
    await vector.runAiMigrations();
  });

  afterAll(async () => {
    await closeAiPool();
  });

  it("upsertDocument inserts then updates by (source, sourceRef)", async () => {
    await reset();
    const first = await knowledgeRepository.upsertDocument({
      source: "local",
      sourceRef: "a.md",
      revision: "r1",
      title: "Doc A",
      category: "policy",
      uri: "a.md"
    });
    expect(first.id).toMatch(/^[0-9a-fA-F]{24}$/);

    const second = await knowledgeRepository.upsertDocument({
      source: "local",
      sourceRef: "a.md",
      revision: "r2",
      title: "Doc A v2",
      category: "policy",
      uri: "a.md"
    });
    expect(second.id).toBe(first.id);
    expect(second.revision).toBe("r2");
    expect(second.title).toBe("Doc A v2");
  });

  it("replaceChunks stores chunks and overwrites on re-run", async () => {
    await reset();
    const doc = await knowledgeRepository.upsertDocument({
      source: "local",
      sourceRef: "b.md",
      revision: "r1",
      title: "Doc B"
    });
    await knowledgeRepository.replaceChunks(doc.id, [
      { chunkIndex: 0, content: "first", tokenCount: 1, embedding: unit(0) },
      { chunkIndex: 1, content: "second", tokenCount: 1, embedding: unit(1) }
    ]);
    let hits = await knowledgeRepository.search({ embedding: unit(0), topK: 10 });
    expect(hits.length).toBe(2);

    // Replacing with one chunk drops the others.
    await knowledgeRepository.replaceChunks(doc.id, [
      { chunkIndex: 0, content: "only", tokenCount: 1, embedding: unit(0) }
    ]);
    hits = await knowledgeRepository.search({ embedding: unit(0), topK: 10 });
    expect(hits.length).toBe(1);
    expect(hits[0].content).toBe("only");
  });

  it("search ranks by cosine similarity and returns citation fields", async () => {
    await reset();
    const doc = await knowledgeRepository.upsertDocument({
      source: "local",
      sourceRef: "c.md",
      revision: "r1",
      title: "Doc C",
      category: "loan_package",
      uri: "c.md"
    });
    await knowledgeRepository.replaceChunks(doc.id, [
      { chunkIndex: 0, content: "match", tokenCount: 1, embedding: unit(3) },
      { chunkIndex: 1, content: "other", tokenCount: 1, embedding: unit(7) }
    ]);
    const hits = await knowledgeRepository.search({ embedding: unit(3), topK: 2 });
    expect(hits[0].content).toBe("match");
    expect(hits[0].score).toBeGreaterThan(0.99);
    expect(hits[0].title).toBe("Doc C");
    expect(hits[0].category).toBe("loan_package");
    expect(hits[0].sourceRef).toBe("c.md");
  });

  it("search honours the category filter and minScore", async () => {
    await reset();
    const policy = await knowledgeRepository.upsertDocument({
      source: "local", sourceRef: "p.md", revision: "r1", title: "P", category: "policy"
    });
    const loan = await knowledgeRepository.upsertDocument({
      source: "local", sourceRef: "l.md", revision: "r1", title: "L", category: "loan_package"
    });
    await knowledgeRepository.replaceChunks(policy.id, [
      { chunkIndex: 0, content: "policy chunk", tokenCount: 1, embedding: unit(5) }
    ]);
    await knowledgeRepository.replaceChunks(loan.id, [
      { chunkIndex: 0, content: "loan chunk", tokenCount: 1, embedding: unit(5) }
    ]);
    const onlyLoans = await knowledgeRepository.search({
      embedding: unit(5),
      topK: 10,
      category: "loan_package"
    });
    expect(onlyLoans.length).toBe(1);
    expect(onlyLoans[0].title).toBe("L");

    // An orthogonal query vector scores ~0 and is filtered by minScore.
    const filtered = await knowledgeRepository.search({
      embedding: unit(9),
      topK: 10,
      minScore: 0.5
    });
    expect(filtered.length).toBe(0);
  });

  it("listDocumentRefs + deleteBySourceRef support removal detection", async () => {
    await reset();
    await knowledgeRepository.upsertDocument({
      source: "local", sourceRef: "keep.md", revision: "r1", title: "K"
    });
    const gone = await knowledgeRepository.upsertDocument({
      source: "local", sourceRef: "gone.md", revision: "r1", title: "G"
    });
    await knowledgeRepository.replaceChunks(gone.id, [
      { chunkIndex: 0, content: "x", tokenCount: 1, embedding: unit(0) }
    ]);

    let refs = await knowledgeRepository.listDocumentRefs("local");
    expect(refs.length).toBe(2);

    await knowledgeRepository.deleteBySourceRef("local", "gone.md");
    refs = await knowledgeRepository.listDocumentRefs("local");
    expect(refs.map((r) => r.sourceRef)).toStrictEqual(["keep.md"]);
    // its chunks are gone too
    const hits = await knowledgeRepository.search({ embedding: unit(0), topK: 10 });
    expect(hits.length).toBe(0);
  });
});
