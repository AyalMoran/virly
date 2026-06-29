import { getRealtime, setRealtime, noopRealtime } from "../registry.js";

test("defaults to a no-op gateway (safe in tests / no socket server)", () => {
  setRealtime(noopRealtime);
  expect(() => getRealtime().emitToUser("u1", "transfer:received", { amount: 1, reason: null })).not.toThrow();
});

test("setRealtime swaps the active gateway", () => {
  const calls: Array<[string, string]> = [];
  setRealtime({ emitToUser: (uid, ev) => calls.push([uid, ev]) });
  getRealtime().emitToUser("u2", "transfer:received", { amount: 5, reason: "x" });
  expect(calls).toStrictEqual([["u2", "transfer:received"]]);
  setRealtime(noopRealtime);
});
