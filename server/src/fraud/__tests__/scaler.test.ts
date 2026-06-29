import { fitScaler, transform } from "../scaler.js";

describe("fitScaler / transform", () => {
  test("centers to mean 0 and scales to unit std", () => {
    const rows = [
      [0, 10],
      [2, 20],
      [4, 30]
    ];
    const scaler = fitScaler(rows);
    expect(scaler.mean).toStrictEqual([2, 20]);
    // population std: sqrt(((-2)^2+0+2^2)/3) = sqrt(8/3)
    expect(Math.abs(scaler.std[0] - Math.sqrt(8 / 3))).toBeLessThan(1e-9);
    const t = transform([2, 20], scaler);
    expect(t).toStrictEqual([0, 0]);
  });

  test("guards zero-variance columns against divide-by-zero", () => {
    const scaler = fitScaler([
      [5, 1],
      [5, 3]
    ]);
    expect(scaler.std[0]).toBe(1); // constant column -> std forced to 1
    expect(transform([5, 2], scaler)).toStrictEqual([0, 0]);
  });

  test("throws on inconsistent feature lengths and empty input", () => {
    expect(() => fitScaler([])).toThrow();
    expect(() => fitScaler([[1, 2], [1]])).toThrow();
    const scaler = fitScaler([[1, 2]]);
    expect(() => transform([1], scaler)).toThrow();
  });
});
