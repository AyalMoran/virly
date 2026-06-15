import assert from "node:assert/strict";
import test from "node:test";
import { sendVerificationEmailWithSender } from "./services/email.service.js";
import { config } from "./config.js";


const email = "user@example.com";
const verificationUrl = "https://api.example.com/api/auth/verify?token=abc123";
type CapturedEmailPayload = {
  from: string;
  to: string;
  subject: string;
  text: string;
  html: string;
};



test("missing Resend sender logs verification link and reports undelivered", async (t) => {
  const logs: unknown[][] = [];
  const originalLog = console.log;
  console.log = (...args: unknown[]) => {
    logs.push(args);
  };
  t.after(() => {
    console.log = originalLog;
  });

  const result = await sendVerificationEmailWithSender(email, verificationUrl, null);

  assert.deepEqual(result, { delivered: false });
  assert.deepEqual(logs, [[`Verification link for ${email}: ${verificationUrl}`]]);
});

test("successful Resend delivery reports delivered and sends verification payload", async () => {
  const sentPayloads: CapturedEmailPayload[] = [];

  const result = await sendVerificationEmailWithSender(email, verificationUrl, {
    async send(payload) {
      sentPayloads.push(payload);
      return {};
    }
  });

  assert.deepEqual(result, { delivered: true });
  assert.equal(sentPayloads.length, 1);
  const sentPayload = sentPayloads[0];
  assert.ok(sentPayload);
  assert.equal(sentPayload.from, config.email.from);
  assert.equal(sentPayload.to, email);
  assert.equal(sentPayload.subject, "Verify your Virly account");
  assert.match(sentPayload.text, /expires in 10 minutes/);
  assert.ok(sentPayload.text.includes(verificationUrl));
  assert.ok(sentPayload.html.includes(verificationUrl));
});

test("Resend delivery error logs fallback link and reports undelivered", async (t) => {
  const logs: unknown[][] = [];
  const errors: unknown[][] = [];
  const originalLog = console.log;
  const originalError = console.error;
  const deliveryError = new Error("resend unavailable");

  console.log = (...args: unknown[]) => {
    logs.push(args);
  };
  console.error = (...args: unknown[]) => {
    errors.push(args);
  };
  t.after(() => {
    console.log = originalLog;
    console.error = originalError;
  });

  const result = await sendVerificationEmailWithSender(email, verificationUrl, {
    async send() {
      return { error: deliveryError };
    }
  });

  assert.deepEqual(result, { delivered: false });
  assert.deepEqual(logs, [[`Verification link for ${email}: ${verificationUrl}`]]);
  assert.deepEqual(errors, [
    ["Verification email delivery failed; logging link instead.", deliveryError]
  ]);
});
