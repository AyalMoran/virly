// scripts/geo-sync.ts
//
// Download the free MaxMind GeoLite2-City database into server/data/.
// Requires VIRLY_MAXMIND_LICENSE_KEY (free MaxMind account). The tarball
// contains a dated folder; we extract just the .mmdb into place.
import { execFileSync } from "node:child_process";
import { copyFileSync, mkdirSync, readdirSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";

const licenseKey = process.env.VIRLY_MAXMIND_LICENSE_KEY ?? process.env.MAXMIND_LICENSE_KEY;
if (!licenseKey) {
  console.error("VIRLY_MAXMIND_LICENSE_KEY is required (free key: https://www.maxmind.com).");
  process.exit(1);
}

const url =
  "https://download.maxmind.com/app/geoip_download" +
  `?edition_id=GeoLite2-City&license_key=${encodeURIComponent(licenseKey)}&suffix=tar.gz`;

async function main() {
  const work = join(tmpdir(), `virly-geolite-${process.pid}`);
  mkdirSync(work, { recursive: true });
  console.log("Downloading GeoLite2-City...");
  const res = await fetch(url);
  if (!res.ok) {
    throw new Error(`Download failed: HTTP ${res.status} (check the license key).`);
  }
  const tarball = join(work, "GeoLite2-City.tar.gz");
  writeFileSync(tarball, Buffer.from(await res.arrayBuffer()));
  execFileSync("tar", ["-xzf", tarball, "-C", work]);
  const extracted = readdirSync(work).find((d) => d.startsWith("GeoLite2-City_"));
  if (!extracted) throw new Error("Unexpected tarball layout: no GeoLite2-City_* folder.");
  const target = join(process.cwd(), "data");
  mkdirSync(target, { recursive: true });
  copyFileSync(join(work, extracted, "GeoLite2-City.mmdb"), join(target, "GeoLite2-City.mmdb"));
  rmSync(work, { recursive: true, force: true });
  console.log(`Done: ${join(target, "GeoLite2-City.mmdb")}`);
  console.log("Set VIRLY_GEOIP_DB_PATH=./data/GeoLite2-City.mmdb in server/.env");
}

main().catch((error) => {
  console.error(error instanceof Error ? error.message : error);
  process.exit(1);
});
