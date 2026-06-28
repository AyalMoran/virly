// Shared helpers for auth.service split test files.
// This file is NOT a test suite (no *.test.ts suffix), so Jest ignores it as
// an executable suite while the split files import from it.

import { config } from "../../config.js";
import { getRepositories, setRepositories } from "../../repositories/index.js";
import { createMongoRepositories } from "../../repositories/mongo/index.js";
import type { Repositories, UserRecord } from "../../repositories/types.js";

// ---------------------------------------------------------------------------
// Cleanup-stack helper (replaces node:test's t.after)
// ---------------------------------------------------------------------------

/**
 * Call this at the top of each describe/test block that needs cleanup.
 * Returns the cleanups array; register teardowns with cleanups.push(fn).
 * Wire up via:
 *   const cleanups: CleanupFn[] = [];
 *   afterEach(async () => { for (const c of cleanups.splice(0).reverse()) await c(); });
 */
export type CleanupFn = () => void | Promise<void>;

// ---------------------------------------------------------------------------
// Record factories
// ---------------------------------------------------------------------------

export function createUserRecord(overrides: Partial<UserRecord> = {}): UserRecord {
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

// ---------------------------------------------------------------------------
// Repository stub helpers
// ---------------------------------------------------------------------------

export function withUsers(stub: Partial<Repositories["users"]>) {
  const base = createMongoRepositories();
  setRepositories({ ...base, users: { ...base.users, ...stub } as Repositories["users"] });
}

/** Minimal in-memory VerificationTokenRepository stub. */
export function makeVerificationTokenStub(
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
 * Stub both users AND verificationTokens and register cleanup via cleanups array.
 */
export function withRepos(
  cleanups: CleanupFn[],
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
  cleanups.push(() => {
    if (previous) setRepositories(previous);
  });
}

/**
 * Patches personalDetails repository and registers cleanup.
 */
export function patchPersonalDetails(cleanups: CleanupFn[]) {
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
  cleanups.push(() => setRepositories(current));
}

/**
 * Forces the console.log fallback path for sendVerificationEmail and collects
 * the logged links. Registers cleanup via cleanups array.
 */
export function captureVerificationLogs(cleanups: CleanupFn[]): string[] {
  const originalKey = config.email.resendApiKey;
  config.email.resendApiKey = undefined;
  cleanups.push(() => {
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
  cleanups.push(() => {
    console.log = originalLog;
  });
  return links;
}
