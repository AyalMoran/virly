// src/geo/simulation.ts
import type { GeoPoint } from "./types.js";

/** Dev-only header format: "city,CC,lat,lng" (e.g. "Paris,FR,48.8566,2.3522"). */
export function parseDevGeoHeader(value: string | undefined): GeoPoint | null {
  if (!value) return null;
  const parts = value.split(",").map((p) => p.trim());
  if (parts.length !== 4) return null;
  const [city, country, latRaw, lngRaw] = parts as [string, string, string, string];
  const lat = Number(latRaw);
  const lng = Number(lngRaw);
  if (!city || !/^[A-Za-z]{2}$/.test(country)) return null;
  if (!Number.isFinite(lat) || !Number.isFinite(lng)) return null;
  if (Math.abs(lat) > 90 || Math.abs(lng) > 180) return null;
  return { country: country.toUpperCase(), city, lat, lng };
}
