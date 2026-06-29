import assert from "node:assert/strict";
import { describe, test } from "node:test";

import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";

describe("unified path long-term persistence wiring", () => {
  test("hitl.ts imports and calls upsertInteractedCounterparties in both entries", () => {
    const path = fileURLToPath(new URL("../hitl.ts", import.meta.url));
    const src = readFileSync(path, "utf8");
    assert.match(
      src,
      /import\s*{[^}]*upsertInteractedCounterparties[^}]*}\s*from\s*"\.\/memory\/loop\.js"/s,
      "should import upsertInteractedCounterparties from ./memory/loop.js"
    );
    // Called in BOTH invokeV2Resumable and streamAssistantV2 (>= 2 call sites).
    const calls = src.match(/upsertInteractedCounterparties\(/g) ?? [];
    assert.ok(calls.length >= 2, `expected >= 2 call sites, found ${calls.length}`);
  });
});
