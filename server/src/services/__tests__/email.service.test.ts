import { sendVerificationEmailWithSender } from "../email.service.js";
import { config } from "../../config.js";

const email = "user@example.com";
const verificationUrl = "https://api.example.com/api/auth/verify?token=abc123";
type CapturedEmailPayload = {
  from: string;
  to: string;
  subject: string;
  text: string;
  html: string;
};

const cleanups: Array<() => void | Promise<void>> = [];
afterEach(async () => { for (const c of cleanups.splice(0).reverse()) await c(); });

test("missing Resend sender logs verification link and reports undelivered", async () => {
  const logs: unknown[][] = [];
  const originalLog = console.log;
  console.log = (...args: unknown[]) => {
    logs.push(args);
  };
  cleanups.push(() => { console.log = originalLog; });

  const result = await sendVerificationEmailWithSender(email, verificationUrl, null);

  expect(result).toStrictEqual({ delivered: false });
  expect(logs).toStrictEqual([[`Verification link for ${email}: ${verificationUrl}`]]);
});

test("successful Resend delivery reports delivered and sends verification payload", async () => {
  const sentPayloads: CapturedEmailPayload[] = [];

  const result = await sendVerificationEmailWithSender(email, verificationUrl, {
    async send(payload) {
      sentPayloads.push(payload);
      return {};
    }
  });

  expect(result).toStrictEqual({ delivered: true });
  expect(sentPayloads.length).toBe(1);
  const sentPayload = sentPayloads[0];
  expect(sentPayload).toBeTruthy();
  expect(sentPayload!.from).toBe(config.email.from);
  expect(sentPayload!.to).toBe(email);
  expect(sentPayload!.subject).toBe("Verify your Virly account");
  expect(sentPayload!.text).toMatch(/expires in 10 minutes/);
  expect(sentPayload!.text.includes(verificationUrl)).toBeTruthy();
  expect(sentPayload!.html.includes(verificationUrl)).toBeTruthy();
});

test("Resend delivery error logs fallback link and reports undelivered", async () => {
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
  cleanups.push(() => { console.log = originalLog; console.error = originalError; });

  const result = await sendVerificationEmailWithSender(email, verificationUrl, {
    async send() {
      return { error: deliveryError };
    }
  });

  expect(result).toStrictEqual({ delivered: false });
  expect(logs).toStrictEqual([[`Verification link for ${email}: ${verificationUrl}`]]);
  expect(errors).toStrictEqual([
    ["Verification email delivery failed; logging link instead.", deliveryError]
  ]);
});
