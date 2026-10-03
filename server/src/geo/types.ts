// src/geo/types.ts
import type { ActivityEventGeo } from "../repositories/types.js";

export type GeoPoint = ActivityEventGeo;
export type RequestOrigin = { ip: string | null; geo: GeoPoint | null };
