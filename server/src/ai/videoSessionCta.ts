import type { VideoSessionRecord, VideoSessionType } from "../repositories/types.js";
import type { VideoSessionCtaBlock } from "./responseBlocks.js";

export function detectVideoSessionRequest(
  message: string
): { type: VideoSessionType; topic: string } | null {
  const normalized = message.toLowerCase();
  const hasVideoOrCall =
    /\b(video|call|meeting|meet|jitsi)\b/i.test(normalized) ||
    /(וידאו|שיחת וידאו|שיחה עם|שיחה)/.test(message);
  const asksSales =
    /\b(sales|upgrade|business account|talk to sales|salesperson)\b/i.test(
      normalized
    ) || /(מכירות|שדרוג|חשבון עסקי|איש מכירות)/.test(message);
  const asksSupport =
    /\b(support|help|agent|representative|customer service)\b/i.test(
      normalized
    ) || /(תמיכה|עזרה|נציג|שירות לקוחות)/.test(message);

  if (hasVideoOrCall && asksSales) {
    return { type: "sales", topic: "Sales video request from AI assistant" };
  }

  if (hasVideoOrCall && asksSupport) {
    return { type: "support", topic: "Support video request from AI assistant" };
  }

  return null;
}

export function buildVideoSessionCtaBlock(
  session: VideoSessionRecord,
  containsHebrew: boolean
): VideoSessionCtaBlock {
  const appPath = `/video?sessionId=${encodeURIComponent(session.id)}`;
  const isSales = session.type === "sales";

  return {
    id: `video-session-${session.id}`,
    type: "video_session_cta",
    title: containsHebrew
      ? { text: isSales ? "שיחת וידאו עם מכירות" : "שיחת וידאו עם תמיכה", dir: "rtl" }
      : { text: isSales ? "Sales video session" : "Support video session" },
    sessionId: session.id,
    sessionType: session.type,
    status: session.status,
    ctaLabel: containsHebrew
      ? { text: "פתח באפליקציה", dir: "rtl" }
      : { text: "Open secure video" },
    appPath,
    message: containsHebrew
      ? {
          text: "הסשן נוצר. השתמש בכפתור המאובטח באפליקציה כדי להצטרף.",
          dir: "rtl"
        }
      : {
          text: "The session is ready. Use the secure in-app button to join."
        }
  };
}
