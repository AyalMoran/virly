import {
  getBooleanEnv,
  getIntEnv,
  getOptionalStringEnv,
  getStringEnv
} from "../env.js";

// Each test uses unique env names so there is no cross-test contamination, but
// we still clean them up so the process environment is left as we found it.
const TOUCHED = [
  "TEST_STR",
  "TEST_STR_ALIAS",
  "TEST_OPT",
  "TEST_BOOL",
  "TEST_INT"
];

afterEach(() => {
  for (const name of TOUCHED) delete process.env[name];
});

describe("getStringEnv", () => {
  test("returns the value when set", () => {
    process.env.TEST_STR = "hello";
    expect(getStringEnv("TEST_STR", "fallback")).toBe("hello");
  });

  test("returns the default when unset", () => {
    expect(getStringEnv("TEST_STR", "fallback")).toBe("fallback");
  });

  test("throws when set to an empty/whitespace value", () => {
    process.env.TEST_STR = "   ";
    expect(() => getStringEnv("TEST_STR", "fallback")).toThrow(/cannot be empty/);
  });

  test("falls back to an alias name", () => {
    process.env.TEST_STR_ALIAS = "via-alias";
    expect(
      getStringEnv("TEST_STR", "fallback", { aliases: ["TEST_STR_ALIAS"] })
    ).toBe("via-alias");
  });
});

describe("getOptionalStringEnv", () => {
  test("returns undefined when unset or blank", () => {
    expect(getOptionalStringEnv("TEST_OPT")).toBeUndefined();
    process.env.TEST_OPT = "  ";
    expect(getOptionalStringEnv("TEST_OPT")).toBeUndefined();
  });

  test("returns the value when present", () => {
    process.env.TEST_OPT = "present";
    expect(getOptionalStringEnv("TEST_OPT")).toBe("present");
  });
});

describe("getBooleanEnv", () => {
  test("parses truthy tokens", () => {
    for (const v of ["1", "true", "YES", "On"]) {
      process.env.TEST_BOOL = v;
      expect(getBooleanEnv("TEST_BOOL", { defaultValue: false })).toBe(true);
    }
  });

  test("parses falsy tokens", () => {
    for (const v of ["0", "false", "no", "OFF"]) {
      process.env.TEST_BOOL = v;
      expect(getBooleanEnv("TEST_BOOL", { defaultValue: true })).toBe(false);
    }
  });

  test("returns the default when unset", () => {
    expect(getBooleanEnv("TEST_BOOL", { defaultValue: true })).toBe(true);
  });

  test("throws on an unrecognised value", () => {
    process.env.TEST_BOOL = "maybe";
    expect(() => getBooleanEnv("TEST_BOOL", { defaultValue: true })).toThrow(
      /must be a boolean/
    );
  });
});

describe("getIntEnv", () => {
  test("parses an integer", () => {
    process.env.TEST_INT = "42";
    expect(getIntEnv("TEST_INT", { defaultValue: 1 })).toBe(42);
  });

  test("returns the default when unset", () => {
    expect(getIntEnv("TEST_INT", { defaultValue: 7 })).toBe(7);
  });

  test("throws on a non-integer", () => {
    process.env.TEST_INT = "3.5";
    expect(() => getIntEnv("TEST_INT", { defaultValue: 1 })).toThrow(
      /must be an integer/
    );
  });

  test("enforces the min bound", () => {
    process.env.TEST_INT = "2";
    expect(() => getIntEnv("TEST_INT", { defaultValue: 1, min: 5 })).toThrow(
      /at least 5/
    );
  });

  test("enforces the max bound", () => {
    process.env.TEST_INT = "99";
    expect(() => getIntEnv("TEST_INT", { defaultValue: 1, max: 10 })).toThrow(
      /at most 10/
    );
  });

  test("accepts a value within bounds", () => {
    process.env.TEST_INT = "5";
    expect(getIntEnv("TEST_INT", { defaultValue: 1, min: 1, max: 10 })).toBe(5);
  });
});
