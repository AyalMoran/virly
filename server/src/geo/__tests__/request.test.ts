// src/geo/__tests__/request.test.ts
import { jest } from "@jest/globals";

type FakeReq = { ip?: string; header: (name: string) => string | undefined };

function fakeReq(ip: string | undefined, devGeo?: string): FakeReq {
  return { ip, header: (name) => (name === "X-Virly-Dev-Geo" ? devGeo : undefined) };
}

async function loadRequestModule(env: Record<string, string | undefined>) {
  const prev = { ...process.env };
  for (const [k, v] of Object.entries(env)) {
    if (v === undefined) delete process.env[k];
    else process.env[k] = v;
  }
  let mod: typeof import("../request.js") | undefined;
  await jest.isolateModulesAsync(async () => {
    mod = await import("../request.js");
  });
  process.env = prev;
  return mod!;
}

test("simulation on: dev header wins and ip is still recorded", async () => {
  const { resolveRequestOrigin } = await loadRequestModule({ VIRLY_GEOIP_SIMULATION: "true" });
  const origin = resolveRequestOrigin(fakeReq("127.0.0.1", "Paris,FR,48.8566,2.3522") as never);
  expect(origin.ip).toBe("127.0.0.1");
  expect(origin.geo?.city).toBe("Paris");
});

test("simulation off: dev header is ignored (unresolvable local ip -> null geo)", async () => {
  const { resolveRequestOrigin } = await loadRequestModule({ VIRLY_GEOIP_SIMULATION: "false" });
  const origin = resolveRequestOrigin(fakeReq("127.0.0.1", "Paris,FR,48.8566,2.3522") as never);
  expect(origin.ip).toBe("127.0.0.1");
  expect(origin.geo).toBeNull();
});

test("missing ip yields null ip and null geo", async () => {
  const { resolveRequestOrigin } = await loadRequestModule({ VIRLY_GEOIP_SIMULATION: "true" });
  const origin = resolveRequestOrigin(fakeReq(undefined) as never);
  expect(origin).toStrictEqual({ ip: null, geo: null });
});
