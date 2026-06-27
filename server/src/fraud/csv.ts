/**
 * Minimal CSV parser for the Kaggle Credit Card Fraud dataset (RAG_PLAN.md M4).
 *
 * Expects the standard header `Time,V1..V28,Amount,Class`. We take V1..V28 +
 * Amount as the feature vector (Time is dropped — it's seconds-since-first-txn,
 * not predictive across a real deployment) and Class as the label. No CSV
 * dependency: the dataset is plain numeric, comma-separated, optionally quoted.
 */
import { FRAUD_FEATURE_DIM, type RawTransaction } from "./types.js";

const V_COLUMNS = Array.from({ length: 28 }, (_, i) => `V${i + 1}`);

function splitCsvLine(line: string): string[] {
  // The dataset has no embedded commas; a simple split + quote-strip is enough.
  return line.split(",").map((c) => c.trim().replace(/^"(.*)"$/, "$1"));
}

/** Parse the dataset's CSV text into raw (unscaled) feature rows. */
export function parseCreditCardCsv(text: string): RawTransaction[] {
  const lines = text.split(/\r?\n/).filter((l) => l.trim() !== "");
  if (lines.length < 2) return [];

  const header = splitCsvLine(lines[0]);
  const idx = (name: string): number => {
    const i = header.indexOf(name);
    if (i === -1) throw new Error(`Missing column "${name}" in CSV header.`);
    return i;
  };

  const vIdx = V_COLUMNS.map(idx);
  const amountIdx = idx("Amount");
  const hasClass = header.includes("Class");
  const classIdx = hasClass ? idx("Class") : -1;

  const rows: RawTransaction[] = [];
  for (let li = 1; li < lines.length; li++) {
    const cells = splitCsvLine(lines[li]);
    const features = [...vIdx.map((i) => Number(cells[i])), Number(cells[amountIdx])];
    if (features.length !== FRAUD_FEATURE_DIM || features.some((n) => !Number.isFinite(n))) {
      throw new Error(`Malformed row at line ${li + 1}.`);
    }
    let label: RawTransaction["label"] = null;
    if (hasClass) {
      const c = Number(cells[classIdx]);
      label = c === 1 ? 1 : 0;
    }
    rows.push({ features, label });
  }
  return rows;
}
