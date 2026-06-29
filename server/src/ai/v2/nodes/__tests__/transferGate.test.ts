/**
 * Tests for transferGateNode.
 *
 * LangGraph's `interrupt()` throws a special error-like signal when no resume
 * value is waiting. We mock the entire `@langchain/langgraph` module so that
 * `interrupt()` is a Jest spy we can control, and `Command` is a minimal
 * stand-in that records the arguments passed to it.
 */

import { jest } from "@jest/globals";

// We must mock before any imports of the module-under-test.
// jest.unstable_mockModule is the ESM-safe mock approach.
const mockInterrupt = jest.fn();
const mockCommandInstances: Array<{ goto: string; update: Record<string, unknown> }> = [];

class MockCommand {
  goto: string;
  update: Record<string, unknown>;
  constructor(args: { goto: string; update: Record<string, unknown> }) {
    this.goto = args.goto;
    this.update = args.update;
    mockCommandInstances.push(this);
  }
}

jest.unstable_mockModule("@langchain/langgraph", async () => {
  return {
    interrupt: mockInterrupt,
    Command: MockCommand
  };
});

// Dynamic import AFTER the mock is registered.
const { transferGateNode } = await import("../transferGate.js");

import type { V2AgentStateType } from "../../state.js";

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function makeState(confirmation?: Partial<V2AgentStateType["confirmation"]>): V2AgentStateType {
  return {
    messages: [],
    confirmation: confirmation as V2AgentStateType["confirmation"]
  } as unknown as V2AgentStateType;
}

beforeEach(() => {
  mockCommandInstances.length = 0;
  mockInterrupt.mockReset();
});

// ---------------------------------------------------------------------------
// Tests
// ---------------------------------------------------------------------------

describe("transferGateNode — confirm decision", () => {
  test("routes to executeTransfer and sets confirmed outcome when action is 'confirm'", () => {
    const resumePayload = { action: "confirm" as const, version: 2, idempotencyKey: "idem-1" };
    mockInterrupt.mockReturnValue(resumePayload);

    const state = makeState({ id: "conf-1", version: 1 });
    const cmd = transferGateNode(state) as MockCommand;

    expect(cmd.goto).toBe("executeTransfer");
    expect(cmd.update["confirmationOutcome"]).toBe("confirmed");
    const meta = cmd.update["resumeMeta"] as { version: number; idempotencyKey?: string };
    expect(meta.version).toBe(2);
    expect(meta.idempotencyKey).toBe("idem-1");
  });

  test("uses card version as fallback when resume payload omits version (undefined)", () => {
    // The node uses `decision.version ?? card?.version ?? 1`.
    // `??` only triggers on null/undefined, so undefined triggers the fallback.
    const resumePayload = { action: "confirm" as const, version: undefined as unknown as number };
    mockInterrupt.mockReturnValue(resumePayload);

    const state = makeState({ id: "c2", version: 5 });
    const cmd = transferGateNode(state) as MockCommand;

    expect(cmd.goto).toBe("executeTransfer");
    // version undefined => falls back to card.version (5)
    const meta = cmd.update["resumeMeta"] as { version: number };
    expect(meta.version).toBe(5);
  });

  test("falls back to 1 when both payload version and card version are undefined", () => {
    const resumePayload = { action: "confirm" as const, version: undefined as unknown as number };
    mockInterrupt.mockReturnValue(resumePayload);

    // state with no confirmation card
    const state = makeState(undefined);
    const cmd = transferGateNode(state) as MockCommand;

    expect(cmd.goto).toBe("executeTransfer");
    const meta = cmd.update["resumeMeta"] as { version: number };
    expect(meta.version).toBe(1);
  });
});

describe("transferGateNode — deny decision", () => {
  test("routes to persist and sets denied outcome when action is 'deny'", () => {
    const resumePayload = { action: "deny" as const, version: 1 };
    mockInterrupt.mockReturnValue(resumePayload);

    const state = makeState({ id: "conf-deny", version: 1 });
    const cmd = transferGateNode(state) as MockCommand;

    expect(cmd.goto).toBe("persist");
    expect(cmd.update["confirmationOutcome"]).toBe("denied");
    expect(cmd.update["confirmation"]).toBeUndefined();
  });

  test("sets a user-facing cancellation message on deny", () => {
    mockInterrupt.mockReturnValue({ action: "deny" as const, version: 1 });

    const state = makeState({ id: "conf-msg", version: 1 });
    const cmd = transferGateNode(state) as MockCommand;

    expect(cmd.goto).toBe("persist");
    const msg = cmd.update["responseMessage"] as string;
    expect(msg).toMatch(/cancelled|cancel/i);
  });
});

describe("transferGateNode — interrupt invocation", () => {
  test("calls interrupt with a type and the state's confirmation card", () => {
    const card = { id: "c3", version: 1 };
    mockInterrupt.mockReturnValue({ action: "deny" as const, version: 1 });

    const state = makeState(card);
    transferGateNode(state);

    expect(mockInterrupt).toHaveBeenCalledTimes(1);
    const [arg] = mockInterrupt.mock.calls[0] as [{ type: string; card: unknown }];
    expect(arg.type).toBe("transfer_confirmation");
    expect(arg.card).toBe(state.confirmation);
  });
});
