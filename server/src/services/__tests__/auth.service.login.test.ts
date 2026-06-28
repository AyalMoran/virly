import bcrypt from "bcryptjs";
import { AppError } from "../../utils/app-error.js";
import { authService } from "../auth.service.js";
import {
  type CleanupFn,
  createUserRecord,
  withUsers
} from "./_authServiceKit.js";

const cleanups: CleanupFn[] = [];
afterEach(async () => { for (const c of cleanups.splice(0).reverse()) await c(); });

// ---------------------------------------------------------------------------
// login
// ---------------------------------------------------------------------------

test("login: correct password on a verified account returns the user", async () => {
  const passwordHash = await bcrypt.hash("correct horse", 10);
  const user = createUserRecord({ email: "alice@example.com", passwordHash, isVerified: true });
  withUsers({ findByEmail: async (e) => (e.trim().toLowerCase() === "alice@example.com" ? user : null) });

  const result = await authService.login({
    email: "Alice@Example.com",
    password: "correct horse"
  });

  expect(result).toBe(user);
});

test("login: correct password on an UNVERIFIED account throws AppError(403)", async () => {
  const passwordHash = await bcrypt.hash("correct horse", 10);
  const user = createUserRecord({ passwordHash, isVerified: false });
  withUsers({ findByEmail: async () => user });

  const err = await authService.login({ email: "alice@example.com", password: "correct horse" })
    .then(() => null, (e) => e);

  expect(err).toBeInstanceOf(AppError);
  expect((err as AppError).status).toBe(403);
});

test("login: wrong password throws AppError(401) with the generic message", async () => {
  const passwordHash = await bcrypt.hash("correct horse", 10);
  const user = createUserRecord({ passwordHash, isVerified: true });
  withUsers({ findByEmail: async () => user });

  const err = await authService.login({ email: "alice@example.com", password: "wrong" })
    .then(() => null, (e) => e);

  expect(err).toBeInstanceOf(AppError);
  expect((err as AppError).status).toBe(401);
  expect((err as AppError).message).toBe("Invalid email or password.");
});

test("login: unknown email throws AppError(401) with the SAME message (no enumeration)", async () => {
  withUsers({ findByEmail: async () => null }); // no such user

  const err = await authService.login({ email: "ghost@example.com", password: "whatever" })
    .then(() => null, (e) => e);

  expect(err).toBeInstanceOf(AppError);
  expect((err as AppError).status).toBe(401);
  expect((err as AppError).message).toBe("Invalid email or password.");
});
