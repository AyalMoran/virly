import { resolveDevThrottleMs } from "../devThrottle.js";

describe("resolveDevThrottleMs", () => {
  test("returns 0 when VIRLY_THROTTLE_MS is unset", () => {
    expect(resolveDevThrottleMs({})).toBe(0);
  });

  test("parses a positive integer", () => {
    expect(resolveDevThrottleMs({ VIRLY_THROTTLE_MS: "1500" })).toBe(1500);
  });

  test("returns 0 for non-numeric, negative, or zero values", () => {
    expect(resolveDevThrottleMs({ VIRLY_THROTTLE_MS: "abc" })).toBe(0);
    expect(resolveDevThrottleMs({ VIRLY_THROTTLE_MS: "-200" })).toBe(0);
    expect(resolveDevThrottleMs({ VIRLY_THROTTLE_MS: "0" })).toBe(0);
  });

  test("floors fractional values", () => {
    expect(resolveDevThrottleMs({ VIRLY_THROTTLE_MS: "99.9" })).toBe(99);
  });

  test("returns 0 in production even when set", () => {
    expect(
      resolveDevThrottleMs({ VIRLY_THROTTLE_MS: "6000", NODE_ENV: "production" })
    ).toBe(0);
  });
});
