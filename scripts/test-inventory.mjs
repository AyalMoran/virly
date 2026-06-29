// Dev-only inventory: list logic-bearing source files lacking a sibling
// __tests__ test. Skips pure type-only files and pure re-export index barrels.
// Usage: node scripts/test-inventory.mjs
import { readdirSync, readFileSync, statSync } from "node:fs";
import { join, dirname, basename, relative } from "node:path";

const roots = ["server/src", "client/src"];
const repo = process.cwd();
const isTest = (f) => /\.(test|spec)\.(ts|tsx)$/.test(f);

function walk(dir, acc = []) {
  for (const entry of readdirSync(dir)) {
    const full = join(dir, entry);
    if (statSync(full).isDirectory()) {
      // Skip deps, build output, and test dirs (helpers/kits there are test
      // infrastructure, not source that needs its own tests).
      if (entry === "node_modules" || entry === "dist" || entry === "__tests__") continue;
      walk(full, acc);
    } else if (/\.(ts|tsx)$/.test(entry)) acc.push(full);
  }
  return acc;
}

function classify(file) {
  const lines = readFileSync(file, "utf8")
    .split("\n")
    .map((l) => l.trim())
    .filter((l) => l && !l.startsWith("//") && !l.startsWith("*") && !l.startsWith("/*"));
  const code = lines.join("\n");
  const reExportOnly = lines.every(
    (l) =>
      /^import /.test(l) ||
      /^export (\*|type \{|\{)[^=]*from /.test(l) ||
      /^export \{[^}]*\};?$/.test(l)
  );
  if (basename(file) === "index.ts" && reExportOnly) return "barrel";
  const hasRuntime =
    /\b(function|=>|class |new |await |return |for \(|while \(|if \()/.test(code) ||
    /export (const|let|function|class|async|default) /.test(code) ||
    /^(const|let|var) /m.test(code);
  if (/(export )?(type |interface |enum )/.test(code) && !hasRuntime) return "type-only";
  if (reExportOnly) return "barrel";
  return "logic";
}

function hasTest(file) {
  const base = basename(file).replace(/\.(ts|tsx)$/, "");
  try {
    return readdirSync(join(dirname(file), "__tests__")).some(
      (c) => c.startsWith(base + ".") && isTest(c)
    );
  } catch {
    return false;
  }
}

const untested = [];
const summary = { logic: 0, barrel: 0, "type-only": 0 };
for (const root of roots) {
  for (const file of walk(join(repo, root))) {
    if (isTest(file)) continue;
    const kind = classify(file);
    summary[kind]++;
    if (kind === "logic" && !hasTest(file)) untested.push(relative(repo, file));
  }
}

console.log(untested.sort().join("\n"));
console.log(`\nCLASSIFICATION: ${JSON.stringify(summary)}`);
console.log(`TOTAL untested logic files: ${untested.length}`);
