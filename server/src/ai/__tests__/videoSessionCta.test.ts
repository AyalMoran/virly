import {
  buildVideoSessionCtaBlock,
  detectVideoSessionRequest
} from "../videoSessionCta.js";

test("video session detection only handles explicit support or sales call requests", () => {
  expect(detectVideoSessionRequest("I need a video call with support")).toStrictEqual({
    type: "support",
    topic: "Support video request from AI assistant"
  });
  expect(detectVideoSessionRequest("Can I talk to sales on a call?")).toStrictEqual({
    type: "sales",
    topic: "Sales video request from AI assistant"
  });
  expect(detectVideoSessionRequest("I need help with a transfer")).toBeNull();
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

  expect(block.type).toBe("video_session_cta");
  expect(block.sessionId).toBe("507f1f77bcf86cd799439099");
  expect(block.appPath).toBe("/video?sessionId=507f1f77bcf86cd799439099");
  expect(block.appPath.includes("meet.jit.si")).toBe(false);
  expect(block.appPath.includes("room")).toBe(false);
  expect(JSON.stringify(block).includes("external_api.js")).toBe(false);
});
