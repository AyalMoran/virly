import { amountInWords } from "../amount-words";

describe("amountInWords", () => {
  test("spells a typical cheque amount", () => {
    expect(amountInWords(284.75)).toBe("Two hundred eighty-four and 75/100");
  });

  test("handles zero", () => {
    expect(amountInWords(0)).toBe("Zero and 00/100");
  });

  test("pads single-digit cents", () => {
    expect(amountInWords(5.05)).toBe("Five and 05/100");
  });

  test("spells thousands and joins scale words", () => {
    expect(amountInWords(1234.5)).toBe(
      "One thousand two hundred thirty-four and 50/100"
    );
  });

  test("spells millions", () => {
    expect(amountInWords(1_000_000)).toBe("One million and 00/100");
  });

  test("uses the absolute value for negatives", () => {
    expect(amountInWords(-42)).toBe("Forty-two and 00/100");
  });

  test("renders a half-shekel as 50 cents", () => {
    expect(amountInWords(100.5)).toBe("One hundred and 50/100");
  });
});
