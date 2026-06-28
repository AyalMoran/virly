

import { readdir, readFile } from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";

// `src/` root: this test now lives at src/repositories/__tests__/, so go up two.
const __dirname = path.dirname(fileURLToPath(import.meta.url));
const ROOT = path.resolve(__dirname, "../..");
const ALLOWED_PREFIXES = [
  path.join(ROOT, "repositories", "mongo"),
  path.join(ROOT, "ai", "evals")
];

async function walk(dir: string): Promise<string[]> {
  const out: string[] = [];
  for (const e of await readdir(dir, { withFileTypes: true })) {
    const p = path.join(dir, e.name);
    if (e.isDirectory()) out.push(...await walk(p));
    else if (e.name.endsWith(".ts") && !e.name.endsWith(".test.ts")) out.push(p);
  }
  return out;
}

test("only repositories/mongo and ai/evals import ../models/*", async () => {
  const offenders: string[] = [];
  for (const file of await walk(ROOT)) {
    if (ALLOWED_PREFIXES.some((prefix) => file.startsWith(prefix))) continue;
    const src = await readFile(file, "utf8");
    if (/from\s+["'](\.\.\/)*models\//.test(src)) offenders.push(path.relative(ROOT, file));
  }
  expect(offenders).toStrictEqual([]);
});
