import { getPaginationMeta, parsePagination } from "../pagination.js";

describe("parsePagination", () => {
  test("applies defaults when fields are absent", () => {
    expect(parsePagination({})).toStrictEqual({ page: 1, limit: 10 });
  });

  test("coerces numeric strings", () => {
    expect(parsePagination({ page: "3", limit: "25" })).toStrictEqual({
      page: 3,
      limit: 25
    });
  });

  test("caps limit at 50 by rejecting larger values", () => {
    expect(() => parsePagination({ limit: 51 })).toThrow();
  });

  test("accepts the boundary limit of 50", () => {
    expect(parsePagination({ limit: 50 })).toStrictEqual({ page: 1, limit: 50 });
  });

  test("rejects non-positive page", () => {
    expect(() => parsePagination({ page: 0 })).toThrow();
    expect(() => parsePagination({ page: -2 })).toThrow();
  });

  test("rejects non-integer values", () => {
    expect(() => parsePagination({ page: 1.5 })).toThrow();
  });
});

describe("getPaginationMeta", () => {
  test("computes totalPages with ceiling division", () => {
    expect(getPaginationMeta(1, 10, 25)).toStrictEqual({
      page: 1,
      limit: 10,
      total: 25,
      totalPages: 3
    });
  });

  test("returns zero pages for an empty total", () => {
    expect(getPaginationMeta(1, 10, 0).totalPages).toBe(0);
  });

  test("an exact multiple does not round up", () => {
    expect(getPaginationMeta(2, 10, 20).totalPages).toBe(2);
  });
});
