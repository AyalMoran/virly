// src/__tests__/config.geo.test.ts
import { jest } from "@jest/globals";

async function loadConfig(env: Record<string, string | undefined>) {
  const prev = { ...process.env };
  for (const [k, v] of Object.entries(env)) {
    if (v === undefined) delete process.env[k];
    else process.env[k] = v;
  }
  let mod: { config: typeof import("../config.js").config } | undefined;
  await jest.isolateModulesAsync(async () => {
    mod = (await import("../config.js")) as { config: typeof import("../config.js").config };
  });
  process.env = prev;
  return mod!.config;
}

test("geo defaults: enabled, no db path, no simulation, 180 days", async () => {
  const config = await loadConfig({
    VIRLY_GEO_ENABLED: undefined,
    VIRLY_GEOIP_DB_PATH: undefined,
    VIRLY_GEOIP_SIMULATION: undefined,
    VIRLY_ACTIVITY_RETENTION_DAYS: undefined
  });
  expect(config.geo).toStrictEqual({
    enabled: true,
    geoipDbPath: undefined,
    simulationEnabled: false,
    retentionDays: 180
  });
});

test("geo values are read from env", async () => {
  const config = await loadConfig({
    VIRLY_GEO_ENABLED: "false",
    VIRLY_GEOIP_DB_PATH: "/tmp/GeoLite2-City.mmdb",
    VIRLY_GEOIP_SIMULATION: "true",
    VIRLY_ACTIVITY_RETENTION_DAYS: "30",
    NODE_ENV: "development"
  });
  expect(config.geo.enabled).toBe(false);
  expect(config.geo.geoipDbPath).toBe("/tmp/GeoLite2-City.mmdb");
  expect(config.geo.simulationEnabled).toBe(true);
  expect(config.geo.retentionDays).toBe(30);
});

test("simulation enabled in production fails boot", async () => {
  await expect(
    loadConfig({
      NODE_ENV: "production",
      VIRLY_GEOIP_SIMULATION: "true",
      // production also requires a strong JWT secret; satisfy it so THIS rule is what throws
      VIRLY_JWT_SECRET: "a".repeat(40)
    })
  ).rejects.toThrow(/VIRLY_GEOIP_SIMULATION/);
});
