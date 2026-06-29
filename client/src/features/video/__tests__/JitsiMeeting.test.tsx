/**
 * Tests for JitsiMeeting.
 *
 * JitsiMeeting accesses window.JitsiMeetExternalAPI and document.getElementById /
 * document.body inside a useEffect. Because useEffect does NOT run during
 * renderToStaticMarkup, none of the Jitsi SDK interactions fire, and the
 * component simply renders its static shell.
 *
 * The initial state is loading=true (set synchronously in state initializer),
 * which means the "Preparing secure video..." loading div is visible.
 */
import React from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { JitsiMeeting } from "../JitsiMeeting.js";
import type { JitsiJoinConfig } from "../../../lib/types.js";

const JITSI_CONFIG: JitsiJoinConfig = {
  provider: "mock",
  domain: "meet.example.com",
  roomName: "test-room-123",
  jwt: undefined,
  configOverwrite: {
    prejoinPageEnabled: false,
    disableDeepLinking: true
  },
  interfaceConfigOverwrite: {
    SHOW_JITSI_WATERMARK: false
  },
  expiresAt: "2099-01-01T00:00:00Z"
};

function render(overrides: Partial<JitsiJoinConfig> = {}) {
  return renderToStaticMarkup(
    <JitsiMeeting
      jitsi={{ ...JITSI_CONFIG, ...overrides }}
      displayName="Test Agent"
      onJoined={() => {}}
      onLeft={() => {}}
      onError={() => {}}
    />
  );
}

describe("JitsiMeeting", () => {
  describe("shell structure", () => {
    it("renders the jitsi-meeting-shell wrapper", () => {
      const html = render();
      expect(html).toMatch(/jitsi-meeting-shell/);
    });

    it("renders the jitsi-meeting-frame container", () => {
      const html = render();
      expect(html).toMatch(/jitsi-meeting-frame/);
    });
  });

  describe("loading state (initial)", () => {
    it("renders the loading indicator on initial render", () => {
      // loading=true is the initial useState value; useEffect hasn't fired
      const html = render();
      expect(html).toMatch(/Preparing secure video/);
    });

    it("renders the video-loading class", () => {
      const html = render();
      expect(html).toMatch(/video-loading/);
    });
  });

  describe("props do not affect static structure", () => {
    it("renders consistently with a JWT config", () => {
      const html = render({ jwt: "fake-jwt-token" });
      expect(html).toMatch(/jitsi-meeting-shell/);
    });

    it("renders consistently with different domain", () => {
      const html = render({ domain: "jitsi.virly.com" });
      expect(html).toMatch(/jitsi-meeting-shell/);
    });
  });
});
