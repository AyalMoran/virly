// src/services/__tests__/loginAlert.test.ts
import { evaluateLoginAlert } from "../loginAlert.js";
import type { ActivityEventRecord } from "../../repositories/types.js";

const TLV = { country: "IL", city: "Tel Aviv", lat: 32.0853, lng: 34.7818 };
const PARIS = { country: "FR", city: "Paris", lat: 48.8566, lng: 2.3522 };

function located(at: string, geo: typeof TLV): ActivityEventRecord {
  return {
    id: "6867f00000000000000000aa", userId: "u1", kind: "login", at: new Date(at),
    ip: null, geo, transactionId: null,
    expiresAt: new Date("2027-01-01T00:00:00Z"), createdAt: new Date(at), updatedAt: new Date(at)
  };
}

test("new country + impossible travel produce reasons", () => {
  const reasons = evaluateLoginAlert(
    { geo: PARIS, at: new Date("2026-07-01T10:30:00Z") },
    [located("2026-07-01T10:00:00Z", TLV)]
  );
  expect(reasons.length).toBeGreaterThanOrEqual(1);
  expect(reasons.join(" ")).toMatch(/First activity from/);
});

test("familiar location produces no reasons", () => {
  const reasons = evaluateLoginAlert(
    { geo: TLV, at: new Date("2026-07-01T10:30:00Z") },
    [located("2026-07-01T08:00:00Z", TLV)]
  );
  expect(reasons).toStrictEqual([]);
});

test("null geo or empty history is silent (fail-open)", () => {
  expect(evaluateLoginAlert({ geo: null, at: new Date() }, [])).toStrictEqual([]);
  expect(evaluateLoginAlert({ geo: PARIS, at: new Date() }, [])).toStrictEqual([]);
});
