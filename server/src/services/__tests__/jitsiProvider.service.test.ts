import { createVideoJoinConfig } from "../jitsiProvider.service.js";
import type { CreateVideoJoinConfigInput } from "../jitsiProvider.service.js";
import { config } from "../../config.js";

// The test env sets VIRLY_VIDEO_PROVIDER=jitsi-public-demo, so config.video.provider
// is "jitsi-public-demo". No RS256 private key is needed and no JWT is emitted.

function baseInput(): CreateVideoJoinConfigInput {
  return {
    sessionId: "sess-1",
    sessionType: "support",
    roomName: "room-abc",
    actorId: "user-1",
    actorRole: "user",
    actorKind: "user",
    displayName: "Alice"
  };
}

describe("createVideoJoinConfig — jitsi-public-demo / mock providers (no JWT)", () => {
  test("returns the configured domain and roomName unchanged for public-demo", () => {
    const result = createVideoJoinConfig(baseInput());
    expect(result.domain).toBe(config.video.jitsi.domain);
    expect(result.roomName).toBe("room-abc");
  });

  test("provider field matches config.video.provider", () => {
    const result = createVideoJoinConfig(baseInput());
    expect(result.provider).toBe(config.video.provider);
  });

  test("does not include a jwt field for the public-demo provider", () => {
    const result = createVideoJoinConfig(baseInput());
    expect(result.jwt).toBeUndefined();
  });

  test("does not include appId when config.video.jitsi.appId is unset", () => {
    // In test env VIRLY_JITSI_APP_ID is not set
    const result = createVideoJoinConfig(baseInput());
    if (!config.video.jitsi.appId) {
      expect(result.appId).toBeUndefined();
    }
  });

  test("configOverwrite disables the prejoin page and deep linking", () => {
    const result = createVideoJoinConfig(baseInput());
    expect(result.configOverwrite.prejoinPageEnabled).toBe(false);
    expect(result.configOverwrite.disableDeepLinking).toBe(true);
  });

  test("interfaceConfigOverwrite hides the Jitsi watermark", () => {
    const result = createVideoJoinConfig(baseInput());
    expect(result.interfaceConfigOverwrite.SHOW_JITSI_WATERMARK).toBe(false);
  });

  test("expiresAt is an ISO string representing a future timestamp", () => {
    const before = Date.now();
    const result = createVideoJoinConfig(baseInput());
    const expiresMs = new Date(result.expiresAt).getTime();
    expect(expiresMs).toBeGreaterThan(before);
  });

  test("expiresAt is roughly tokenTtlSeconds into the future", () => {
    const ttlMs = config.video.jitsi.tokenTtlSeconds * 1000;
    const before = Date.now();
    const result = createVideoJoinConfig(baseInput());
    const expiresMs = new Date(result.expiresAt).getTime();
    // Allow 5 s clock skew
    expect(expiresMs).toBeGreaterThanOrEqual(before + ttlMs - 5000);
    expect(expiresMs).toBeLessThanOrEqual(before + ttlMs + 5000);
  });

  test("accepts a sales session type without error", () => {
    const result = createVideoJoinConfig({ ...baseInput(), sessionType: "sales" });
    expect(result.provider).toBeDefined();
  });

  test("accepts agent actorKind without error", () => {
    const result = createVideoJoinConfig({
      ...baseInput(),
      actorKind: "agent",
      actorRole: "support_agent"
    });
    expect(result.provider).toBeDefined();
  });

  test("accepts an optional email field without error", () => {
    const result = createVideoJoinConfig({
      ...baseInput(),
      email: "alice@example.com"
    });
    expect(result.provider).toBeDefined();
  });

  test("null email field is handled without error", () => {
    const result = createVideoJoinConfig({ ...baseInput(), email: null });
    expect(result.provider).toBeDefined();
  });
});
