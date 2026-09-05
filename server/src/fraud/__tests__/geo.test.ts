// src/fraud/__tests__/geo.test.ts
import { haversineKm, homeBaseline, isNewCountry, travelSpeedKmh } from "../geo.js";

const TLV = { country: "IL", city: "Tel Aviv", lat: 32.0853, lng: 34.7818 };
const PARIS = { country: "FR", city: "Paris", lat: 48.8566, lng: 2.3522 };
const JLM = { country: "IL", city: "Jerusalem", lat: 31.7683, lng: 35.2137 };

function ev(geo: typeof TLV, iso: string) {
  return { geo, at: new Date(iso) };
}

test("haversineKm: Tel Aviv to Paris is ~3,290 km", () => {
  const d = haversineKm(TLV, PARIS);
  expect(d).toBeGreaterThan(3200);
  expect(d).toBeLessThan(3400);
});

test("haversineKm: zero for identical points", () => {
  expect(haversineKm(TLV, TLV)).toBe(0);
});

test("travelSpeedKmh: TLV -> Paris in 30 minutes is impossibly fast", () => {
  const speed = travelSpeedKmh(ev(TLV, "2026-07-01T10:00:00Z"), ev(PARIS, "2026-07-01T10:30:00Z"));
  expect(speed).toBeGreaterThan(6000);
});

test("travelSpeedKmh: same-instant far jump is finite and huge (elapsed clamped to 1 minute)", () => {
  const speed = travelSpeedKmh(ev(TLV, "2026-07-01T10:00:00Z"), ev(PARIS, "2026-07-01T10:00:00Z"));
  expect(Number.isFinite(speed)).toBe(true);
  expect(speed).toBeGreaterThan(100_000);
});

test("travelSpeedKmh: TLV -> Paris in 5 hours is a plausible flight", () => {
  const speed = travelSpeedKmh(ev(TLV, "2026-07-01T10:00:00Z"), ev(PARIS, "2026-07-01T15:00:00Z"));
  expect(speed).toBeLessThan(900);
});

test("homeBaseline: null below 5 located events", () => {
  expect(homeBaseline([ev(TLV, "2026-07-01T10:00:00Z")])).toBeNull();
});

test("homeBaseline: centroid of the modal city cluster", () => {
  const events = [
    ev(TLV, "2026-06-01T10:00:00Z"),
    ev(TLV, "2026-06-02T10:00:00Z"),
    ev(TLV, "2026-06-03T10:00:00Z"),
    ev(JLM, "2026-06-04T10:00:00Z"),
    ev(PARIS, "2026-06-05T10:00:00Z")
  ];
  const home = homeBaseline(events);
  expect(home).not.toBeNull();
  expect(home!.lat).toBeCloseTo(TLV.lat, 3);
  expect(home!.lng).toBeCloseTo(TLV.lng, 3);
});

test("isNewCountry: true for unseen country, false for seen, null with no history", () => {
  const history = [ev(TLV, "2026-06-01T10:00:00Z"), ev(JLM, "2026-06-02T10:00:00Z")];
  expect(isNewCountry("FR", history)).toBe(true);
  expect(isNewCountry("IL", history)).toBe(false);
  expect(isNewCountry("FR", [])).toBeNull();
});
