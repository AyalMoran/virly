import { getTransferLimits } from "../getTransferLimits.js";
import type { ToolContext } from "../../state.js";

// ---------------------------------------------------------------------------
// config.ai.perTransferLimit and dailyTransferLimit are read at module import.
// In the test environment they resolve to their defaults (500 / 1000).
// ---------------------------------------------------------------------------

function makeContext(): ToolContext {
  return {
    userId: "user1",
    conversationId: "conv1",
    message: "what are my transfer limits?"
  };
}

describe("getTransferLimits", () => {
  it("returns status ok", async () => {
    const result = await getTransferLimits(makeContext());
    expect(result.status).toBe("ok");
    expect(result.toolName).toBe("getTransferLimits");
  });

  it("data contains perTransferLimit and dailyTransferLimit as positive numbers", async () => {
    const result = await getTransferLimits(makeContext());
    const data = result.data as { perTransferLimit: number; dailyTransferLimit: number };
    expect(typeof data.perTransferLimit).toBe("number");
    expect(typeof data.dailyTransferLimit).toBe("number");
    expect(data.perTransferLimit).toBeGreaterThan(0);
    expect(data.dailyTransferLimit).toBeGreaterThan(0);
  });

  it("summary mentions per-transfer and daily limits as numbers", async () => {
    const result = await getTransferLimits(makeContext());
    const summary = (result.displayData as { summary: string }).summary;
    expect(summary).toMatch(/\d+\.\d{2}/);
    expect(summary).toMatch(/per transfer/i);
    expect(summary).toMatch(/per day/i);
  });

  it("metadata has recordCount of 1", async () => {
    const result = await getTransferLimits(makeContext());
    const meta = (result.displayData as { metadata: { recordCount: number } }).metadata;
    expect(meta.recordCount).toBe(1);
  });

  it("returns the same data regardless of context content", async () => {
    const ctx1 = makeContext();
    const ctx2 = { ...makeContext(), userId: "user2", message: "limits please" };
    const [r1, r2] = await Promise.all([getTransferLimits(ctx1), getTransferLimits(ctx2)]);
    expect(r1.data).toEqual(r2.data);
  });
});
