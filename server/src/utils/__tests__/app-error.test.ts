import { AppError } from "../app-error.js";

test("carries status and message and is an Error", () => {
  const err = new AppError(404, "Not found");
  expect(err).toBeInstanceOf(Error);
  expect(err).toBeInstanceOf(AppError);
  expect(err.status).toBe(404);
  expect(err.message).toBe("Not found");
  expect(err.name).toBe("AppError");
  expect(err.code).toBeUndefined();
});

test("stores an optional machine-readable code", () => {
  const err = new AppError(409, "Conflict", { code: "DUPLICATE" });
  expect(err.code).toBe("DUPLICATE");
});

test("toResponseBody omits code when absent", () => {
  expect(new AppError(400, "Bad").toResponseBody()).toStrictEqual({
    message: "Bad"
  });
});

test("toResponseBody includes code when present", () => {
  expect(
    new AppError(400, "Bad", { code: "X" }).toResponseBody()
  ).toStrictEqual({ message: "Bad", code: "X" });
});

test("is throwable and catchable as AppError", () => {
  expect(() => {
    throw new AppError(403, "Forbidden");
  }).toThrow("Forbidden");
});
