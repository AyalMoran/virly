import { randomStartingBalance } from "../otp.js";

test("returns a number within the 1000-9000 starting range", () => {
  for (let i = 0; i < 200; i++) {
    const balance = randomStartingBalance();
    expect(typeof balance).toBe("number");
    expect(balance).toBeGreaterThanOrEqual(1000);
    expect(balance).toBeLessThanOrEqual(9000);
  }
});

test("rounds to at most two decimal places", () => {
  for (let i = 0; i < 200; i++) {
    const balance = randomStartingBalance();
    // No more than two decimals: value equals its 2-decimal rounding.
    expect(balance).toBe(Number(balance.toFixed(2)));
  }
});
