import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";

describe("runAssistant v2 dispatch", () => {
  test("v2 branch imports invokeV2Resumable, not runAssistantGraphV2", () => {
    const path = fileURLToPath(new URL("../runAssistant.ts", import.meta.url));
    const src = readFileSync(path, "utf8");
    expect(src).toMatch(/invokeV2Resumable/);
    expect(src).not.toMatch(/runAssistantGraphV2/);
    expect(src).not.toMatch(/v2\/graph\.js/);
  });
});
