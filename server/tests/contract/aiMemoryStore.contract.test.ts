// Contract test for the hand-rolled Postgres long-term store (RAG_PLAN.md §7).
//
// Self-skips unless an AI Postgres URL is provided. Run with:
//   CONTRACT_VECTOR_URL=postgres://virly:virly@localhost:5433/virly npm run test:contract

const url = process.env.CONTRACT_VECTOR_URL ?? process.env.VIRLY_AI_PG_URL;

(url ? describe : describe.skip)("[postgres] PostgresLongTermStore", () => {
  let store: Awaited<ReturnType<typeof import("../../src/ai/v2/memory/postgresStore.js")["getPostgresLongTermStore"]>>;
  let db: Awaited<ReturnType<typeof import("../../src/db/vector.js")["getAiDb"]>>;
  let closeAiPool: typeof import("../../src/db/vector.js")["closeAiPool"];
  let readLongTermSnapshot: typeof import("../../src/ai/v2/memory/store.js")["readLongTermSnapshot"];
  let upsertCounterparty: typeof import("../../src/ai/v2/memory/store.js")["upsertCounterparty"];
  let upsertPreferences: typeof import("../../src/ai/v2/memory/store.js")["upsertPreferences"];
  let rememberFact: typeof import("../../src/ai/v2/memory/store.js")["rememberFact"];

  const reset = async () => {
    await db.execute("TRUNCATE ai_memory_store");
  };

  beforeAll(async () => {
    process.env.VIRLY_AI_PG_URL = url;
    const vector = await import("../../src/db/vector.js");
    const postgresStore = await import("../../src/ai/v2/memory/postgresStore.js");
    const storeModule = await import("../../src/ai/v2/memory/store.js");
    store = postgresStore.getPostgresLongTermStore();
    await store.setup();
    db = vector.getAiDb();
    closeAiPool = vector.closeAiPool;
    readLongTermSnapshot = storeModule.readLongTermSnapshot;
    upsertCounterparty = storeModule.upsertCounterparty;
    upsertPreferences = storeModule.upsertPreferences;
    rememberFact = storeModule.rememberFact;
  });

  afterAll(async () => {
    await closeAiPool();
  });

  it("put then get round-trips value, key, namespace", async () => {
    await reset();
    await store.put(["virly", "users", "u1"], "preferences", { tone: "formal" });
    const item = await store.get(["virly", "users", "u1"], "preferences");
    expect(item).toBeTruthy();
    expect(item!.value).toStrictEqual({ tone: "formal" });
    expect(item!.key).toBe("preferences");
    expect(item!.namespace).toStrictEqual(["virly", "users", "u1"]);
    expect(item!.createdAt).toBeInstanceOf(Date);
  });

  it("put upserts (no duplicate, updates value)", async () => {
    await reset();
    await store.put(["ns"], "k", { v: 1 });
    await store.put(["ns"], "k", { v: 2 });
    const item = await store.get(["ns"], "k");
    expect(item?.value).toStrictEqual({ v: 2 });
    const all = await store.search(["ns"], { limit: 10 });
    expect(all.length).toBe(1);
  });

  it("put with null deletes; get returns null", async () => {
    await reset();
    await store.put(["ns"], "k", { v: 1 });
    await store.delete(["ns"], "k");
    expect(await store.get(["ns"], "k")).toBeNull();
  });

  it("search returns items under the namespace prefix, honoring limit", async () => {
    await reset();
    await store.put(["virly", "users", "u1"], "a", { n: 1 });
    await store.put(["virly", "users", "u1"], "b", { n: 2 });
    await store.put(["virly", "users", "u2"], "c", { n: 3 });
    const u1 = await store.search(["virly", "users", "u1"], { limit: 10 });
    expect(u1.length).toBe(2);
    // prefix search picks up nested namespaces too
    const all = await store.search(["virly", "users"], { limit: 10 });
    expect(all.length).toBe(3);
    const limited = await store.search(["virly", "users"], { limit: 1 });
    expect(limited.length).toBe(1);
  });

  it("paginated search is stable across pages (no skip/dup on ties)", async () => {
    await reset();
    // Insert in one statement-batch so several rows can share updated_at.
    for (const k of ["a", "b", "c", "d", "e"]) {
      await store.put(["ns"], k, { k });
    }
    const seen: string[] = [];
    for (let offset = 0; offset < 5; offset += 2) {
      const page = await store.search(["ns"], { limit: 2, offset });
      seen.push(...page.map((i) => i.key));
    }
    expect([...seen].sort()).toStrictEqual(["a", "b", "c", "d", "e"]);
    expect(new Set(seen).size).toBe(5);
  });

  it("search filter matches exact + comparison operators", async () => {
    await reset();
    await store.put(["ns"], "a", { status: "active", score: 5 });
    await store.put(["ns"], "b", { status: "inactive", score: 1 });
    const active = await store.search(["ns"], { filter: { status: "active" }, limit: 10 });
    expect(active.length).toBe(1);
    expect(active[0].key).toBe("a");
    const highScore = await store.search(["ns"], { filter: { score: { $gt: 3 } }, limit: 10 });
    expect(highScore.length).toBe(1);
    expect(highScore[0].key).toBe("a");
  });

  it("listNamespaces returns distinct namespaces", async () => {
    await reset();
    await store.put(["virly", "users", "u1"], "a", { n: 1 });
    await store.put(["virly", "users", "u2"], "b", { n: 2 });
    const ns = await store.listNamespaces({ prefix: ["virly", "users"] });
    const asStrings = ns.map((n) => n.join("/")).sort();
    expect(asStrings).toStrictEqual(["virly/users/u1", "virly/users/u2"]);
  });

  it("parity: snapshot helpers round-trip counterparties, prefs, facts", async () => {
    await reset();
    const userId = "user-123";
    await upsertCounterparty(store, userId, {
      email: "Dan@Example.com",
      displayName: "Dan",
      relation: "sent_to",
      lastInteractionAt: new Date().toISOString()
    });
    await upsertPreferences(store, userId, { tone: "casual" } as never);
    await rememberFact(store, userId, { id: "f1", text: "prefers ILS" } as never);

    const snap = await readLongTermSnapshot(store, userId);
    expect(snap.counterparties.length).toBe(1);
    expect(snap.counterparties[0].email).toBe("dan@example.com");
    expect(snap.facts.length).toBe(1);
    expect(snap.preferences).toStrictEqual({ tone: "casual" });

    // relation merge: a received_from interaction flips to "both"
    await upsertCounterparty(store, userId, {
      email: "dan@example.com",
      relation: "received_from"
    } as never);
    const merged = await readLongTermSnapshot(store, userId);
    expect(merged.counterparties[0].relation).toBe("both");
  });
});
