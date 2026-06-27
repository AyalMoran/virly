/**
 * Train + evaluate the fraud model offline (RAG_PLAN.md M4, phase 2). Free, no
 * Python, no embeddings. Run from server/:
 *   npm run fraud:train -- --file=/path/to/creditcard.csv
 *
 * Stratified train/test split → fit scaler on train → train logistic regression →
 * report PR-AUC + precision/recall at the best-F1 threshold, AND the kNN baseline
 * on the same split for an apples-to-apples comparison. Saves the serving artifact
 * { scaler, model, threshold } to artifacts/fraud-model.json.
 */
import { promises as fs } from "node:fs";
import path from "node:path";

import { parseCreditCardCsv } from "../src/fraud/csv.js";
import { knnFraudProbInMemory } from "../src/fraud/knnEval.js";
import { predictProba, trainLogReg } from "../src/fraud/logreg.js";
import { bestF1Threshold, confusionAtThreshold, prAuc } from "../src/fraud/metrics.js";
import { fitScaler, transform } from "../src/fraud/scaler.js";
import type { FraudLabel } from "../src/fraud/types.js";

function getFlag(name: string): string | undefined {
  const hit = process.argv.find((a) => a.startsWith(`--${name}=`));
  return hit?.slice(name.length + 3);
}
function num(name: string, def: number): number {
  const v = getFlag(name);
  return v === undefined ? def : Number(v);
}

/** Deterministic LCG so runs are reproducible. */
function makeRng(seed: number) {
  let s = seed;
  return () => {
    s = (s * 1103515245 + 12345) & 0x7fffffff;
    return s / 0x7fffffff;
  };
}
function shuffled<T>(arr: T[], rng: () => number): T[] {
  const a = [...arr];
  for (let i = a.length - 1; i > 0; i--) {
    const j = Math.floor(rng() * (i + 1));
    [a[i], a[j]] = [a[j], a[i]];
  }
  return a;
}

async function main(): Promise<void> {
  const file = getFlag("file");
  if (!file) throw new Error("Pass --file=<path to creditcard.csv>.");
  const testFrac = num("test-frac", 0.3);
  const k = num("k", 5);
  const epochs = num("epochs", 300);
  const out = getFlag("out") ?? path.resolve(import.meta.dirname, "../artifacts/fraud-model.json");
  const knnRefCap = num("knn-ref-cap", 20000);
  const knnTestCap = num("knn-test-cap", 2000);

  const rows = parseCreditCardCsv(await fs.readFile(path.resolve(file), "utf8"));
  if (rows.some((r) => r.label === null)) throw new Error("Training CSV must include the Class column.");
  console.log(`Parsed ${rows.length} labeled rows.`);

  // Stratified split so both folds keep the (tiny) fraud ratio.
  const rng = makeRng(7);
  const pos = shuffled(rows.filter((r) => r.label === 1), rng);
  const neg = shuffled(rows.filter((r) => r.label === 0), rng);
  const splitAt = (arr: typeof rows) => Math.floor(arr.length * (1 - testFrac));
  const train = [...pos.slice(0, splitAt(pos)), ...neg.slice(0, splitAt(neg))];
  const test = [...pos.slice(splitAt(pos)), ...neg.slice(splitAt(neg))];

  const scaler = fitScaler(train.map((r) => r.features));
  const trainX = train.map((r) => transform(r.features, scaler));
  const trainY = train.map((r) => r.label as FraudLabel);
  const testX = test.map((r) => transform(r.features, scaler));
  const testY = test.map((r) => r.label as FraudLabel);

  console.log(`Train: ${train.length} (${trainY.filter((v) => v).length} fraud), test: ${test.length} (${testY.filter((v) => v).length} fraud).`);

  // --- Logistic regression ---
  const model = trainLogReg(trainX, trainY, { epochs });
  const lrScores = testX.map((x) => predictProba(model, x));
  const lrAuc = prAuc(testY, lrScores);
  const { threshold } = bestF1Threshold(testY, lrScores);
  const lrConf = confusionAtThreshold(testY, lrScores, threshold);

  // --- kNN baseline on the same split (capped for speed) ---
  const ref = trainX.slice(0, knnRefCap);
  const refY = trainY.slice(0, knnRefCap);
  const evalIdx = testX.length > knnTestCap
    ? shuffled(testX.map((_, i) => i), rng).slice(0, knnTestCap)
    : testX.map((_, i) => i);
  const knnScores = evalIdx.map((i) => knnFraudProbInMemory(ref, refY, testX[i], k));
  const knnAuc = prAuc(evalIdx.map((i) => testY[i]), knnScores);

  console.log("\n=== Test-set comparison ===");
  console.log(`kNN (k=${k}, ${evalIdx.length} sampled)   PR-AUC: ${knnAuc.toFixed(4)}`);
  console.log(`LogReg                       PR-AUC: ${lrAuc.toFixed(4)}`);
  console.log(
    `LogReg @thr=${threshold.toFixed(3)}  precision: ${lrConf.precision.toFixed(3)} recall: ${lrConf.recall.toFixed(3)} f1: ${lrConf.f1.toFixed(3)} (tp=${lrConf.tp} fp=${lrConf.fp} fn=${lrConf.fn})`
  );

  await fs.mkdir(path.dirname(out), { recursive: true });
  await fs.writeFile(out, JSON.stringify({ scaler, model, threshold }));
  console.log(`\nSaved serving artifact to ${out}.`);
}

main()
  .then(() => process.exit(0))
  .catch((error) => {
    console.error(error instanceof Error ? error.message : error);
    process.exit(1);
  });
