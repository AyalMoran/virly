import { ZodError } from "zod";
import { z } from "zod";
import { errorHandler } from "../error-handler.js";
import { AppError } from "../../utils/app-error.js";
import { makeNext, makeReq, makeRes } from "./_httpStubs.js";

function run(error: unknown) {
  const { res, captured } = makeRes();
  const { next } = makeNext();
  errorHandler(error, makeReq(), res, next);
  return captured;
}

test("renders a ZodError as a 400 with field issues", () => {
  let zodError: ZodError;
  try {
    z.object({ email: z.string().email() }).parse({ email: "bad" });
    throw new Error("expected zod to throw");
  } catch (e) {
    zodError = e as ZodError;
  }
  const out = run(zodError);
  expect(out.status).toBe(400);
  expect((out.body as { message: string }).message).toBe("Validation failed.");
  expect((out.body as { issues: unknown[] }).issues.length).toBeGreaterThan(0);
});

test("renders an AppError with its status and response body", () => {
  const out = run(new AppError(409, "Conflict", { code: "DUP" }));
  expect(out.status).toBe(409);
  expect(out.body).toStrictEqual({ message: "Conflict", code: "DUP" });
});

test("surfaces a 4xx status decorated on a plain Error", () => {
  const decorated = Object.assign(new Error("Teapot"), { status: 418 });
  const out = run(decorated);
  expect(out.status).toBe(418);
  expect((out.body as { message: string }).message).toBe("Teapot");
});

test("hides internals behind a generic 500 for an un-statused error", () => {
  const originalError = console.error;
  console.error = () => {};
  try {
    const out = run(new Error("secret stack detail"));
    expect(out.status).toBe(500);
    expect(out.body).toStrictEqual({ message: "Internal server error." });
  } finally {
    console.error = originalError;
  }
});

test("does not surface a 5xx decorated message to the client", () => {
  const originalError = console.error;
  console.error = () => {};
  try {
    const decorated = Object.assign(new Error("db exploded"), { status: 503 });
    const out = run(decorated);
    expect(out.status).toBe(503);
    expect(out.body).toStrictEqual({ message: "Internal server error." });
  } finally {
    console.error = originalError;
  }
});
