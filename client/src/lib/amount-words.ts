
const ONES = [
  "zero", "one", "two", "three", "four", "five", "six", "seven", "eight", "nine",
  "ten", "eleven", "twelve", "thirteen", "fourteen", "fifteen", "sixteen",
  "seventeen", "eighteen", "nineteen"
];
const TENS = ["", "", "twenty", "thirty", "forty", "fifty", "sixty", "seventy", "eighty", "ninety"];
const SCALES = ["", " thousand", " million", " billion"];

function chunkToWords(value: number): string {
  const parts: string[] = [];
  const hundreds = Math.floor(value / 100);
  const rest = value % 100;
  if (hundreds) {
    parts.push(`${ONES[hundreds]} hundred`);
  }
  if (rest) {
    if (rest < 20) {
      parts.push(ONES[rest]);
    } else {
      const tens = Math.floor(rest / 10);
      const ones = rest % 10;
      parts.push(ones ? `${TENS[tens]}-${ONES[ones]}` : TENS[tens]);
    }
  }
  return parts.join(" ");
}

function integerToWords(value: number): string {
  if (value === 0) {
    return "zero";
  }
  const chunks: string[] = [];
  let remaining = value;
  let scale = 0;
  while (remaining > 0 && scale < SCALES.length) {
    const chunk = remaining % 1000;
    if (chunk) {
      chunks.unshift(`${chunkToWords(chunk)}${SCALES[scale]}`);
    }
    remaining = Math.floor(remaining / 1000);
    scale += 1;
  }
  return chunks.join(" ");
}

/**
 * Spells a monetary amount the way it's written on a cheque, e.g.
 * `amountInWords(284.75)` → "Two hundred eighty-four and 75/100".
 */
export function amountInWords(amount: number): string {
  const abs = Math.abs(amount);
  const whole = Math.floor(abs);
  const cents = Math.round((abs - whole) * 100);
  const words = integerToWords(whole);
  return `${words.charAt(0).toUpperCase()}${words.slice(1)} and ${String(cents).padStart(2, "0")}/100`;
}
