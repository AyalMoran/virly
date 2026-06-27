// Contract test for the hand-rolled Postgres long-term store (RAG_PLAN.md §7).
//
// Self-skips unless an AI Postgres URL is provided. Run with:
//   CONTRACT_VECTOR_URL=postgres://virly:virly@localhost:5433/virly npm run test:contract
import assert from "node:assert/strict";
import test from "node:test";

const url = process.env.CONTRACT_VECTOR_URL ?? process.env.VIRLY_AI_PG_URL;

test(
  "[postgres] PostgresLongTermStore",
  { skip: url ? false : "set CONTRACT_VECTOR_URL (or VIRLY_AI_PG_URL) to run" },
  async (t) => {
    process.env.VIRLY_AI_PG_URL = url;
    const { getAiDb, closeAiPool } = await import("../../src/db/vector.js");
    const { getPostgresLongTermStore } = await import(
      "../../src/ai/v2/memory/postgresStore.js"
    );
    const {
      readLongTermSnapshot,
      upsertCounterparty,
      upsertPreferences,
      rememberFact,
      userNamespace
    } = await import("../../src/ai/v2/memory/store.js");

    const store = getPostgresLongTermStore();
    await store.setup();
    const db = getAiDb();
    const reset = async () => {
      await db.execute("TRUNCATE ai_memory_store");
    };

    try {
      await t.test("put then get round-trips value, key, namespace", async () => {
        await reset();
        await store.put(["virly", "users", "u1"], "preferences", { tone: "formal" });
        const item = await store.get(["virly", "users", "u1"], "preferences");
        assert.ok(item);
        assert.deepEqual(item.value, { tone: "formal" });
        assert.equal(item.key, "preferences");
        assert.deepEqual(item.namespace, ["virly", "users", "u1"]);
        assert.ok(item.createdAt instanceof Date);
      });

      await t.test("put upserts (no duplicate, updates value)", async () => {
        await reset();
        await store.put(["ns"], "k", { v: 1 });
        await store.put(["ns"], "k", { v: 2 });
        const item = await store.get(["ns"], "k");
        assert.deepEqual(item?.value, { v: 2 });
        const all = await store.search(["ns"], { limit: 10 });
        assert.equal(all.length, 1);
      });

      await t.test("put with null deletes; get returns null", async () => {
        await reset();
        await store.put(["ns"], "k", { v: 1 });
        await store.delete(["ns"], "k");
        assert.equal(await store.get(["ns"], "k"), null);
      });

      await t.test("search returns items under the namespace prefix, honoring limit", async () => {
        await reset();
        await store.put(["virly", "users", "u1"], "a", { n: 1 });
        await store.put(["virly", "users", "u1"], "b", { n: 2 });
        await store.put(["virly", "users", "u2"], "c", { n: 3 });
        const u1 = await store.search(["virly", "users", "u1"], { limit: 10 });
        assert.equal(u1.length, 2);
        // prefix search picks up nested namespaces too
        const all = await store.search(["virly", "users"], { limit: 10 });
        assert.equal(all.length, 3);
        const limited = await store.search(["virly", "users"], { limit: 1 });
        assert.equal(limited.length, 1);
      });

      await t.test("search filter matches exact + comparison operators", async () => {
        await reset();
        await store.put(["ns"], "a", { status: "active", score: 5 });
        await store.put(["ns"], "b", { status: "inactive", score: 1 });
        const active = await store.search(["ns"], { filter: { status: "active" }, limit: 10 });
        assert.equal(active.length, 1);
        assert.equal(active[0].key, "a");
        const highScore = await store.search(["ns"], { filter: { score: { $gt: 3 } }, limit: 10 });
        assert.equal(highScore.length, 1);
        assert.equal(highScore[0].key, "a");
      });

      await t.test("listNamespaces returns distinct namespaces", async () => {
        await reset();
        await store.put(["virly", "users", "u1"], "a", { n: 1 });
        await store.put(["virly", "users", "u2"], "b", { n: 2 });
        const ns = await store.listNamespaces({ prefix: ["virly", "users"] });
        const asStrings = ns.map((n) => n.join("/")).sort();
        assert.deepEqual(asStrings, ["virly/users/u1", "virly/users/u2"]);
      });

      await t.test("parity: snapshot helpers round-trip counterparties, prefs, facts", async () => {
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
        assert.equal(snap.counterparties.length, 1);
        assert.equal(snap.counterparties[0].email, "dan@example.com");
        assert.equal(snap.facts.length, 1);
        assert.deepEqual(snap.preferences, { tone: "casual" });

        // relation merge: a received_from interaction flips to "both"
        await upsertCounterparty(store, userId, {
          email: "dan@example.com",
          relation: "received_from"
        } as never);
        const merged = await readLongTermSnapshot(store, userId);
        assert.equal(merged.counterparties[0].relation, "both");
      });
    } finally {
      await closeAiPool();
    }
  }
);
