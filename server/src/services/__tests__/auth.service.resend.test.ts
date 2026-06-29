import { authService } from "../auth.service.js";
import type { Repositories } from "../../repositories/types.js";
import {
  type CleanupFn,
  createUserRecord,
  makeVerificationTokenStub,
  withRepos,
  captureVerificationLogs
} from "./_authServiceKit.js";

const cleanups: CleanupFn[] = [];
afterEach(async () => { for (const c of cleanups.splice(0).reverse()) await c(); });

// ---------------------------------------------------------------------------
// resendVerification (enumeration-safe)
// ---------------------------------------------------------------------------

test("resendVerification: unverified existing user re-sends a link", async () => {
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
    cleanups,
    { findByEmail: async (e) => (e.trim().toLowerCase() === "alice@example.com" ? user : null) },
    vtStub
  );
  const links = captureVerificationLogs(cleanups);

  await authService.resendVerification("Alice@Example.com");

  expect(links.length).toBe(1);
  // A fresh token hash was persisted in the verification_tokens store.
  expect(upsertForUserCalls.length).toBe(1);
  expect(upsertForUserCalls[0]?.tokenHash).toBeTruthy();
});

test("resendVerification: already-verified user sends nothing and does not throw", async () => {
  const user = createUserRecord({ email: "alice@example.com", isVerified: true });
  const upsertForUserCalls: number[] = [];
  const vtStub: Repositories["verificationTokens"] = {
    ...makeVerificationTokenStub(null).repo,
    upsertForUser: async () => {
      upsertForUserCalls.push(1);
      return { id: "x", userId: "x", tokenHash: "x", expiresAt: new Date(), createdAt: new Date(), updatedAt: new Date() };
    }
  };
  withRepos(cleanups, { findByEmail: async () => user }, vtStub);
  const links = captureVerificationLogs(cleanups);

  await authService.resendVerification("alice@example.com");

  expect(links.length).toBe(0);
  expect(upsertForUserCalls.length).toBe(0);
});

test("resendVerification: absent user sends nothing and does not throw", async () => {
  const upsertForUserCalls: number[] = [];
  const vtStub: Repositories["verificationTokens"] = {
    ...makeVerificationTokenStub(null).repo,
    upsertForUser: async () => {
      upsertForUserCalls.push(1);
      return { id: "x", userId: "x", tokenHash: "x", expiresAt: new Date(), createdAt: new Date(), updatedAt: new Date() };
    }
  };
  withRepos(cleanups, { findByEmail: async () => null }, vtStub);
  const links = captureVerificationLogs(cleanups);

  await authService.resendVerification("ghost@example.com");

  expect(links.length).toBe(0);
  expect(upsertForUserCalls.length).toBe(0);
});
