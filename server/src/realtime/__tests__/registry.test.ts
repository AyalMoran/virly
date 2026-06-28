import assert from "node:assert/strict";
import test from "node:test";
import { getRealtime, setRealtime, noopRealtime } from "../registry.js";

test("defaults to a no-op gateway (safe in tests / no socket server)", () => {
  setRealtime(noopRealtime);
  assert.doesNotThrow(() => getRealtime().emitToUser("u1", "transfer:received", { amount: 1, reason: null }));
});

test("setRealtime swaps the active gateway", () => {
  const calls: Array<[string, string]> = [];
  setRealtime({ emitToUser: (uid, ev) => calls.push([uid, ev]) });
  getRealtime().emitToUser("u2", "transfer:received", { amount: 5, reason: "x" });
  assert.deepEqual(calls, [["u2", "transfer:received"]]);
  setRealtime(noopRealtime);
});
