import { AppError } from "../../utils/app-error.js";
import { createVerificationToken } from "../../utils/auth.js";
import { hashToken, verificationTokenExpiry } from "../../utils/token.js";
import { authService } from "../auth.service.js";
import type { Repositories } from "../../repositories/types.js";
import {
  type CleanupFn,
  createUserRecord,
  makeVerificationTokenStub,
  withRepos
} from "./_authServiceKit.js";

const cleanups: CleanupFn[] = [];
afterEach(async () => { for (const c of cleanups.splice(0).reverse()) await c(); });

// ---------------------------------------------------------------------------
// verifyEmail
// ---------------------------------------------------------------------------

test("verifyEmail: valid unexpired matching token flips an unverified account", async () => {
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
    cleanups,
    {
      findById: async () => user,
      markVerified: async (id) => {
        markVerifiedCalls.push(id);
      }
    },
    vtRepo
  );

  const result = await authService.verifyEmail(token);

  expect(result.alreadyVerified).toBe(false);
  expect(result.user.id).toBe(user.id);
  expect(result.user.isVerified).toBe(true);
  expect(markVerifiedCalls.length).toBe(1);
  expect(markVerifiedCalls[0]).toBe(user.id);
  // Verify the store was cleared after success
  expect(deleteForUserCalls.length).toBe(1);
  expect(deleteForUserCalls[0]).toBe(user.id);
});

test("verifyEmail: already-verified account short-circuits without state change", async () => {
  const token = createVerificationToken("507f1f77bcf86cd799439011");
  const user = createUserRecord({
    isVerified: true
  });
  const markVerifiedCalls: string[] = [];
  // Short-circuit happens before the store is read; stub returns null to confirm
  // the store is never consulted for already-verified accounts.
  const vt = makeVerificationTokenStub(null);
  withRepos(
    cleanups,
    {
      findById: async () => user,
      markVerified: async (id) => {
        markVerifiedCalls.push(id);
      }
    },
    vt.repo
  );

  const result = await authService.verifyEmail(token);

  expect(result.alreadyVerified).toBe(true);
  expect(result.user).toBe(user);
  // No state mutation, no persistence call.
  expect(result.user.isVerified).toBe(true);
  expect(markVerifiedCalls.length).toBe(0);
});

test("verifyEmail: expired stored token throws AppError(400)", async () => {
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
    cleanups,
    {
      findById: async () => user,
      markVerified: async (id) => {
        markVerifiedCalls.push(id);
      }
    },
    vt.repo
  );

  const err = await authService.verifyEmail(token).then(() => null, (e) => e);

  expect(err).toBeInstanceOf(AppError);
  expect((err as AppError).status).toBe(400);
  // State untouched on rejection.
  expect(user.isVerified).toBe(false);
  expect(markVerifiedCalls.length).toBe(0);
});

test("verifyEmail: token hash mismatch throws AppError(400)", async () => {
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
    cleanups,
    {
      findById: async () => user,
      markVerified: async (id) => {
        markVerifiedCalls.push(id);
      }
    },
    vt.repo
  );

  const err = await authService.verifyEmail(token).then(() => null, (e) => e);

  expect(err).toBeInstanceOf(AppError);
  expect((err as AppError).status).toBe(400);
  expect(user.isVerified).toBe(false);
  expect(markVerifiedCalls.length).toBe(0);
});

test("verifyEmail: absent token record (null from store) throws AppError(400)", async () => {
  const token = createVerificationToken("507f1f77bcf86cd799439011");
  const user = createUserRecord({ isVerified: false });
  const markVerifiedCalls: string[] = [];
  const vt = makeVerificationTokenStub(null); // no token in the store
  withRepos(
    cleanups,
    {
      findById: async () => user,
      markVerified: async (id) => {
        markVerifiedCalls.push(id);
      }
    },
    vt.repo
  );

  const err = await authService.verifyEmail(token).then(() => null, (e) => e);

  expect(err).toBeInstanceOf(AppError);
  expect((err as AppError).status).toBe(400);
  expect(markVerifiedCalls.length).toBe(0);
});

test("verifyEmail: structurally invalid JWT throws AppError(400)", async () => {
  const vt = makeVerificationTokenStub(null);
  withRepos(cleanups, { findById: async () => null }, vt.repo);

  const err = await authService.verifyEmail("not-a-real-jwt").then(() => null, (e) => e);

  expect(err).toBeInstanceOf(AppError);
  expect((err as AppError).status).toBe(400);
});
