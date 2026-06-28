import bcrypt from "bcryptjs";
import { AppError } from "../../utils/app-error.js";
import { hashToken } from "../../utils/token.js";
import { authService } from "../auth.service.js";
import { getRepositories, setRepositories } from "../../repositories/index.js";
import { createMongoRepositories } from "../../repositories/mongo/index.js";
import type { Repositories } from "../../repositories/types.js";
import {
  type CleanupFn,
  createUserRecord,
  makeVerificationTokenStub,
  patchPersonalDetails,
  captureVerificationLogs
} from "./_authServiceKit.js";

const cleanups: CleanupFn[] = [];
afterEach(async () => { for (const c of cleanups.splice(0).reverse()) await c(); });

// ---------------------------------------------------------------------------
// register
// ---------------------------------------------------------------------------

test("register: new email creates a user, returns a token, and emails a link", async () => {
  let createdInput: Record<string, unknown> | null = null;
  let created: import("../../repositories/types.js").UserRecord | null = null;
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
  cleanups.push(() => { if (previous) setRepositories(previous); });

  patchPersonalDetails(cleanups);
  const links = captureVerificationLogs(cleanups);

  const result = await authService.register({
    email: "New@Example.com",
    password: "supersecret",
    phone: "+972500000001"
  });

  // Email normalized + starting balance 0 + password hashed (not stored raw).
  expect(createdInput).toBeTruthy();
  expect((createdInput as unknown as Record<string, unknown>).email).toBe("new@example.com");
  expect((createdInput as unknown as Record<string, unknown>).balance).toBe(0);
  expect((createdInput as unknown as Record<string, unknown>).passwordHash).not.toBe("supersecret");
  expect(
    await bcrypt.compare(
      "supersecret",
      String((createdInput as unknown as Record<string, unknown>).passwordHash)
    )
  ).toBeTruthy();

  // Returns the created user + a verification token, and the token is persisted
  // in the verification_tokens store as a HASH (never in cleartext).
  expect(result.user).toBe(created);
  expect(result.verificationToken.length).toBeGreaterThan(0);
  expect(upsertForUserCalls.length).toBe(1);
  expect(upsertForUserCalls[0]?.tokenHash).toBe(hashToken(result.verificationToken));

  // A verification email was triggered.
  expect(links.length).toBe(1);
});

test("register: duplicate email throws AppError(409)", async () => {
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
  cleanups.push(() => { if (previous2) setRepositories(previous2); });

  const links = captureVerificationLogs(cleanups);

  const err = await authService.register({
    email: "Taken@Example.com",
    password: "supersecret",
    phone: "+972500000001"
  }).then(() => null, (e) => e);

  expect(err).toBeInstanceOf(AppError);
  expect((err as AppError).status).toBe(409);

  // No email and no token persisted for an already-registered address.
  expect(links.length).toBe(0);
  expect(upsertForUserCalls.length).toBe(0);
});
