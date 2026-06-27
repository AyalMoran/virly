import { Resend } from "resend";
import { config } from "../config.js";

type EmailPayload = {
  from: string;
  to: string;
  subject: string;
  text: string;
  html: string;
};

type EmailSender = {
  send(payload: EmailPayload): Promise<{ error?: unknown }>;
};

function logVerificationFallback(email: string, verificationUrl: string, error?: unknown) {
  if (error) {
    console.error("Verification email delivery failed; logging link instead.", error);
  }

  console.log(`Verification link for ${email}: ${verificationUrl}`);
}

function createResendSender(apiKey: string): EmailSender {
  const resend = new Resend(apiKey);

  return {
    async send(payload) {
      const { error } = await resend.emails.send(payload);
      return { error };
    }
  };
}

function createVerificationEmailPayload(email: string, verificationUrl: string) {
  return {
    from: config.email.from,
    to: email,
    subject: "Verify your Virly account",
    text: `Verify your account by opening this link. It expires in 10 minutes: ${verificationUrl}`,
    html: `
      <p>Verify your Virly account by clicking the button below.</p>
      <p><a href="${verificationUrl}" style="display:inline-block;padding:12px 18px;background:#111827;color:#ffffff;text-decoration:none;border-radius:6px;">Verify account</a></p>
      <p>This link expires in 10 minutes.</p>
    `
  };
}

export async function sendVerificationEmailWithSender(
  email: string,
  verificationUrl: string,
  sender: EmailSender | null
) {
  if (!sender) {
    logVerificationFallback(email, verificationUrl);
    return { delivered: false };
  }

  const result = await sender.send(createVerificationEmailPayload(email, verificationUrl));
  if (result.error) {
    logVerificationFallback(email, verificationUrl, result.error);
    return { delivered: false };
  }

  return { delivered: true };
}

export async function sendVerificationEmail(email: string, verificationUrl: string) {
  const sender = config.email.resendApiKey
    ? createResendSender(config.email.resendApiKey)
    : null;

  return sendVerificationEmailWithSender(email, verificationUrl, sender);
}

export type TransferHoldEmail = {
  amount: number;
  currency: string;
  recipientEmail: string;
  reasons: string[];
  confirmUrl: string;
  cancelUrl: string;
};

function createTransferHoldPayload(email: string, details: TransferHoldEmail) {
  const amountText = `${details.amount} ${details.currency}`;
  const why = details.reasons.length ? ` Reason flagged: ${details.reasons.join(" ")}` : "";
  return {
    from: config.email.from,
    to: email,
    subject: "Confirm your held Virly transfer",
    text:
      `We held a transfer of ${amountText} to ${details.recipientEmail} for review.${why} ` +
      `Confirm to send it: ${details.confirmUrl}  •  Cancel it: ${details.cancelUrl}`,
    html: `
      <p>We held a transfer of <strong>${amountText}</strong> to ${details.recipientEmail} for review.</p>
      ${details.reasons.length ? `<p>Why: ${details.reasons.join(" ")}</p>` : ""}
      <p><a href="${details.confirmUrl}" style="display:inline-block;padding:12px 18px;background:#111827;color:#ffffff;text-decoration:none;border-radius:6px;">Confirm transfer</a></p>
      <p><a href="${details.cancelUrl}">Cancel this transfer</a></p>
    `
  };
}

/** Send the hold-confirmation email; falls back to logging the links (no Resend key). */
export async function sendTransferHoldEmail(email: string, details: TransferHoldEmail) {
  const sender = config.email.resendApiKey
    ? createResendSender(config.email.resendApiKey)
    : null;
  if (!sender) {
    console.log(`Transfer hold for ${email}: confirm ${details.confirmUrl} | cancel ${details.cancelUrl}`);
    return { delivered: false };
  }
  const result = await sender.send(createTransferHoldPayload(email, details));
  if (result.error) {
    console.error("Transfer hold email failed; logging links instead.", result.error);
    console.log(`Transfer hold for ${email}: confirm ${details.confirmUrl} | cancel ${details.cancelUrl}`);
    return { delivered: false };
  }
  return { delivered: true };
}
