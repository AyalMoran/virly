import assert from "node:assert/strict";
import { describe, test } from "node:test";

import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";

describe("runAssistant v2 dispatch", () => {
  test("v2 branch imports invokeV2Resumable, not runAssistantGraphV2", () => {
    const path = fileURLToPath(new URL("../runAssistant.ts", import.meta.url));
    const src = readFileSync(path, "utf8");
    assert.match(src, /invokeV2Resumable/, "should dispatch to the resumable graph");
    assert.doesNotMatch(src, /runAssistantGraphV2/, "must not reference the deleted graph");
    assert.doesNotMatch(src, /v2\/graph\.js/, "must not import the deleted module");
  });
});
