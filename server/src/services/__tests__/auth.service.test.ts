

import assert from "node:assert/strict";
import test from "node:test";
import bcrypt from "bcryptjs";
import { AppError } from "../../utils/app-error.js";
import { createVerificationToken } from "../../utils/auth.js";
import { hashToken, verificationTokenExpiry } from "../../utils/token.js";
import { config } from "../../config.js";
import { authService } from "../auth.service.js";
import { getRepositories, setRepositories } from "../../repositories/index.js";
import { createMongoRepositories } from "../../repositories/mongo/index.js";
import type { Repositories, UserRecord } from "../../repositories/types.js";

// ---------------------------------------------------------------------------
// Repository-backed mocks
//
// These tests exercise authService against a stubbed UserRepository (no live
// MongoDB), mirroring account.service.test.ts. The service now persists via
// getRepositories().users.* instead of Mongoose statics / user.save(), so the
// stubs capture the calls the service makes.
// ---------------------------------------------------------------------------

function createUserRecord(overrides: Partial<UserRecord> = {}): UserRecord {
  return {
    id: "507f1f77bcf86cd799439011",
    email: "alice@example.com",
    passwordHash: "placeholder-hash",
    phone: "+972500000000",
    isVerified: true,
    balance: 500,
    role: "user",
    personalDetails: "507f191e810c19729de860ea",
    createdAt: new Date("2026-01-15T10:00:00.000Z"),
    updatedAt: new Date("2026-01-15T10:00:00.000Z"),
    ...overrides
  };
}

function withUsers(stub: Partial<Repositories["users"]>) {
  const base = createMongoRepositories();
  setRepositories({ ...base, users: { ...base.users, ...stub } as Repositories["users"] });
}

/** Minimal in-memory VerificationTokenRepository stub. */
function makeVerificationTokenStub(
  initial: import("../../repositories/types.js").VerificationTokenRecord | null
) {
  let record = initial;
  return {
    record: () => record,
    repo: {
      upsertForUser: async (userId: string, tokenHash: string, expiresAt: Date) => {
        record = {
          id: "vtok-stub",
          userId,
          tokenHash,
          expiresAt,
          createdAt: new Date(),
          updatedAt: new Date()
        };
        return record;
      },
      findByUserId: async (_userId: string) => record,
      deleteForUser: async (_userId: string) => {
        record = null;
      },
      deleteExpired: async (_now: Date) => 0
    } satisfies Repositories["verificationTokens"]
  };
}

/**
 * Stub both users AND verificationTokens. Restores the previous registry in
 * t.after so the stub never leaks to later tests. Safe to call even if the
 * registry has not been initialised yet (withUsers may have been called first
 * or this may be the first setup step in the test).
 */
function withRepos(
  t: test.TestContext,
  userStub: Partial<Repositories["users"]>,
  vtStub: Repositories["verificationTokens"]
) {
  let previous: Repositories | null = null;
  try { previous = getRepositories(); } catch { /* not yet initialised */ }
  const base = createMongoRepositories();
  setRepositories({
    ...base,
    users: { ...base.users, ...userStub } as Repositories["users"],
    verificationTokens: vtStub
  });
  t.after(() => {
    if (previous) setRepositories(previous);
  });
}

// personalDetailsService.ensureForUser now reaches PersonalDetails through the
// repository seam (getRepositories().personalDetails.ensureForUser), so we stub
// the repository instead of the Mongoose model. Returning a record avoids a real
// MongoDB round-trip so register stays focused on auth behavior.
function patchPersonalDetails(t: test.TestContext) {
  const current = getRepositories();
  setRepositories({
    ...current,
    personalDetails: {
      ...current.personalDetails,
      ensureForUser: async (userId: string) => ({
        id: "507f191e810c19729de860ea",
        userId,
        status: "not_provided",
        firstName: null,
        lastName: null,
        dateOfBirth: null,
        address: {},
        lastSkippedAt: null,
        createdAt: new Date(0),
        updatedAt: new Date(0)
      })
    } as Repositories["personalDetails"]
  });
  t.after(() => setRepositories(current));
}

// Observe WHETHER a verification email was triggered (the enumeration-safety
// guarantee) without real network calls or monkey-patching read-only ESM
// bindings. sendVerificationEmail logs "Verification link for ..." via
// console.log ONLY when no Resend sender is configured, so we force that
// fallback path by blanking config.email.resendApiKey for the test, then
// capture the log. config is a mutable exported object, restored in t.after.
function captureVerificationLogs(t: test.TestContext) {
  const originalKey = config.email.resendApiKey;
  config.email.resendApiKey = undefined;
  t.after(() => {
    config.email.resendApiKey = originalKey;
  });

  const links: string[] = [];
  const originalLog = console.log;
  console.log = (...args: unknown[]) => {
    const first = args[0];
    if (typeof first === "string" && first.startsWith("Verification link for")) {
      links.push(first);
    }
  };
  t.after(() => {
    console.log = originalLog;
  });
  return links;
}

// ---------------------------------------------------------------------------
// register
// ---------------------------------------------------------------------------

test("register: new email creates a user, returns a token, and emails a link", async (t) => {
  let createdInput: Record<string, unknown> | null = null;
  let created: UserRecord | null = null;
  const upsertForUserCalls: Array<{ userId: string; tokenHash: string }> = [];

  const vtStub: Repositories["verificationTokens"] = {
    ...makeVerificationTokenStub(null).repo,
    upsertForUser: async (userId, tokenHash, expiresAt) => {
      upsertForUserCalls.push({ userId, tokenHash });
      return {
        id: "vtok-reg",
        userId,
        tokenHash,
        expiresAt,
        createdAt: new Date(),
        updatedAt: new Date()
      };
    }
  };

  let previous: Repositories | null = null;
  try { previous = getRepositories(); } catch { /* not yet initialised */ }
  const base = createMongoRepositories();
  setRepositories({
    ...base,
    users: {
      ...base.users,
      findByEmail: async () => null, // no existing user
      create: async (input) => {
        createdInput = input;
        created = createUserRecord({
          email: input.email,
          passwordHash: input.passwordHash,
          phone: input.phone,
          balance: input.balance,
          isVerified: false,
          personalDetails: null
        });
        return created!;
      },
      setPersonalDetails: async () => {}
    } as Repositories["users"],
    verificationTokens: vtStub
  });
  t.after(() => { if (previous) setRepositories(previous); });

  patchPersonalDetails(t);
  const links = captureVerificationLogs(t);

  const result = await authService.register({
    email: "New@Example.com",
    password: "supersecret",
    phone: "+972500000001"
  });

  // Email normalized + starting balance 0 + password hashed (not stored raw).
  assert.ok(createdInput);
  assert.equal((createdInput as Record<string, unknown>).email, "new@example.com");
  assert.equal((createdInput as Record<string, unknown>).balance, 0);
  assert.notEqual((createdInput as Record<string, unknown>).passwordHash, "supersecret");
  assert.ok(
    await bcrypt.compare(
      "supersecret",
      String((createdInput as Record<string, unknown>).passwordHash)
    ),
    "stored hash must verify against the raw password"
  );

  // Returns the created user + a verification token, and the token is persisted
  // in the verification_tokens store as a HASH (never in cleartext).
  assert.equal(result.user, created);
  assert.ok(result.verificationToken.length > 0);
  assert.equal(upsertForUserCalls.length, 1);
  assert.equal(upsertForUserCalls[0]?.tokenHash, hashToken(result.verificationToken));

  // A verification email was triggered.
  assert.equal(links.length, 1);
});

test("register: duplicate email throws AppError(409)", async (t) => {
  const upsertForUserCalls: number[] = [];
  const vtStub: Repositories["verificationTokens"] = {
    ...makeVerificationTokenStub(null).repo,
    upsertForUser: async () => {
      upsertForUserCalls.push(1);
      return { id: "x", userId: "x", tokenHash: "x", expiresAt: new Date(), createdAt: new Date(), updatedAt: new Date() };
    }
  };

  let previous2: Repositories | null = null;
  try { previous2 = getRepositories(); } catch { /* not yet initialised */ }
  const base2 = createMongoRepositories();
  setRepositories({
    ...base2,
    users: {
      ...base2.users,
      findByEmail: async () => createUserRecord({ email: "taken@example.com" })
    } as Repositories["users"],
    verificationTokens: vtStub
  });
  t.after(() => { if (previous2) setRepositories(previous2); });

  const links = captureVerificationLogs(t);

  await assert.rejects(
    () =>
      authService.register({
        email: "Taken@Example.com",
        password: "supersecret",
        phone: "+972500000001"
      }),
    (err: unknown) => {
      assert.ok(err instanceof AppError);
      assert.equal((err as AppError).status, 409);
      return true;
    }
  );

  // No email and no token persisted for an already-registered address.
  assert.equal(links.length, 0);
  assert.equal(upsertForUserCalls.length, 0);
});

// ---------------------------------------------------------------------------
// login
// ---------------------------------------------------------------------------

test("login: correct password on a verified account returns the user", async (t) => {
  const passwordHash = await bcrypt.hash("correct horse", 10);
  const user = createUserRecord({ email: "alice@example.com", passwordHash, isVerified: true });
  withUsers({ findByEmail: async (e) => (e.trim().toLowerCase() === "alice@example.com" ? user : null) });

  const result = await authService.login({
    email: "Alice@Example.com",
    password: "correct horse"
  });

  assert.equal(result, user);
});

test("login: correct password on an UNVERIFIED account throws AppError(403)", async () => {
  const passwordHash = await bcrypt.hash("correct horse", 10);
  const user = createUserRecord({ passwordHash, isVerified: false });
  withUsers({ findByEmail: async () => user });

  await assert.rejects(
    () => authService.login({ email: "alice@example.com", password: "correct horse" }),
    (err: unknown) => {
      assert.ok(err instanceof AppError);
      assert.equal((err as AppError).status, 403);
      return true;
    }
  );
});

test("login: wrong password throws AppError(401) with the generic message", async () => {
  const passwordHash = await bcrypt.hash("correct horse", 10);
  const user = createUserRecord({ passwordHash, isVerified: true });
  withUsers({ findByEmail: async () => user });

  await assert.rejects(
    () => authService.login({ email: "alice@example.com", password: "wrong" }),
    (err: unknown) => {
      assert.ok(err instanceof AppError);
      assert.equal((err as AppError).status, 401);
      assert.equal((err as AppError).message, "Invalid email or password.");
      return true;
    }
  );
});

test("login: unknown email throws AppError(401) with the SAME message (no enumeration)", async () => {
  withUsers({ findByEmail: async () => null }); // no such user

  await assert.rejects(
    () => authService.login({ email: "ghost@example.com", password: "whatever" }),
    (err: unknown) => {
      assert.ok(err instanceof AppError);
      assert.equal((err as AppError).status, 401);
      assert.equal((err as AppError).message, "Invalid email or password.");
      return true;
    }
  );
});

// ---------------------------------------------------------------------------
// verifyEmail
// ---------------------------------------------------------------------------

test("verifyEmail: valid unexpired matching token flips an unverified account", async (t) => {
  const token = createVerificationToken("507f1f77bcf86cd799439011");
  const user = createUserRecord({
    isVerified: false
  });
  const markVerifiedCalls: string[] = [];
  const deleteForUserCalls: string[] = [];
  const vt = makeVerificationTokenStub({
    id: "vtok-1",
    userId: user.id,
    tokenHash: hashToken(token),
    expiresAt: verificationTokenExpiry(),
    createdAt: new Date(),
    updatedAt: new Date()
  });
  // Wrap deleteForUser to record calls
  const vtRepo: Repositories["verificationTokens"] = {
    ...vt.repo,
    deleteForUser: async (id: string) => {
      deleteForUserCalls.push(id);
      await vt.repo.deleteForUser(id);
    }
  };
  withRepos(
    t,
    {
      findById: async () => user,
      markVerified: async (id) => {
        markVerifiedCalls.push(id);
      }
    },
    vtRepo
  );

  const result = await authService.verifyEmail(token);

  assert.equal(result.alreadyVerified, false);
  assert.equal(result.user.id, user.id);
  assert.equal(result.user.isVerified, true);
  assert.equal(markVerifiedCalls.length, 1);
  assert.equal(markVerifiedCalls[0], user.id);
  // Verify the store was cleared after success
  assert.equal(deleteForUserCalls.length, 1);
  assert.equal(deleteForUserCalls[0], user.id);
});

test("verifyEmail: already-verified account short-circuits without state change", async (t) => {
  const token = createVerificationToken("507f1f77bcf86cd799439011");
  const user = createUserRecord({
    isVerified: true
  });
  const markVerifiedCalls: string[] = [];
  // Short-circuit happens before the store is read; stub returns null to confirm
  // the store is never consulted for already-verified accounts.
  const vt = makeVerificationTokenStub(null);
  withRepos(
    t,
    {
      findById: async () => user,
      markVerified: async (id) => {
        markVerifiedCalls.push(id);
      }
    },
    vt.repo
  );

  const result = await authService.verifyEmail(token);

  assert.equal(result.alreadyVerified, true);
  assert.equal(result.user, user);
  // No state mutation, no persistence call.
  assert.equal(result.user.isVerified, true);
  assert.equal(markVerifiedCalls.length, 0);
});

test("verifyEmail: expired stored token throws AppError(400)", async (t) => {
  const token = createVerificationToken("507f1f77bcf86cd799439011");
  const user = createUserRecord({
    isVerified: false
  });
  const markVerifiedCalls: string[] = [];
  const vt = makeVerificationTokenStub({
    id: "vtok-2",
    userId: user.id,
    tokenHash: hashToken(token),
    expiresAt: new Date(Date.now() - 1000), // already expired
    createdAt: new Date(),
    updatedAt: new Date()
  });
  withRepos(
    t,
    {
      findById: async () => user,
      markVerified: async (id) => {
        markVerifiedCalls.push(id);
      }
    },
    vt.repo
  );

  await assert.rejects(
    () => authService.verifyEmail(token),
    (err: unknown) => {
      assert.ok(err instanceof AppError);
      assert.equal((err as AppError).status, 400);
      return true;
    }
  );
  // State untouched on rejection.
  assert.equal(user.isVerified, false);
  assert.equal(markVerifiedCalls.length, 0);
});

test("verifyEmail: token hash mismatch throws AppError(400)", async (t) => {
  const token = createVerificationToken("507f1f77bcf86cd799439011");
  const user = createUserRecord({
    isVerified: false
  });
  const markVerifiedCalls: string[] = [];
  const vt = makeVerificationTokenStub({
    id: "vtok-3",
    userId: user.id,
    tokenHash: hashToken("a-different-token"), // mismatched hash
    expiresAt: verificationTokenExpiry(),
    createdAt: new Date(),
    updatedAt: new Date()
  });
  withRepos(
    t,
    {
      findById: async () => user,
      markVerified: async (id) => {
        markVerifiedCalls.push(id);
      }
    },
    vt.repo
  );

  await assert.rejects(
    () => authService.verifyEmail(token),
    (err: unknown) => {
      assert.ok(err instanceof AppError);
      assert.equal((err as AppError).status, 400);
      return true;
    }
  );
  assert.equal(user.isVerified, false);
  assert.equal(markVerifiedCalls.length, 0);
});

test("verifyEmail: absent token record (null from store) throws AppError(400)", async (t) => {
  const token = createVerificationToken("507f1f77bcf86cd799439011");
  const user = createUserRecord({ isVerified: false });
  const markVerifiedCalls: string[] = [];
  const vt = makeVerificationTokenStub(null); // no token in the store
  withRepos(
    t,
    {
      findById: async () => user,
      markVerified: async (id) => {
        markVerifiedCalls.push(id);
      }
    },
    vt.repo
  );

  await assert.rejects(
    () => authService.verifyEmail(token),
    (err: unknown) => {
      assert.ok(err instanceof AppError);
      assert.equal((err as AppError).status, 400);
      return true;
    }
  );
  assert.equal(markVerifiedCalls.length, 0);
});

test("verifyEmail: structurally invalid JWT throws AppError(400)", async (t) => {
  const vt = makeVerificationTokenStub(null);
  withRepos(t, { findById: async () => null }, vt.repo);

  await assert.rejects(
    () => authService.verifyEmail("not-a-real-jwt"),
    (err: unknown) => {
      assert.ok(err instanceof AppError);
      assert.equal((err as AppError).status, 400);
      return true;
    }
  );
});

// ---------------------------------------------------------------------------
// resendVerification (enumeration-safe)
// ---------------------------------------------------------------------------

test("resendVerification: unverified existing user re-sends a link", async (t) => {
  const user = createUserRecord({ email: "alice@example.com", isVerified: false });
  const upsertForUserCalls: Array<{ userId: string; tokenHash: string }> = [];
  const vtStub: Repositories["verificationTokens"] = {
    ...makeVerificationTokenStub(null).repo,
    upsertForUser: async (userId, tokenHash, expiresAt) => {
      upsertForUserCalls.push({ userId, tokenHash });
      return { id: "vtok-r", userId, tokenHash, expiresAt, createdAt: new Date(), updatedAt: new Date() };
    }
  };
  withRepos(
    t,
    { findByEmail: async (e) => (e.trim().toLowerCase() === "alice@example.com" ? user : null) },
    vtStub
  );
  const links = captureVerificationLogs(t);

  await authService.resendVerification("Alice@Example.com");

  assert.equal(links.length, 1);
  // A fresh token hash was persisted in the verification_tokens store.
  assert.equal(upsertForUserCalls.length, 1);
  assert.ok(upsertForUserCalls[0]?.tokenHash);
});

test("resendVerification: already-verified user sends nothing and does not throw", async (t) => {
  const user = createUserRecord({ email: "alice@example.com", isVerified: true });
  const upsertForUserCalls: number[] = [];
  const vtStub: Repositories["verificationTokens"] = {
    ...makeVerificationTokenStub(null).repo,
    upsertForUser: async () => {
      upsertForUserCalls.push(1);
      return { id: "x", userId: "x", tokenHash: "x", expiresAt: new Date(), createdAt: new Date(), updatedAt: new Date() };
    }
  };
  withRepos(t, { findByEmail: async () => user }, vtStub);
  const links = captureVerificationLogs(t);

  await authService.resendVerification("alice@example.com");

  assert.equal(links.length, 0);
  assert.equal(upsertForUserCalls.length, 0);
});

test("resendVerification: absent user sends nothing and does not throw", async (t) => {
  const upsertForUserCalls: number[] = [];
  const vtStub: Repositories["verificationTokens"] = {
    ...makeVerificationTokenStub(null).repo,
    upsertForUser: async () => {
      upsertForUserCalls.push(1);
      return { id: "x", userId: "x", tokenHash: "x", expiresAt: new Date(), createdAt: new Date(), updatedAt: new Date() };
    }
  };
  withRepos(t, { findByEmail: async () => null }, vtStub);
  const links = captureVerificationLogs(t);

  await authService.resendVerification("ghost@example.com");

  assert.equal(links.length, 0);
  assert.equal(upsertForUserCalls.length, 0);
});
