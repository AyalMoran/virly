
import {
  createInMemoryLongTermStore,
  readLongTermSnapshot,
  rememberFact,
  upsertCounterparty,
  upsertPreferences,
  userNamespace
} from "../store.js";

describe("v2 long-term Store (in-memory adapter)", () => {
  test("upsert + read round-trips counterparties, preferences, and facts", async () => {
    const store = createInMemoryLongTermStore();
    const userId = "user-1";

    await upsertCounterparty(store, userId, {
      email: "Rani@Example.com",
      displayName: "Rani Cohen",
      relation: "sent_to",
      lastInteractionAt: "2026-06-10T09:00:00.000Z"
    });
    await upsertPreferences(store, userId, { preferredLanguage: "he" });
    await rememberFact(store, userId, {
      id: "rent",
      text: "rent is on the 1st",
      createdAt: "2026-06-01T00:00:00.000Z"
    });

    const snapshot = await readLongTermSnapshot(store, userId);

    expect(snapshot.counterparties.length).toBe(1);
    // email is normalised to lower-case on write
    expect(snapshot.counterparties[0]?.email).toBe("rani@example.com");
    expect(snapshot.counterparties[0]?.displayName).toBe("Rani Cohen");
    expect(snapshot.preferences.preferredLanguage).toBe("he");
    expect(snapshot.facts.length).toBe(1);
    expect(snapshot.facts[0]?.text).toBe("rent is on the 1st");
  });

  test("relation widens to 'both' when the counterparty is seen in both directions", async () => {
    const store = createInMemoryLongTermStore();
    const userId = "user-2";

    await upsertCounterparty(store, userId, {
      email: "dan@example.com",
      relation: "sent_to"
    });
    await upsertCounterparty(store, userId, {
      email: "dan@example.com",
      relation: "received_from"
    });

    const snapshot = await readLongTermSnapshot(store, userId);
    expect(snapshot.counterparties.length).toBe(1);
    expect(snapshot.counterparties[0]?.relation).toBe("both");
  });

  test("preferences merge rather than replace", async () => {
    const store = createInMemoryLongTermStore();
    const userId = "user-3";

    await upsertPreferences(store, userId, { preferredLanguage: "en" });
    await upsertPreferences(store, userId, { confirmAboveAmount: 500 });

    const snapshot = await readLongTermSnapshot(store, userId);
    expect(snapshot.preferences.preferredLanguage).toBe("en");
    expect(snapshot.preferences.confirmAboveAmount).toBe(500);
  });

  test("namespaces isolate users from each other", async () => {
    const store = createInMemoryLongTermStore();

    await upsertCounterparty(store, "alice", {
      email: "x@example.com",
      relation: "sent_to"
    });

    const aliceNs = userNamespace("alice");
    const bobNs = userNamespace("bob");
    expect(aliceNs).not.toStrictEqual(bobNs);

    const bobSnapshot = await readLongTermSnapshot(store, "bob");
    expect(bobSnapshot.counterparties.length).toBe(0);

    const aliceSnapshot = await readLongTermSnapshot(store, "alice");
    expect(aliceSnapshot.counterparties.length).toBe(1);
  });
});
