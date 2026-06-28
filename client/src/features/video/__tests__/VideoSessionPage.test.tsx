/**
 * Tests for VideoSessionPage.
 *
 * Requires AuthProvider (useAuth) and MemoryRouter (useSearchParams).
 * useEffect (session fetch when sessionId param is present) does not fire in
 * renderToStaticMarkup. Initial state: session=null, jitsi=null, isBusy=false.
 *
 * We render without a sessionId param so the fetch effect is a no-op even in
 * real browser mode; initial state shows the idle video stage.
 *
 * JitsiMeeting is only rendered when showMeeting=true (jitsi + active session),
 * which requires a server join response — not reachable offline. The outer page
 * static copy is fully testable.
 */
import React from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { MemoryRouter } from "react-router-dom";
import { AuthProvider } from "../../auth/AuthProvider.js";
import { VideoSessionPage } from "../VideoSessionPage.js";

function render(search = "") {
  return renderToStaticMarkup(
    <MemoryRouter initialEntries={[`/${search}`]}>
      <AuthProvider>
        <VideoSessionPage />
      </AuthProvider>
    </MemoryRouter>
  );
}

describe("VideoSessionPage", () => {
  describe("page header", () => {
    it("renders the Video calls title", () => {
      const html = render();
      expect(html).toMatch(/Video calls/);
    });

    it("renders the Secure help eyebrow", () => {
      const html = render();
      expect(html).toMatch(/Secure help/);
    });

    it("does not render a status pill when no session exists", () => {
      const html = render();
      expect(html).not.toMatch(/video-status-pill/);
    });
  });

  describe("intro copy", () => {
    it("renders the Start a secure app video session heading", () => {
      const html = render();
      expect(html).toMatch(/Start a secure app video session/);
    });

    it("renders the video guidance disclaimer", () => {
      const html = render();
      expect(html).toMatch(/Video support can guide you/);
      expect(html).toMatch(/normal in-app confirmation flow/);
    });
  });

  describe("topic textarea", () => {
    it("renders the Topic label", () => {
      const html = render();
      expect(html).toMatch(/Topic/);
    });

    it("renders the hint text", () => {
      const html = render();
      expect(html).toMatch(/Optional/);
      expect(html).toMatch(/passwords/);
    });
  });

  describe("session type buttons", () => {
    it("renders support session option", () => {
      const html = render();
      expect(html).toMatch(/Video support/);
      expect(html).toMatch(/Start support video/);
    });

    it("renders sales session option", () => {
      const html = render();
      expect(html).toMatch(/Sales consultation/);
      expect(html).toMatch(/Start sales video/);
    });

    it("renders both choice buttons", () => {
      const html = render();
      const choiceCount = (html.match(/video-choice/g) ?? []).length;
      expect(choiceCount).toBeGreaterThanOrEqual(2);
    });

    it("renders descriptive copy for support", () => {
      const html = render();
      expect(html).toMatch(/Get help from a Virly support agent/);
    });

    it("renders descriptive copy for sales", () => {
      const html = render();
      expect(html).toMatch(/Talk through account options/);
    });
  });

  describe("idle video stage", () => {
    it("renders No active call heading when no session", () => {
      const html = render();
      expect(html).toMatch(/No active call/);
    });

    it("renders the ready copy", () => {
      const html = render();
      expect(html).toMatch(/Choose a session type to begin/);
    });

    it("renders the empty stage illustration area", () => {
      const html = render();
      expect(html).toMatch(/video-empty-stage/);
    });

    it("renders the Ready when you are label", () => {
      const html = render();
      expect(html).toMatch(/Ready when you are/);
    });
  });

  describe("layout", () => {
    it("renders the video-page class", () => {
      const html = render();
      expect(html).toMatch(/video-page/);
    });

    it("renders the video-layout class", () => {
      const html = render();
      expect(html).toMatch(/video-layout/);
    });

    it("renders the video-control-panel card", () => {
      const html = render();
      expect(html).toMatch(/video-control-panel/);
    });

    it("renders the video-stage-card card", () => {
      const html = render();
      expect(html).toMatch(/video-stage-card/);
    });
  });

  describe("no error in initial state", () => {
    it("does not render an error banner on mount", () => {
      const html = render();
      expect(html).not.toMatch(/error-banner/i);
    });
  });
});
