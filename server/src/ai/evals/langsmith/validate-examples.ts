import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";

import {
  EXAMPLES_FILE_URL,
  validateAssistantExamples
} from "./schema.js";

const path = process.argv[2] ?? fileURLToPath(EXAMPLES_FILE_URL);
const raw = JSON.parse(readFileSync(path, "utf8")) as unknown;
const result = validateAssistantExamples(raw);

for (const warning of result.warnings) {
  console.warn(`warning: ${warning}`);
}

if (result.errors.length > 0) {
  console.error(result.errors.join("\n"));
  process.exit(1);
}

const coverage = Array.from(result.coverage.entries())
  .sort(([left], [right]) => left.localeCompare(right))
  .map(([behavior, exampleIds]) => ({
    behavior,
    examples: exampleIds.length
  }));

console.log(
  JSON.stringify(
    {
      file: path,
      examples: result.examples.length,
      behaviors: coverage.length,
      coverage
    },
    null,
    2
  )
);
