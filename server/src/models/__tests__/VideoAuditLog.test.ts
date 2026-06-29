import { videoAuditEventValues } from "../VideoAuditLog.js";

describe("videoAuditEventValues", () => {
  it("contains all expected audit event strings", () => {
    const expected = [
      "video_session_created",
      "video_session_join_token_issued",
      "video_session_user_joined",
      "video_session_agent_joined",
      "video_session_assigned",
      "video_session_ended",
      "video_session_cancelled",
      "video_session_failed",
    ];
    for (const e of expected) {
      expect(videoAuditEventValues).toContain(e);
    }
  });

  it("contains exactly eight event types", () => {
    expect(videoAuditEventValues).toHaveLength(8);
  });

  it("every entry is a non-empty string", () => {
    for (const e of videoAuditEventValues) {
      expect(typeof e).toBe("string");
      expect(e.length).toBeGreaterThan(0);
    }
  });

  it("does not contain unknown events", () => {
    const set = new Set(videoAuditEventValues as readonly string[]);
    expect(set.has("video_session_paused")).toBe(false);
    expect(set.has("user_banned")).toBe(false);
    expect(set.has("")).toBe(false);
  });

  it("entries are unique (no duplicates)", () => {
    expect(new Set(videoAuditEventValues).size).toBe(videoAuditEventValues.length);
  });

  it("all entries follow the video_session_ prefix convention", () => {
    for (const e of videoAuditEventValues) {
      expect(e.startsWith("video_session_")).toBe(true);
    }
  });
});
