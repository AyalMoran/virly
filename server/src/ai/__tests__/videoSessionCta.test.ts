import assert from "node:assert/strict";
import test from "node:test";
import {
  buildVideoSessionCtaBlock,
  detectVideoSessionRequest
} from "../videoSessionCta.js";

test("video session detection only handles explicit support or sales call requests", () => {
  assert.deepEqual(detectVideoSessionRequest("I need a video call with support"), {
    type: "support",
    topic: "Support video request from AI assistant"
  });
  assert.deepEqual(detectVideoSessionRequest("Can I talk to sales on a call?"), {
    type: "sales",
    topic: "Sales video request from AI assistant"
  });
  assert.equal(detectVideoSessionRequest("I need help with a transfer"), null);
});

test("video CTA block returns an app reference without a raw meeting link", () => {
  const block = buildVideoSessionCtaBlock(
    {
      id: "507f1f77bcf86cd799439099",
      type: "support",
      status: "waiting_for_agent"
    } as never,
    false
  );

  assert.equal(block.type, "video_session_cta");
  assert.equal(block.sessionId, "507f1f77bcf86cd799439099");
  assert.equal(block.appPath, "/video?sessionId=507f1f77bcf86cd799439099");
  assert.equal(block.appPath.includes("meet.jit.si"), false);
  assert.equal(block.appPath.includes("room"), false);
  assert.equal(JSON.stringify(block).includes("external_api.js"), false);
});
