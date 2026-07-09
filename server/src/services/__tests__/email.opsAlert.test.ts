import { sendOpsAlertEmailWithSender } from "../email.service.js";

type SentPayload = { from: string; to: string; subject: string; text: string; html: string };

function fakeSender(behavior: { error?: unknown } = {}) {
  const sent: SentPayload[] = [];
  return {
    sent,
    sender: {
      async send(payload: SentPayload) {
        sent.push(payload);
        return { error: behavior.error };
      }
    }
  };
}

describe("sendOpsAlertEmailWithSender", () => {
  const cleanups: Array<() => void> = [];
  afterEach(() => {
    for (const c of cleanups.splice(0).reverse()) c();
  });

  function silenceConsoleError() {
    const original = console.error;
    console.error = () => {};
    cleanups.push(() => {
      console.error = original;
    });
  }

  test("delivers via the sender and reports delivered:true", async () => {
    const { sent, sender } = fakeSender();
    const result = await sendOpsAlertEmailWithSender("subj", "body", "ops@virly.test", sender);
    expect(result).toEqual({ delivered: true });
    expect(sent).toHaveLength(1);
    expect(sent[0].to).toBe("ops@virly.test");
    expect(sent[0].subject).toBe("subj");
    expect(sent[0].text).toBe("body");
  });

  test("reports delivered:false when there is no sender", async () => {
    silenceConsoleError();
    const result = await sendOpsAlertEmailWithSender("subj", "body", "ops@virly.test", null);
    expect(result).toEqual({ delivered: false });
  });

  test("reports delivered:false when there is no recipient", async () => {
    silenceConsoleError();
    const { sent, sender } = fakeSender();
    const result = await sendOpsAlertEmailWithSender("subj", "body", undefined, sender);
    expect(result).toEqual({ delivered: false });
    expect(sent).toHaveLength(0);
  });

  test("reports delivered:false when the provider returns an error", async () => {
    silenceConsoleError();
    const { sender } = fakeSender({ error: new Error("boom") });
    const result = await sendOpsAlertEmailWithSender("subj", "body", "ops@virly.test", sender);
    expect(result).toEqual({ delivered: false });
  });
});
