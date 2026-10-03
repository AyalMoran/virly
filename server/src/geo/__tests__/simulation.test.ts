// src/geo/__tests__/simulation.test.ts
import { parseDevGeoHeader } from "../simulation.js";

test("parses 'city,CC,lat,lng'", () => {
  expect(parseDevGeoHeader("Paris,FR,48.8566,2.3522")).toStrictEqual({
    country: "FR",
    city: "Paris",
    lat: 48.8566,
    lng: 2.3522
  });
});

test("uppercases country and trims parts", () => {
  expect(parseDevGeoHeader(" Tel Aviv , il , 32.0853 , 34.7818 ")).toStrictEqual({
    country: "IL",
    city: "Tel Aviv",
    lat: 32.0853,
    lng: 34.7818
  });
});

test.each([
  [undefined],
  [""],
  ["Paris,FR"],
  ["Paris,FRA,48.8,2.3"],
  ["Paris,FR,not-a-number,2.3"],
  ["Paris,FR,91,2.3"],
  ["Paris,FR,48.8,181"]
])("rejects malformed header %p", (value) => {
  expect(parseDevGeoHeader(value as string | undefined)).toBeNull();
});
